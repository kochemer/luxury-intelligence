import type { TaggedLanding, TaggedLandings } from '@/lib/analytics/amplitude';
import { campaignLabel, contentLabel, pageName, sourceLabel } from '@/lib/analytics/display';
import { EmptyNote, ErrorNote, Section, fmtDate, type Settled } from '../ui';

const visitsText = (n: number) => `${n.toLocaleString('en-GB')} ${n === 1 ? 'visit' : 'visits'}`;
const peopleText = (n: number) => `${n.toLocaleString('en-GB')} ${n === 1 ? 'person' : 'people'}`;

/** "X · W42 · story Tue" for a social post, "Newsletter · W41 · read online" for the rest. */
function rowLabel(r: TaggedLanding): string {
  return [
    sourceLabel(r.source),
    r.campaign && campaignLabel(r.campaign),
    r.content && contentLabel(r.content),
  ].filter(Boolean).join(' · ');
}

export function SocialSection({ tagged }: { tagged: Settled<TaggedLandings | null> }) {
  const t = tagged.ok ? tagged.value : null;
  return (
    <Section
      title="Social posts"
      note={`Visits that arrived through a tagged link, from ${t ? fmtDate(t.window.start) : 'the day cookies were accepted'}. Social posts first, other tagged links beside them.`}
    >
      {!tagged.ok ? (
        <ErrorNote error={tagged} />
      ) : !t ? (
        <EmptyNote>No tagged-link data for this period.</EmptyNote>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-8">
          <div>
            <p className="text-meta font-semibold text-[var(--color-text-primary)] mb-2">From social posts</p>
            {t.social.length === 0 ? (
              <EmptyNote>No visits from social posts yet.</EmptyNote>
            ) : (
              <ul className="text-[13px] divide-y divide-[var(--color-border)]">
                {t.social.map((r, i) => (
                  <li key={i} className="flex flex-col sm:flex-row sm:justify-between gap-x-4 py-1.5">
                    <span className="min-w-0 text-[var(--color-text-secondary)]">{rowLabel(r)}</span>
                    <span className="tabular-nums text-[var(--color-text-primary)] sm:shrink-0 sm:text-right">
                      {visitsText(r.visits)} · {peopleText(r.people)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="text-meta font-semibold text-[var(--color-text-primary)] mb-2">Other tagged links</p>
            {t.other.length === 0 ? (
              <EmptyNote>No other tagged links in this period.</EmptyNote>
            ) : (
              <ul className="text-[13px] divide-y divide-[var(--color-border)]">
                {t.other.map((r, i) => (
                  <li key={i} className="flex flex-col sm:flex-row sm:justify-between gap-x-4 py-1.5">
                    <span className="min-w-0 text-[var(--color-text-secondary)]">
                      {rowLabel(r)} → {pageName(r.path)}
                    </span>
                    <span className="tabular-nums text-[var(--color-text-primary)] sm:shrink-0">{visitsText(r.visits)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Section>
  );
}
