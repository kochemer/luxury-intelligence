import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyTopic } from '../classification/classifyTopics';

const base = { url: 'https://example.com/a' };

test('off-topic design article (Dezeen) is dropped (null), not dumped into Ecommerce', () => {
  const r = classifyTopic({
    ...base,
    title: 'Office of Tangible Space transforms Brooklyn warehouse into automotive showroom',
    source: 'Dezeen',
    snippet: 'A design studio has converted a brick warehouse into a light-filled interior.',
  });
  assert.equal(r, null);
});

test('"Goldman Sachs" finance story does NOT land in Jewellery', () => {
  const r = classifyTopic({
    ...base,
    title: 'Solomon’s third act at Goldman Sachs may be the most dramatic yet',
    source: 'Financial Times - Technology',
    snippet: 'The bank’s chief executive faces a pivotal year.',
  });
  assert.notEqual(r, 'Jewellery_Industry');
});

test('gold/silver as commodities do NOT land in Jewellery', () => {
  const r1 = classifyTopic({ ...base, title: 'Silver tops $100 as global turmoil fuels run for safe havens', source: 'Bloomberg - Technology' });
  const r2 = classifyTopic({ ...base, title: 'Hong Kong to sign MOU with Shanghai Gold Exchange', source: 'Bloomberg - Technology' });
  assert.notEqual(r1, 'Jewellery_Industry');
  assert.notEqual(r2, 'Jewellery_Industry');
});

test('genuine jewellery story still classifies as Jewellery', () => {
  const r = classifyTopic({
    ...base,
    title: 'Cartier unveils high-jewellery collection with rare gemstones and diamonds',
    source: 'Some Magazine',
    snippet: 'The maison presented new pieces featuring carat-heavy stones.',
  });
  assert.equal(r, 'Jewellery_Industry');
});

test('jewellery source override still routes to Jewellery', () => {
  const r = classifyTopic({ ...base, title: 'Retail sales update for the quarter', source: 'Professional Jeweller' });
  assert.equal(r, 'Jewellery_Industry');
});

test('genuine ecommerce story classifies as Ecommerce', () => {
  const r = classifyTopic({
    ...base,
    title: 'Shopify adds one-click checkout to cut cart abandonment',
    source: 'Some Blog',
    snippet: 'The platform aims to improve conversion at checkout.',
  });
  assert.equal(r, 'Ecommerce_Retail_Tech');
});

test('AI story classifies as AI', () => {
  const r = classifyTopic({
    ...base,
    title: 'OpenAI releases a new large language model',
    source: 'Some Blog',
    snippet: 'The generative AI model improves reasoning benchmarks.',
  });
  assert.equal(r, 'AI_and_Strategy');
});

test('a truly generic article with no topical signal is dropped (null)', () => {
  const r = classifyTopic({
    ...base,
    title: 'Local council debates new parking rules downtown',
    source: 'City Herald',
    snippet: 'Residents weighed in at a public meeting.',
  });
  assert.equal(r, null);
});
