import { gzipSync } from 'node:zlib';
import { cookies } from 'next/headers';
import { isValidSession, SESSION_COOKIE } from '@/lib/analytics/adminAuth';
import { getReplayFileUrls } from '@/lib/analytics/amplitude';
import { isValidReplayId, mergeReplayEvents } from '@/lib/analytics/replay';

/**
 * One session recording for the player on /analytics: `?id=<deviceId>/<sessionId>`.
 * Amplitude's storage sends no CORS headers, so the browser can't fetch the
 * files itself; this route fetches them (presigned URLs, 15 minutes), merges
 * the rrweb events in time order and returns them gzipped. Nothing is stored.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Vercel caps a function response at 4.5 MB; stay under it. */
const MAX_BODY_BYTES = 4 * 1024 * 1024;

const json = (status: number, body: unknown) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function GET(request: Request): Promise<Response> {
  const session = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!isValidSession(session)) return json(401, { error: 'Not signed in.' });

  const id = new URL(request.url).searchParams.get('id');
  if (!isValidReplayId(id)) return json(400, { error: 'Bad replay id.' });

  let urls: string[];
  try {
    urls = await getReplayFileUrls(id);
  } catch (err) {
    // Amplitude answers 404 for a replay it no longer has (kept 30 days).
    if (err instanceof Error && err.message.startsWith('Amplitude 404')) return json(404, { error: 'No recording found.' });
    return json(502, { error: 'Amplitude request failed.' });
  }
  if (urls.length === 0) return json(404, { error: 'No recording files for this replay.' });

  let files: unknown[];
  try {
    files = await Promise.all(urls.map(async url => {
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error(`Recording file download failed (${res.status}).`);
      return res.json() as Promise<unknown>; // Node's fetch undoes the gzip
    }));
  } catch (err) {
    return json(502, { error: err instanceof Error ? err.message : 'Recording download failed.' });
  }

  const events = mergeReplayEvents(files);
  if (events.length === 0) return json(404, { error: 'The recording is empty.' });

  const body = gzipSync(JSON.stringify(events));
  if (body.length > MAX_BODY_BYTES) {
    return json(413, { error: 'This recording is too large to play here. Open it in Amplitude instead.' });
  }
  return new Response(new Uint8Array(body), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Encoding': 'gzip',
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
