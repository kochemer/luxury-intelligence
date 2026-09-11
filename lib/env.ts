/**
 * Shared environment variable loading utility.
 * 
 * Handles UTF-16/UTF-16LE encoded .env.local files (common when edited in PowerShell/Windows).
 * Safe to call multiple times - only sets vars not already present in process.env.
 * 
 * Usage:
 *   import { loadEnv } from '@/lib/env';
 *   loadEnv(); // Call at top of script, before accessing env vars
 */

import { readFileSync } from 'fs';
import path from 'path';
import { parse } from 'dotenv';

/**
 * Load environment variables from .env.local at project root.
 * 
 * Features:
 * - Handles UTF-16 LE with BOM (FF FE)
 * - Handles UTF-16 BE with BOM (FE FF)
 * - Handles UTF-16 LE without BOM (detected by null bytes)
 * - Falls back to UTF-8
 * - Only sets vars not already in process.env (preserves existing)
 * - Safe if .env.local doesn't exist
 */
/**
 * Which of the encodings we support a .env file is stored in.
 * Exported so a writer can round-trip the file in its original encoding —
 * rewriting a UTF-16 .env.local as UTF-8 would break every variable in it,
 * not just the ones being changed.
 */
export type EnvEncoding = 'utf16le-bom' | 'utf16be-bom' | 'utf16le' | 'utf8';

export function detectEnvEncoding(buffer: Buffer): EnvEncoding {
  if (buffer.length >= 2 && buffer[0] === 0xFF && buffer[1] === 0xFE) return 'utf16le-bom';
  if (buffer.length >= 2 && buffer[0] === 0xFE && buffer[1] === 0xFF) return 'utf16be-bom';
  if (buffer.length > 1 && buffer[1] === 0 && buffer[0] !== 0) return 'utf16le';
  return 'utf8';
}

/** Decode a .env buffer to text, handling the UTF-16 variants PowerShell produces. */
export function decodeEnvBuffer(buffer: Buffer, encoding = detectEnvEncoding(buffer)): string {
  switch (encoding) {
    case 'utf16le-bom':
      return buffer.toString('utf16le', 2);
    case 'utf16be-bom': {
      // Byte-swap BE → LE so Node can decode it.
      const le = Buffer.alloc(buffer.length - 2);
      for (let i = 2; i < buffer.length; i += 2) {
        le[i - 2] = buffer[i + 1]!;
        le[i - 1] = buffer[i]!;
      }
      return le.toString('utf16le');
    }
    case 'utf16le':
      return buffer.toString('utf16le');
    default:
      return buffer.toString('utf-8');
  }
}

/** Inverse of decodeEnvBuffer — re-encode text in the file's original encoding. */
export function encodeEnvContent(content: string, encoding: EnvEncoding): Buffer {
  switch (encoding) {
    case 'utf16le-bom':
      return Buffer.concat([Buffer.from([0xFF, 0xFE]), Buffer.from(content, 'utf16le')]);
    case 'utf16be-bom': {
      const le = Buffer.from(content, 'utf16le');
      const be = Buffer.alloc(le.length);
      for (let i = 0; i < le.length; i += 2) {
        be[i] = le[i + 1]!;
        be[i + 1] = le[i]!;
      }
      return Buffer.concat([Buffer.from([0xFE, 0xFF]), be]);
    }
    case 'utf16le':
      return Buffer.from(content, 'utf16le');
    default:
      return Buffer.from(content, 'utf-8');
  }
}

export function loadEnv(): void {
  const envPath = path.join(process.cwd(), '.env.local');

  try {
    const buffer = readFileSync(envPath);
    const contentToParse = decodeEnvBuffer(buffer);

    const parsed = parse(contentToParse);
    
    // Only set vars that aren't already defined (preserve existing)
    for (const [key, value] of Object.entries(parsed)) {
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch (err) {
    // .env.local not found or unreadable - silently continue
    // This is expected in production where env vars come from the platform
  }
}
