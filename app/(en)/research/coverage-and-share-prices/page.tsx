/**
 * /research/coverage-and-share-prices: does trade-press coverage lead the
 * share price? Reads data/review/<year>.json (review/build.ts). Every number
 * in the copy comes from that file; findings and caveats in docs/year-review.md.
 */

import Link from 'next/link';
import type { Metadata } from 'next';
import { getSiteUrl } from '@/lib/utils/siteUrl';
import { lastDay, loadYearReview, reviewDate, REVIEW_LIVE, REVIEW_YEAR } from '@/lib/review/load';
import type { LagStat } from '@/lib/review/types';
import { buildBreadcrumbLd } from '@/lib/seo/jsonLd';
import JsonLd from '@/app/components/JsonLd';
import FreeSubscribeForm from '@/app/components/FreeSubscribeForm';
import AttentionChart from '../../markets/_components/AttentionChart';
import { formatPct } from '../../markets/_components/format';
import LagChart from '../_components/LagChart';

const siteUrl = getSiteUrl();
const PATH = '/research/coverage-and-share-prices';
const TITLE = 'Does press coverage move luxury share prices?';
const DESCRIPTION = `We counted every article the trade press wrote about eleven listed luxury and jewellery groups in ${REVIEW_YEAR} and set it against their share prices. Coverage moves in the same week as the share price. We found no sign that it comes first.`;

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${siteUrl}${PATH}` },
  robots: REVIEW_LIVE ? undefined : { index: false, follow: true },
  openGraph: { title: `${TITLE} | Luxury Intelligence`, description: DESCRIPTION, url: `${siteUrl}${PATH}`, images: [`${siteUrl}/api/og`] },
  twitter: { title: `${TITLE} | Luxury Intelligence`, description: DESCRIPTION, images: [`${siteUrl}/api/og`] },
};

const SECTION = 'py-10 border-b border-[var(--color-border)]';
const H2 = 'font-display font-semibold text-[28px] md:text-[32px] leading-[1.2] mb-2';
const SUB = 'text-[15px] text-[var(--color-text-secondary)] max-w-[46em] mb-6';
const BODY = 'text-[16px] leading-[1.6] max-w-[42em] mb-4';
const TH = 'font-medium text-[11px] tracking-[0.14em] uppercase text-[var(--color-text-secondary)] text-left py-2 pr-4 border-b border-[var(--color-border)] whitespace-nowrap';
const TD = 'py-2 pr-4 border-b border-[var(--color-border)] whitespace-nowrap';
const NUM = 'text-right font-ibm-mono text-[13px] tabular-nums';
const NOTE = 'text-[12.5px] text-[var(--color-text-secondary)] max-w-[60em] mt-4';
const LABEL = 'intel-section-label text-[var(--color-accent)] mb-3';

const nf = (n: number) => n.toLocaleString('en-GB');
const upColour = (n: number) => ({ color: n >= 0 ? 'var(--color-up)' : 'var(--color-down)' });
const lagLabel = (lag: number) => (lag === 0 ? 'Same week' : `${Math.abs(lag)} week${Math.abs(lag) === 1 ? '' : 's'} ${lag < 0 ? 'before' : 'after'}`);
const list = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven'];
const times = (x: number) => (Math.abs(x - 2) < 0.15 ? 'twice' : `${x.toFixed(1)} times`);
const rFmt = (r: number) => `${r < 0 ? '−' : r > 0 ? '+' : ''}${Math.abs(r).toFixed(2)}`;

function LagTable({ direction, size }: { direction: LagStat[]; size: LagStat[] }) {
  return (
    <div className="overflow-x-auto mt-6">
      <table className="w-full max-w-[640px] border-collapse text-[14px]">
        <caption className="sr-only">Correlation between a surge in coverage and the share price, by lag</caption>
        <thead>
          <tr>
            <th scope="col" className={TH}>Share price moved</th>
            <th scope="col" className={`${TH} text-right`}>Direction</th>
            <th scope="col" className={`${TH} text-right`}>Size</th>
          </tr>
        </thead>
        <tbody>
          {direction.map((d, i) => {
            const s = size[i]!;
            return (
              <tr key={d.lag}>
                <td className={TD}>{lagLabel(d.lag)}</td>
                <td className={`${TD} ${NUM}`}>{rFmt(d.r)}{d.p < 0.05 ? ' *' : ''}</td>
                <td className={`${TD} ${NUM}`}>{rFmt(s.r)}{s.p < 0.05 ? ' *' : ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default async function CoverageAndSharePricesPage() {
  const data = await loadYearReview();
  if (!data) {
    return (
      <div className="max-w-[1120px] mx-auto px-4 md:px-8 py-14 text-[var(--color-text-primary)]">
        <h1 className="font-display font-semibold text-[40px] mb-3">{TITLE}</h1>
        <p className="text-[var(--color-text-secondary)]">This analysis is being prepared.</p>
      </div>
    );
  }

  const { companies, backtest: bt, window: win, panel, coverageRank: rank } = data;
  const from = reviewDate(win.startISO), to = reviewDate(lastDay(win.endISO), true);
  const byCoverage = [...companies].sort((a, b) => b.articles - a.articles);
  const top = byCoverage.slice(0, 2);
  const risers = companies.filter(c => c.changeYtd > 0);
  const riserArticles = risers.reduce((s, c) => s + c.articles, 0);
  const sameWeek = bt.size.find(s => s.lag === 0)!;
  const strongestDirection = [...bt.direction].sort((a, b) => Math.abs(b.r) - Math.abs(a.r))[0]!;
  const rankWeak = rank.p >= 0.05;
  // How many of the worst performers the two most-covered groups are among.
  const byFall = [...companies].sort((a, b) => a.changeYtd - b.changeYtd);
  const worstRank = Math.max(...top.map(c => byFall.findIndex(x => x.ticker === c.ticker))) + 1;
  const topBothFell = top.length === 2 && top.every(c => c.changeYtd < 0);
  const directionSignificant = bt.direction.some(s => s.p < 0.05);
  const usableWeeks = win.weeks - bt.trailingWeeks;
  // A significant negative r where the share price moved first is the trailing-mean artefact (docs/year-review.md).
  const artefact = bt.size.find(s => s.lag < 0 && s.p < 0.05 && s.r < 0);

  return (
    <div className="max-w-[1120px] mx-auto px-4 md:px-8 py-10 md:py-14 text-[var(--color-text-primary)]">
      <JsonLd data={buildBreadcrumbLd({ siteUrl, items: [{ name: 'Home', url: `${siteUrl}/` }, { name: TITLE }] })} />

      <header className="pb-8 border-b border-[var(--color-border)]">
        <p className={LABEL}>Research · {REVIEW_YEAR}</p>
        <h1 className="font-display font-semibold leading-[1.05] tracking-[-0.01em] mb-4 max-w-[18em]" style={{ fontSize: 'clamp(2.25rem, 5.5vw, 3.75rem)' }}>
          {TITLE}
        </h1>
        <p className="text-[19px] md:text-[21px] leading-[1.45] max-w-[36em]">
          Not that we can find. In {REVIEW_YEAR} coverage of a company surged in the same week as a big move in its shares, not before it. And the amount of coverage a company got said little about how its shares did.
        </p>
        <p className="text-[14px] text-[var(--color-text-secondary)] mt-4 max-w-[46em]">
          {nf(panel.articles)} articles from {panel.sources} sources, {from} to {to}, against the share prices of {companies.length} listed groups.
        </p>
      </header>

      {/* 1. The cross-section */}
      <section className={SECTION} aria-labelledby="losers-h">
        <p className={LABEL}>Finding 1</p>
        <h2 id="losers-h" className={H2}>{topBothFell ? 'The two most-covered groups had a bad year' : 'Coverage and the share price, company by company'}</h2>
        <p className={SUB}>Articles naming each group or one of its brands, against its share price since the first trading day of {REVIEW_YEAR}.</p>

        <ul className="list-none m-0 mb-7 p-0">
          <li className="grid grid-cols-[28px_1fr] gap-1.5 font-display font-semibold text-[22px] md:text-[26px] leading-[1.25] mb-3 max-w-[34em]">
            <span className="text-[18px] pt-[5px]" style={{ color: 'var(--color-down)' }} aria-hidden="true">▼</span>
            <span>{list(top.map(c => c.company))} were the most-covered groups ({list(top.map(c => `${nf(c.articles)}`))} articles). {topBothFell ? `Their shares fell ${list(top.map(c => `${Math.abs(c.changeYtd).toFixed(0)}%`))}` : `Their shares moved ${list(top.map(c => formatPct(c.changeYtd)))}`}.</span>
          </li>
          {risers.length > 0 && (
            <li className="grid grid-cols-[28px_1fr] gap-1.5 font-display font-semibold text-[22px] md:text-[26px] leading-[1.25] mb-3 max-w-[34em]">
              <span className="text-[18px] pt-[5px]" style={{ color: 'var(--color-up)' }} aria-hidden="true">▲</span>
              <span>The {risers.length === 1 ? 'one company' : `${WORDS[risers.length] ?? risers.length} companies`} whose shares rose got {nf(riserArticles)} articles between them.</span>
            </li>
          )}
        </ul>
        <p className={BODY}>
          {topBothFell && worstRank === 2 && `They are the two worst performers of the ${WORDS[companies.length] ?? companies.length}. `}
          {topBothFell && worstRank > 2 && worstRank <= 4 && `Both are among the ${WORDS[worstRank] ?? worstRank} worst performers of the ${WORDS[companies.length] ?? companies.length}. `}
          {rankWeak
            ? `But across all ${WORDS[companies.length] ?? companies.length} companies the link between coverage and share price is weak (rank correlation ${rFmt(rank.rho)}, p = ${rank.p.toFixed(2)}), and it could be chance.`
            : `Across all ${WORDS[companies.length] ?? companies.length} companies, more coverage went with a ${rank.rho < 0 ? 'worse' : 'better'} year (rank correlation ${rFmt(rank.rho)}, p = ${rank.p.toFixed(2)}).`}
          {' '}Coverage mostly follows size: the biggest groups own the most brands and get the most articles, whatever their shares do.
        </p>

        <AttentionChart
          rows={companies.map(c => ({ ticker: c.ticker, company: c.company, articles: c.articles, change3m: c.changeYtd, change1m: 0 }))}
          labels={{
            x: `Articles, ${from} to ${reviewDate(lastDay(win.endISO))} (square-root scale)`,
            y: `Share price, ${REVIEW_YEAR} to date`,
            period: 'this year',
            aria: `Scatter chart: articles since ${from} against the share price change in ${REVIEW_YEAR}, one dot per company. Values are in the table below.`,
          }}
        />

        <div className="overflow-x-auto mt-5">
          <table className="w-full border-collapse text-[14px]">
            <caption className="sr-only">Coverage and share price change by company</caption>
            <thead>
              <tr>
                <th scope="col" className={TH}>Company</th>
                <th scope="col" className={`${TH} text-right`}>Articles</th>
                <th scope="col" className={`${TH} text-right hidden sm:table-cell`}>Share of coverage</th>
                <th scope="col" className={`${TH} text-right`}>Share price, {REVIEW_YEAR}</th>
              </tr>
            </thead>
            <tbody>
              {byCoverage.map(c => (
                <tr key={c.ticker}>
                  <td className={TD}>{c.company}</td>
                  <td className={`${TD} ${NUM}`}>{nf(c.articles)}</td>
                  <td className={`${TD} ${NUM} hidden sm:table-cell`}>{c.shareOfCoverage.toFixed(2)}%</td>
                  <td className={`${TD} ${NUM}`} style={upColour(c.changeYtd)}>{formatPct(c.changeYtd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={NOTE}>Coverage counts a group together with its brands (LVMH includes Louis Vuitton, Dior, Bulgari, Tiffany and others). Share prices: Yahoo Finance, local currency, first close of {REVIEW_YEAR} to {to}. Articles are counted from {from}, when most sources joined the archive, so the share-price period starts two months earlier than the coverage. The sources are English-language, which undercounts companies covered mainly in other languages.</p>
      </section>

      {/* 2. Lead / lag */}
      <section className={SECTION} aria-labelledby="lead-h">
        <p className={LABEL}>Finding 2</p>
        <h2 id="lead-h" className={H2}>No sign that coverage comes first</h2>
        <p className={SUB}>If the press saw trouble coming, a surge in coverage would be followed by a move in the share price. We tested each week against the weeks before and after it.</p>

        <p className={BODY}>
          <strong>Direction.</strong> A surge in coverage says nothing about whether the share rises or falls,
          in the same week or in any of the four weeks either side. The strongest link we found was r = {rFmt(strongestDirection.r)}
          {directionSignificant ? '.' : ', and none passed a significance test.'}
        </p>
        <p className={BODY}>
          <strong>Size.</strong> Coverage surges in the same week as a big move in either direction
          (r = {sameWeek.r.toFixed(2)}, p {sameWeek.p < 0.001 ? '< 0.001' : `= ${sameWeek.p.toFixed(3)}`}), and there is no link in the weeks after.
          Weekly data cannot say which came first inside that week; results days and profit warnings would produce both at once. What it does show is no sign of the press getting there early.
        </p>

        <div className="grid md:grid-cols-2 gap-8 mt-7 max-w-[900px]">
          <LagChart stats={bt.direction} title="Which way the share moved" />
          <LagChart stats={bt.size} title="How far the share moved" artefactLag={artefact?.lag} />
        </div>
        <LagTable direction={bt.direction} size={bt.size} />
        <p className={NOTE}>
          Each value is the correlation (r) between a company’s coverage surge and its share-price move against the average of all {WORDS[companies.length] ?? companies.length} companies; * marks p &lt; 0.05 in a permutation test.
          With {bt.direction.length + bt.size.length} values tested, about one would pass that mark by chance.
          Tested on {list(bt.companies)}, the companies with at least {bt.minArticlesPerWeek} articles a week, over {usableWeeks} weeks each.
          {artefact && ` The negative value ${Math.abs(artefact.lag)} weeks before (drawn in outline) is most likely produced by the method: a big move comes with a coverage spike, and that spike raises the baseline the following weeks are measured against.`}
        </p>
      </section>

      {/* 3. Loud weeks */}
      <section className={SECTION} aria-labelledby="loud-h">
        <p className={LABEL}>Finding 3</p>
        <h2 id="loud-h" className={H2}>What happens in a loud week</h2>
        <p className={SUB}>The {bt.events.loud.n} company-weeks with the biggest coverage surges, against the other {bt.events.rest.n}. The last four weeks are left out so that every week has four weeks after it.</p>

        <div className="grid grid-cols-2 gap-x-8 gap-y-6 max-w-[560px] mb-6">
          {[
            { label: 'Loud weeks', g: bt.events.loud },
            { label: 'All other weeks', g: bt.events.rest },
          ].map(({ label, g }) => (
            <div key={label}>
              <p className="font-ibm-mono text-[12px] tracking-[0.06em] uppercase text-[var(--color-text-secondary)] mb-1">{label}</p>
              <p className="font-display font-semibold text-[40px] md:text-[48px] leading-none tabular-nums">{g.sameWeekAbs.toFixed(1)}%</p>
              <p className="text-[13.5px] text-[var(--color-text-secondary)] mt-1.5">average move that week, either direction</p>
            </div>
          ))}
        </div>
        <p className={BODY}>
          In a loud week the share moved about {times(bt.events.loud.sameWeekAbs / bt.events.rest.sameWeekAbs)} as far as usual.
          Over the following four weeks the loud group returned {formatPct(bt.events.loud.next4Weeks)} against the average and the rest {formatPct(bt.events.rest.next4Weeks)}.
          With only {bt.events.loud.n} loud weeks we cannot say whether that difference is real.
        </p>

        <div className="overflow-x-auto mt-5">
          <table className="w-full max-w-[640px] border-collapse text-[14px]">
            <caption className="text-left text-[13.5px] text-[var(--color-text-secondary)] pb-2">The loudest weeks. A surge is measured against the company’s own usual coverage, so a few articles can be a surge for a quiet company.</caption>
            <thead>
              <tr>
                <th scope="col" className={TH}>Company</th>
                <th scope="col" className={TH}>Week of</th>
                <th scope="col" className={`${TH} text-right`}>Articles</th>
                <th scope="col" className={`${TH} text-right`}>Share vs average</th>
              </tr>
            </thead>
            <tbody>
              {bt.loudest.map(e => (
                <tr key={`${e.company}-${e.weekStart}`}>
                  <td className={TD}>{e.company}</td>
                  <td className={TD}>{reviewDate(e.weekStart)}</td>
                  <td className={`${TD} ${NUM}`}>{e.articles}</td>
                  <td className={`${TD} ${NUM}`} style={upColour(e.excessReturn)}>{formatPct(e.excessReturn)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 4. Method */}
      <section className={SECTION} aria-labelledby="method-h">
        <p className={LABEL}>Method and limits</p>
        <h2 id="method-h" className={H2}>How this was measured</h2>
        <ul className="m-0 pl-[18px] max-w-[46em] text-[15px] leading-[1.6] list-disc marker:text-[var(--color-accent)] grid gap-2.5 mt-4">
          <li><strong>Articles.</strong> Every article from the {panel.sources} sources that published in at least four weeks out of five between {from} and {to}: {nf(panel.articles)} in all. A source that joined late is left out, so a new feed cannot look like a trend.</li>
          <li><strong>Coverage surge.</strong> A company’s share of that week’s articles, minus its own average over the previous {bt.trailingWeeks} weeks. Using a share means a busy news week is not counted as a surge.</li>
          <li><strong>Share-price move.</strong> The company’s weekly return minus the average of all {companies.length} companies, so a week when every luxury share falls is not read as a signal about one of them.</li>
          <li><strong>Significance.</strong> Each company’s coverage series was shuffled in time 2,000 times to see how often chance alone gives a link as strong.</li>
          <li><strong>Limits.</strong> {bt.companies.length} companies and {usableWeeks} weeks is a small sample. The archive only goes back to {from}, so it covers one market mood. Coverage is counted from headlines and summaries in the trade and business press, not from the whole of the media. Nothing here is investment advice.</li>
        </ul>
        <p className={NOTE}>Built automatically from the Luxury Intelligence archive on {reviewDate(data.builtAtISO.slice(0, 10), true)}. No one edits the figures by hand. <Link href="/methodology" className="underline decoration-[var(--color-accent)] underline-offset-2 hover:text-[var(--color-text-primary)]">How the archive is collected</Link>.</p>
      </section>

      {/* 5. Next */}
      <section className="py-10" aria-labelledby="next-h">
        <h2 id="next-h" className={H2}>The same archive, every Monday</h2>
        <p className={SUB}>A free weekly briefing on AI, ecommerce, luxury and jewellery, ranked from everything the archive collects that week. The live version of the first chart is on the <Link href="/markets/luxury" className="underline decoration-[var(--color-accent)] underline-offset-2 hover:text-[var(--color-text-primary)]">luxury market</Link> and <Link href="/markets/jewellery" className="underline decoration-[var(--color-accent)] underline-offset-2 hover:text-[var(--color-text-primary)]">jewellery market</Link> pages.</p>
        <div className="max-w-[520px]"><FreeSubscribeForm placement="research_coverage" /></div>
      </section>
    </div>
  );
}
