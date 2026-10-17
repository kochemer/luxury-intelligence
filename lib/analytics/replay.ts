/**
 * Pure helpers for the /analytics replay route: validating the id the browser
 * sends, and merging a replay's files into one time-ordered rrweb event list.
 * No I/O here; the route handler fetches the files.
 */

const DEVICE_ID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}R?';
const SESSION_ID = '\\d{10,16}';
const REPLAY_ID = new RegExp(`^(${DEVICE_ID})/(${SESSION_ID})$`);

/** `<deviceId>/<sessionId>`: a UUID, a slash, a 10-16 digit session id. Nothing else passes. */
export function isValidReplayId(id: unknown): id is string {
  return typeof id === 'string' && REPLAY_ID.test(id);
}

/** An rrweb event: `type` and `timestamp` are the only fields the merge needs. */
export interface ReplayEvent { type: number; timestamp: number; [key: string]: unknown }

function isEvent(e: unknown): e is ReplayEvent {
  return typeof e === 'object' && e !== null
    && typeof (e as ReplayEvent).timestamp === 'number'
    && Number.isFinite((e as ReplayEvent).timestamp);
}

/**
 * Flatten a replay's files (each a JSON array of events) and sort by
 * timestamp. The sort is stable, so events sharing a timestamp (meta, then
 * full snapshot) keep their file order. Anything that isn't an event is dropped.
 */
export function mergeReplayEvents(files: unknown[]): ReplayEvent[] {
  const events: ReplayEvent[] = [];
  for (const file of files) {
    if (!Array.isArray(file)) continue;
    for (const e of file) if (isEvent(e)) events.push(e);
  }
  return events.sort((a, b) => a.timestamp - b.timestamp);
}
