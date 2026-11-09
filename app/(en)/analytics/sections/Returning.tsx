import { ErrorNote, ODD_LAST_WIDE, Section, Stat, fmtDate } from '../ui';
import { NoRecordings, type Visits } from './AmplitudeHeader';

export function ReturningSection({ visits }: { visits: Visits }) {
  const v = visits.ok ? visits.value : null;
  const note = v
    ? `${fmtDate(v.replayWindow.start)} – today. A person is one browser; Amplitude remembers them across days while they keep its cookie.${v.sampled ? ' (most recent 60 people)' : ''}`
    : 'A person is one browser; Amplitude remembers them across days while they keep its cookie.';
  return (
    <Section title="Returning readers" note={note}>
      {!visits.ok ? (
        <ErrorNote error={visits} />
      ) : !v ? (
        <NoRecordings />
      ) : (
        <div className={`grid grid-cols-2 md:grid-cols-5 gap-3 ${ODD_LAST_WIDE}`}>
          <Stat tall label="People" value={v.returning.people} />
          <Stat tall label="Had visited before" value={v.returning.visitedBefore} sub={`first came before ${fmtDate(v.replayWindow.start)}`} />
          <Stat tall label="First visit" value={v.returning.firstVisit} sub="new in this period" />
          <Stat tall label="Came back another day" value={v.returning.cameBackAnotherDay} sub={`of ${v.returning.people} people`} />
          {v.returning.d7.eligible > 0 ? (
            <Stat tall label="New, back within 7 days" value={`${v.returning.d7.back} of ${v.returning.d7.eligible}`} sub="first seen at least 7 days ago" />
          ) : (
            <Stat tall label="New, back within 7 days" value="–" sub="none old enough yet" />
          )}
        </div>
      )}
    </Section>
  );
}
