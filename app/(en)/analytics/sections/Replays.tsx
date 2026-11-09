import { AMPLITUDE_PROJECT_ID } from '@/lib/analytics/amplitude';
import { cameFromText, copenhagenWhen, dayMonth, formatDuration, pagePath, placeText, visitorLetters } from '@/lib/analytics/display';
import { classifyReferrer } from '@/seo/analytics/visitors';
import ReplayList, { type ReplayRow } from '../ReplayList';
import { EmptyNote, ErrorNote, Section } from '../ui';
import { NoRecordings, type Visits } from './AmplitudeHeader';

const MAX_ROWS = 12;

const ACTION_BADGES = { subscribed: 'Subscribed', digest: 'Read the digest', article: 'Opened an article' } as const;

/** Deep link into Amplitude's own replay view; only built when AMPLITUDE_ORG is set. */
function amplitudeLink(replayId: string): string | null {
  const org = process.env.AMPLITUDE_ORG?.trim();
  if (!org) return null;
  return `https://app.eu.amplitude.com/analytics/${encodeURIComponent(org)}/session-replay/project/${AMPLITUDE_PROJECT_ID}/search/replay?sessionReplayId=${encodeURIComponent(replayId)}`;
}

export function ReplaysSection({ visits }: { visits: Visits }) {
  const v = visits.ok ? visits.value : null;
  const sessions = v ? [...v.sessions].sort((a, b) => b.start.localeCompare(a.start)).slice(0, MAX_ROWS) : [];

  // Letters come from the people in the list, never from their ids: nothing identifying reaches the browser.
  const letters = visitorLetters(sessions.map(s => s.personId));
  const rows: ReplayRow[] = sessions.map(s => {
    const from = cameFromText(s.cameFrom, classifyReferrer);
    const letter = letters.get(s.personId) ?? '?';
    return {
      replayId: s.replayId,
      when: copenhagenWhen(s.start),
      visitor: `Visitor ${letter}`,
      firstVisit: s.firstVisit,
      since: !s.firstVisit && s.firstSeen ? `since ${dayMonth(s.firstSeen)}` : null,
      pages: pagePath(s.paths),
      from: from.label,
      fromNote: from.note ? `(${from.note})` : null,
      fromTitle: from.title ?? null,
      place: placeText(s.city, s.country),
      device: s.device,
      badges: s.actions.map(a => ACTION_BADGES[a]),
      length: formatDuration(s.durationS),
      pageCount: `${s.pages} ${s.pages === 1 ? 'page' : 'pages'}`,
      amplitudeUrl: amplitudeLink(s.replayId),
    };
  });

  const note = rows.length
    ? `The ${rows.length === 1 ? 'most recent recording' : `${rows.length} most recent recordings`} (up to ${MAX_ROWS}), newest first. Copenhagen time. Amplitude keeps recordings 30 days.`
    : 'The 12 most recent recordings, newest first. Copenhagen time. Amplitude keeps recordings 30 days.';

  return (
    <Section title="Session replays" note={note}>
      {!visits.ok ? (
        <ErrorNote error={visits} />
      ) : !v ? (
        <NoRecordings />
      ) : rows.length === 0 ? (
        <EmptyNote>No recordings in this period yet.</EmptyNote>
      ) : (
        <ReplayList rows={rows} />
      )}
    </Section>
  );
}
