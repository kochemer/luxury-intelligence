/**
 * Unified cache path management utility.
 * 
 * All non-week cache artifacts live under: data/cache/
 * Week artifacts stay under: data/weeks/{week}/...
 * 
 * Features:
 * - Centralized path definitions
 * - Backward compatibility: reads from new path first, falls back to old path
 * - Writes only to new paths
 * - Auto-creates directories as needed
 */

import { promises as fs } from 'fs';
import path from 'path';

// Base directories
const DATA_DIR = path.join(process.cwd(), 'data');
const CACHE_DIR = path.join(DATA_DIR, 'cache');

// Cache kind to filename mapping
const CACHE_FILENAMES: Record<string, string> = {
  rerank: 'rerank.json',
  intro: 'intro.json',
  themes: 'themes.json',
  'editorial-take': 'editorial-take.json',
  scene_director: 'scene_director.json',
  classification: 'classification.json',
  query_director: 'query_director.json',
  selection_triage: 'selection_triage.json',
  selection_judge: 'selection_judge.json',
};

// Old paths for backward compatibility (relative to DATA_DIR)
const OLD_CACHE_PATHS: Record<string, string> = {
  rerank: 'rerank_cache.json',
  intro: 'intro_cache.json',
  themes: 'themes_cache.json',
  scene_director: 'scene_director_cache.json',
  classification: 'classification_cache.json',
  query_director: 'query_director_cache.json',
};

/**
 * Get the new cache path for a given cache kind.
 * @param kind - Cache kind (e.g., 'rerank', 'intro', 'themes')
 * @returns Absolute path to the cache file
 */
export function getCachePath(kind: string): string {
  const filename = CACHE_FILENAMES[kind];
  if (!filename) {
    throw new Error(`Unknown cache kind: ${kind}`);
  }
  return path.join(CACHE_DIR, filename);
}

/**
 * Get the old (legacy) cache path for backward compatibility.
 * @param kind - Cache kind
 * @returns Absolute path to the old cache file, or null if no old path exists
 */
export function getOldCachePath(kind: string): string | null {
  const oldFilename = OLD_CACHE_PATHS[kind];
  if (!oldFilename) {
    return null;
  }
  return path.join(DATA_DIR, oldFilename);
}

/**
 * Read JSON cache with fallback to old path.
 * Tries new path first, then falls back to old path if new path doesn't exist.
 * 
 * @param kind - Cache kind
 * @returns Parsed JSON object, or null if neither path exists
 */
export async function readJsonCache<T = unknown>(kind: string): Promise<T | null> {
  const newPath = getCachePath(kind);
  const oldPath = getOldCachePath(kind);

  // Try new path first
  try {
    const content = await fs.readFile(newPath, 'utf-8');
    return JSON.parse(content) as T;
  } catch (err: any) {
    if (err.code !== 'ENOENT') {
      console.warn(`[Cache] Failed to read ${newPath}: ${err.message}`);
    }
  }

  // Fallback to old path
  if (oldPath) {
    try {
      const content = await fs.readFile(oldPath, 'utf-8');
      console.warn(`[Cache] fallback used: ${oldPath} -> ${newPath}`);
      return JSON.parse(content) as T;
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        console.warn(`[Cache] Failed to read ${oldPath}: ${err.message}`);
      }
    }
  }

  return null;
}

/**
 * Write JSON cache to the new path.
 * Auto-creates the cache directory if needed.
 * 
 * @param kind - Cache kind
 * @param data - Data to write
 */
export async function writeJsonCache(kind: string, data: unknown): Promise<void> {
  const newPath = getCachePath(kind);
  
  try {
    // Ensure cache directory exists
    await fs.mkdir(CACHE_DIR, { recursive: true });
    
    // Atomic: write a temp file then rename over the target (no torn files on crash)
    const tmp = `${newPath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
    try {
      await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8');
      await fs.rename(tmp, newPath);
    } catch (e) {
      await fs.unlink(tmp).catch(() => {});
      throw e;
    }
  } catch (err: any) {
    console.warn(`[Cache] Failed to write ${newPath}: ${err.message}`);
    throw err;
  }
}

/**
 * Check if a cache file exists (checks new path first, then old path).
 * @param kind - Cache kind
 * @returns true if cache exists at either path
 */
export async function cacheExists(kind: string): Promise<boolean> {
  const newPath = getCachePath(kind);
  const oldPath = getOldCachePath(kind);

  try {
    await fs.access(newPath);
    return true;
  } catch {
    // New path doesn't exist, check old path
  }

  if (oldPath) {
    try {
      await fs.access(oldPath);
      return true;
    } catch {
      // Neither exists
    }
  }

  return false;
}

/**
 * Get all known cache kinds.
 */
export function getCacheKinds(): string[] {
  return Object.keys(CACHE_FILENAMES);
}
