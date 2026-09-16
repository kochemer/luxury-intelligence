/**
 * Smoke tests for pipeline components
 * 
 * Tests key invariants without requiring network calls or LLM access.
 * Uses Node's built-in test runner (node:test).
 * 
 * Run with: npm test
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { classifyTopic } from '../classification/classifyTopics';
import { getSiteUrl } from '../lib/utils/siteUrl';
import type { WeeklyDigest, Topic } from '../lib/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Load a digest from JSON file (read-only, no network/LLM calls)
 */
async function loadDigest(weekLabel: string): Promise<WeeklyDigest | null> {
  try {
    const digestPath = path.join(__dirname, '..', 'data', 'digests', `${weekLabel}.json`);
    const raw = await fs.readFile(digestPath, 'utf-8');
    return JSON.parse(raw) as WeeklyDigest;
  } catch {
    return null;
  }
}

test('Weekly digest structure validation', async () => {
  // Load an existing digest (2026-W05 or fallback to any available)
  const weekLabel = '2026-W05';
  const digest = await loadDigest(weekLabel);

  // Skip test if digest doesn't exist (graceful degradation)
  if (!digest) {
    console.log(`Skipping digest structure test: ${weekLabel}.json not found`);
    return;
  }

  // Validate required keys exist
  assert(typeof digest.weekLabel === 'string', 'weekLabel must be a string');
  assert(digest.weekLabel.length > 0, 'weekLabel must not be empty');
  assert(/^\d{4}-W\d{1,2}$/.test(digest.weekLabel), 'weekLabel must match YYYY-W## format');

  assert(typeof digest.tz === 'string', 'tz must be a string');
  assert(typeof digest.startISO === 'string', 'startISO must be a string');
  assert(typeof digest.endISO === 'string', 'endISO must be a string');

  // Validate topics structure
  assert(digest.topics !== null && typeof digest.topics === 'object', 'topics must be an object');

  const expectedTopics: Topic[] = [
    'AI_and_Strategy',
    'Ecommerce_Retail_Tech',
    'Luxury_and_Consumer',
    'Jewellery_Industry',
  ];

  for (const topicKey of expectedTopics) {
    assert(topicKey in digest.topics, `topics must have ${topicKey} key`);
    const topic = digest.topics[topicKey];
    assert(typeof topic === 'object', `${topicKey} must be an object`);
    assert(Array.isArray(topic.top), `${topicKey}.top must be an array`);
    assert(typeof topic.total === 'number', `${topicKey}.total must be a number`);

    // Validate articles in topic have required fields
    for (const article of topic.top) {
      assert(typeof article === 'object', 'Article must be an object');
      assert(typeof article.title === 'string', 'Article must have title string');
      assert(article.title.length > 0, 'Article title must not be empty');
      assert(typeof article.url === 'string', 'Article must have url string');
      assert(article.url.length > 0, 'Article url must not be empty');
      assert(typeof article.source === 'string', 'Article must have source string');
      assert(article.source.length > 0, 'Article source must not be empty');
      // published_at and ingested_at are required core fields
      assert(typeof article.published_at === 'string', 'Article must have published_at string');
      assert(typeof article.ingested_at === 'string', 'Article must have ingested_at string');
    }
  }

  // Validate totals structure
  assert(digest.totals !== null && typeof digest.totals === 'object', 'totals must be an object');
  assert(typeof digest.totals.total === 'number', 'totals.total must be a number');
  assert(typeof digest.totals.byTopic === 'object', 'totals.byTopic must be an object');
  assert(typeof digest.totals.byTopic.AIStrategy === 'number', 'totals.byTopic.AIStrategy must be a number');
  assert(typeof digest.totals.byTopic.EcommerceRetail === 'number', 'totals.byTopic.EcommerceRetail must be a number');
  assert(typeof digest.totals.byTopic.LuxuryConsumer === 'number', 'totals.byTopic.LuxuryConsumer must be a number');
  assert(typeof digest.totals.byTopic.Jewellery === 'number', 'totals.byTopic.Jewellery must be a number');
});

test('classifyTopic returns a valid Topic or null', () => {
  // A clearly AI article should classify as AI (non-null).
  const article = {
    title: 'New AI Model Released',
    url: 'https://example.com/article',
    source: 'Tech News',
    snippet: 'A new artificial intelligence model has been released',
  };

  const result = classifyTopic(article);

  // Result is either one of the four topics or null (off-topic → dropped).
  const validTopics: Array<Topic | null> = [
    'AI_and_Strategy',
    'Ecommerce_Retail_Tech',
    'Luxury_and_Consumer',
    'Jewellery_Industry',
    null,
  ];

  assert(
    validTopics.includes(result),
    `classifyTopic must return a valid Topic or null, got: ${result}`
  );
  // This particular article has a strong AI signal, so it must not be dropped.
  assert.equal(result, 'AI_and_Strategy');
});

test('getSiteUrl returns valid absolute URL', () => {
  const url = getSiteUrl();

  // Assert it's a non-empty string
  assert(typeof url === 'string', 'getSiteUrl must return a string');
  assert(url.length > 0, 'getSiteUrl must return a non-empty string');

  // Assert it begins with https:// or http://
  assert(
    url.startsWith('https://') || url.startsWith('http://'),
    `getSiteUrl must return an absolute URL starting with https:// or http://, got: ${url}`
  );

  // Validate it's parseable as a URL
  try {
    const urlObj = new URL(url);
    assert(urlObj.protocol === 'https:' || urlObj.protocol === 'http:', 'URL must have valid protocol');
    assert(urlObj.hostname.length > 0, 'URL must have a hostname');
  } catch (error) {
    assert.fail(`getSiteUrl returned invalid URL: ${url} - ${(error as Error).message}`);
  }
});
