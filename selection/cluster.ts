/**
 * Stage 2: story clusters (same event -> one cluster).
 * Spec §2. Embeddings: text-embedding-3-small. Centroid-based greedy clustering,
 * so near-duplicates merge but A~B~C chains do not.
 */
import OpenAI from 'openai';
import { OPENAI_REQUEST_OPTIONS } from './types';
import type { Article } from '../lib/types';
import type { StoryCluster } from './types';

export const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBED_BATCH = 256;

export interface ClusterOpts {
  /** cosine to centroid needed to join (default env SELECTION_CLUSTER_SIM or 0.86) */
  sim?: number;
  /** cosine to the cluster's seed also needed (default 0.80) */
  seedSim?: number;
}

export interface ClusterItem {
  url: string;
  source: string;
}

export function embeddingText(a: Pick<Article, 'title' | 'snippet'>): string {
  return `${a.title || ''}\n${(a.snippet || '').slice(0, 200)}`.trim();
}

export async function embedTexts(
  texts: string[],
  client?: OpenAI,
): Promise<{ vectors: number[][]; tokens: number }> {
  const openai = client ?? new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const vectors: number[][] = [];
  let tokens = 0;
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    const batch = texts.slice(i, i + EMBED_BATCH).map(t => t || ' ');
    const res = await openai.embeddings.create({ model: EMBEDDING_MODEL, input: batch }, OPENAI_REQUEST_OPTIONS);
    const sorted = [...res.data].sort((a, b) => a.index - b.index);
    for (const d of sorted) vectors.push(d.embedding);
    tokens += res.usage?.total_tokens ?? 0;
  }
  return { vectors, tokens };
}

function norm(v: number[]): number[] {
  let s = 0;
  for (const x of v) s += x * x;
  const n = Math.sqrt(s) || 1;
  return v.map(x => x / n);
}

function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/**
 * Pure. Greedy in the given order: join the first cluster whose centroid cosine
 * >= sim AND seed cosine >= seedSim, else seed a new cluster. Deterministic for a
 * fixed order. Cluster ids are c0001, c0002, ... in seed order.
 */
export function clusterByVectors(items: ClusterItem[], vectors: number[][], opts: ClusterOpts = {}): StoryCluster[] {
  if (items.length !== vectors.length) throw new Error('clusterByVectors: items/vectors length mismatch');
  const sim = opts.sim ?? (Number(process.env.SELECTION_CLUSTER_SIM) || 0.86);
  const seedSim = opts.seedSim ?? 0.8;

  interface Work {
    seed: number[];
    sum: number[];
    centroid: number[];
    members: string[];
    sources: Set<string>;
  }
  const work: Work[] = [];

  for (let i = 0; i < items.length; i++) {
    const v = norm(vectors[i]);
    let target: Work | null = null;
    for (const c of work) {
      if (dot(v, c.centroid) >= sim && dot(v, c.seed) >= seedSim) {
        target = c;
        break;
      }
    }
    if (!target) {
      work.push({ seed: v, sum: [...v], centroid: v, members: [items[i].url], sources: new Set([items[i].source]) });
    } else {
      for (let k = 0; k < v.length; k++) target.sum[k] += v[k];
      target.centroid = norm(target.sum);
      target.members.push(items[i].url);
      target.sources.add(items[i].source);
    }
  }

  return work.map((c, idx) => ({
    clusterId: `c${String(idx + 1).padStart(4, '0')}`,
    members: c.members,
    coverage: c.sources.size,
  }));
}

export interface ClusterArticlesResult {
  clusters: StoryCluster[];
  clusterIdByUrl: Map<string, string>;
  warnings: string[];
  embeddingTokens: number;
}

function singletons(sorted: Article[]): StoryCluster[] {
  return sorted.map((a, i) => ({
    clusterId: `c${String(i + 1).padStart(4, '0')}`,
    members: [a.url],
    coverage: 1,
  }));
}

export async function clusterArticles(articles: Article[], opts: ClusterOpts = {}): Promise<ClusterArticlesResult> {
  const sorted = [...articles].sort((a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0));
  const warnings: string[] = [];
  let clusters: StoryCluster[];
  let embeddingTokens = 0;
  try {
    if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not set');
    const { vectors, tokens } = await embedTexts(sorted.map(embeddingText));
    embeddingTokens = tokens;
    clusters = clusterByVectors(sorted.map(a => ({ url: a.url, source: a.source })), vectors, opts);
  } catch (err) {
    const msg = `[cluster] embedding failed, using singleton clusters: ${(err as Error).message}`;
    console.warn(msg);
    warnings.push(msg);
    clusters = singletons(sorted);
  }
  const clusterIdByUrl = new Map<string, string>();
  for (const c of clusters) for (const u of c.members) clusterIdByUrl.set(u, c.clusterId);
  return { clusters, clusterIdByUrl, warnings, embeddingTokens };
}
