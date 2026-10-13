/**
 * Reader-facing source name. Ingestion keys some feeds as
 * "Business of Fashion (via Bing News)" (see ingestion/sources.ts); the suffix
 * is pipeline plumbing and must stay in the data, but readers should see the
 * publisher only.
 */
export function displaySourceName(source: string): string {
  return source.replace(/\s*\(via (Bing|Google) News\)\s*$/i, '').trim();
}
