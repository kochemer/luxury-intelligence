import { formatDuration } from '@/lib/analytics/display';
import { ErrorNote, OrderedBars, Section, Stat, fmtDate } from '../ui';
import { NoRecordings, type Visits } from './AmplitudeHeader';

export function EngagementSection({ visits }: { visits: Visits }) {
  const v = visits.ok ? visits.value : null;
  const note = v
    ? `${fmtDate(v.replayWindow.start)} – today. Visit length is the length of the session recording: from arrival to the last scroll or click.`
    : 'Visit length is the length of the session recording: from arrival to the last scroll or click.';
  const e = v?.engagement;
  return (
    <Section title="Engagement" note={note}>
      {!visits.ok ? (
        <ErrorNote error={visits} />
      ) : !v || !e ? (
        <NoRecordings />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat tall label="Visits" value={e.sessions} />
            <Stat
              label="Pages per visit"
              value={e.pagesPerVisit === null ? '–' : e.pagesPerVisit.toLocaleString('en-GB')}
              sub={`${e.pageviews.toLocaleString('en-GB')} page views`}
            />
            <Stat tall label="Median visit" value={e.medianDurationS === null ? '–' : formatDuration(e.medianDurationS)} />
            <Stat tall label="Visits over 3 min" value={e.over3min} sub={`of ${e.sessions}`} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-8 mt-8">
            <OrderedBars title="Visit length" unit="visits" rows={e.buckets.map(b => [b.label, b.count])} />
          </div>
        </>
      )}
    </Section>
  );
}
