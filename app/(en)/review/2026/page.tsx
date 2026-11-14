/**
 * /review/2026: the year in the archive. Reads data/review/2026.json
 * (review/build.ts). Every number in the copy comes from that file; findings,
 * method and launch steps are in docs/year-review.md.
 */

import Link from 'next/link';
import type { Metadata } from 'next';
import { getSiteUrl } from '@/lib/utils/siteUrl';
import { lastDay, loadYearReview, reviewDate, REVIEW_LIVE } from '@/lib/review/load';
import { buildBreadcrumbLd } from '@/lib/seo/jsonLd';
import JsonLd from '@/app/components/JsonLd';
import FreeSubscribeForm from '@/app/components/FreeSubscribeForm';
import { formatPct } from '../../markets/_components/format';
import ThemeRows, { isPeak, monthName } from '../_components/ThemeRows';

const YEAR = 2026;
const siteUrl = getSiteUrl();
const PATH = `/review/${YEAR}`;
const RESEARCH = '/research/coverage-and-share-prices';
const TITLE = `${YEAR} in luxury, by the numbers`;
const DESCRIPTION = `What tens of thousands of trade-press articles show about luxury in ${YEAR}: who the press wrote about, what their shares did, and which themes faded.`;

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${siteUrl}${PATH}` },
  robots: REVIEW_LIVE ? undefined : { index: false, follow: true },
  openGraph: { title: `${TITLE} | Luxury Intelligence`, description: DESCRIPTION, url: `${siteUrl}${PATH}`, images: [`${siteUrl}/api/og`] },
  twitter: { title: `${TITLE} | Luxury Intelligence`, description: DESCRIPTION, images: [`${siteUrl}/api/og`] },
};

const SECTION = 'py-12 border-b border-[var(--color-border)]';
const H2 = 'font-display font-semibold text-[30px] md:text-[38px] leading-[1.15] mb-3 max-w-[20em]';
const SUB = 'text-[16px] text-[var(--color-text-secondary)] max-w-[44em] mb-7';
const BODY = 'text-[16px] leading-[1.6] max-w-[42em] mb-4';
const NOTE = 'text-[12.5px] text-[var(--color-text-secondary)] max-w-[60em] mt-5';
const LABEL = 'intel-section-label text-[var(--color-accent)] mb-3';
const LINK = 'underline decoration-[var(--color-accent)] underline-offset-2 hover:text-[var(--color-accent)]';
const BIG = 'font-display font-semibold leading-none tabular-nums';

const nf = (n: number) => n.toLocaleString('en-GB');
const list = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven'];
/** Runway coverage follows the show calendar; its peaks are the season, not news. */
const SEASONAL = /^Fashion weeks/;
const lower = (s: string) => (/^(AI|World Cup)/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));

export default async function YearReviewPage() {
  const data = await loadYearReview(YEAR);
  if (!data) {
    return (
      <div className="max-w-[1120px] mx-auto px-4 md:px-8 py-14 text-[var(--color-text-primary)]">
        <h1 className="font-display font-semibold text-[40px] mb-3">{TITLE}</h1>
        <p className="text-[var(--color-text-secondary)]">The review is being prepared.</p>
      </div>
    );
  }

  const { companies, brands, backtest: bt, themes, archive, panel, window: win } = data;
  const from = reviewDate(win.startISO), to = reviewDate(lastDay(win.endISO), true);

  // Chapter 1
  const byCoverage = [...companies].sort((a, b) => b.articles - a.articles);
  const top = byCoverage.slice(0, 2);
  const risers = companies.filter(c => c.changeYtd > 0);
  const topBothFell = top.length === 2 && top.every(c => c.changeYtd < 0);
  const maxArticles = Math.max(1, byCoverage[0]?.articles ?? 1);
  const maxMove = Math.max(1, ...companies.map(c => Math.abs(c.changeYtd)));

  // Chapter 3
  const topBrands = brands.slice(0, 10);
  const leader = topBrands[0];
  const leaderIsPrivate = leader?.group === 'Private';
  const firstListed = topBrands.find(b => b.group !== 'Private');

  // Chapter 4
  const half = Math.ceil(themes.months.length / 2);
  const firstLabel = `${monthName(themes.months[0]!)}–${monthName(themes.months[half - 1]!)}`;
  const secondLabel = `${monthName(themes.months[half]!)}–${monthName(themes.months.at(-1)!)}`;
  const trends = themes.rows.filter(r => !r.background).sort((a, b) => (a.ratio ?? 1) - (b.ratio ?? 1));
  const background = themes.rows.filter(r => r.background).sort((a, b) => b.articles - a.articles);
  const peakOf = (r: typeof trends[number]) => { const v = Math.max(...r.monthlyShare); return { value: v, month: themes.months[r.monthlyShare.indexOf(v)]! }; };
  const spike = [...trends].map(r => ({ r, ...peakOf(r) })).filter(x => !SEASONAL.test(x.r.name) && isPeak(x.r, x.value)).sort((a, b) => b.value - a.value)[0];
  const business = trends.filter(r => /Earnings|Mergers/.test(r.name));
  const faded = trends.filter(r => r.ratio != null && r.ratio <= 0.75 && r.name !== spike?.r.name).slice(0, 3);
  const ai = trends.find(r => /^AI/.test(r.name));
  const drops = background[0];

  return (
    <div className="max-w-[1120px] mx-auto px-4 md:px-8 py-10 md:py-14 text-[var(--color-text-primary)]">
      <JsonLd data={buildBreadcrumbLd({ siteUrl, items: [{ name: 'Home', url: `${siteUrl}/` }, { name: TITLE }] })} />

      <header className="pb-10 border-b border-[var(--color-border)]">
        <p className={LABEL}>The year in review</p>
        <h1 className="font-display font-semibold leading-[1.02] tracking-[-0.015em] mb-5" style={{ fontSize: 'clamp(2.75rem, 7.5vw, 5.5rem)' }}>
          {YEAR} in luxury,<br />by the numbers
        </h1>
        <p className="text-[19px] md:text-[22px] leading-[1.45] max-w-[34em]">
          Every week this site reads the trade press so you don’t have to. Read together, a year of it shows things no single article does.
        </p>
        <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-7 mt-10 m-0">
          {[
            { n: nf(archive.articles), l: 'articles read' },
            { n: nf(archive.sources), l: 'sources' },
            { n: nf(win.weeks), l: `weeks, ${from} to ${reviewDate(lastDay(win.endISO))}` },
            { n: nf(companies.length), l: 'listed groups tracked against their share price' },
          ].map(s => (
            <div key={s.l}>
              <dt className="sr-only">{s.l}</dt>
              <dd className="m-0">
                <span className={`${BIG} block text-[44px] md:text-[56px]`}>{s.n}</span>
                <span className="block text-[13.5px] text-[var(--color-text-secondary)] mt-2 max-w-[16em]">{s.l}</span>
              </dd>
            </div>
          ))}
        </dl>
      </header>

      {/* 1. The press watched the losers */}
      <section className={SECTION} aria-labelledby="c1">
        <p className={LABEL}>1 · Coverage and share prices</p>
        <h2 id="c1" className={H2}>{topBothFell ? 'The two most-covered groups had a bad year' : 'Coverage and the share price, company by company'}</h2>
        <p className={SUB}>
          {list(top.map(c => c.company))} were the most-covered groups of the year. {topBothFell ? `Their shares fell ${list(top.map(c => `${Math.abs(c.changeYtd).toFixed(0)}%`))}` : `Their shares moved ${list(top.map(c => formatPct(c.changeYtd)))}`}.
          {risers.length > 0 && ` The ${risers.length === 1 ? 'one company' : `${WORDS[risers.length] ?? risers.length} companies`} whose shares rose got ${nf(risers.reduce((s, c) => s + c.articles, 0))} articles between them.`}
          {data.coverageRank.p >= 0.05 && ' Across all of them, though, the link between coverage and share price is weak: the biggest groups get the most articles whatever their shares do.'}
        </p>

        <div role="table" aria-label="Coverage and share price change by company" className="max-w-[860px]">
          <div role="row" className="grid grid-cols-[minmax(0,104px)_1fr_1fr] md:grid-cols-[150px_1fr_1fr] gap-x-3 md:gap-x-6 pb-2 border-b border-[var(--color-border)] font-medium text-[11px] tracking-[0.12em] uppercase text-[var(--color-text-secondary)]">
            <span role="columnheader">Company</span>
            <span role="columnheader">Articles</span>
            <span role="columnheader">Share price, {YEAR}</span>
          </div>
          {byCoverage.map(c => (
            <div role="row" key={c.ticker} className="grid grid-cols-[minmax(0,104px)_1fr_1fr] md:grid-cols-[150px_1fr_1fr] gap-x-3 md:gap-x-6 items-center py-[7px] border-b border-[var(--color-border)] text-[14px]">
              <span role="cell" className="leading-[1.2]">{c.company}</span>
              <span role="cell" className="grid grid-cols-[1fr_38px] items-center gap-2">
                <span className="relative h-3.5"><span className="absolute inset-y-0 left-0 rounded-[2px]" style={{ width: `${Math.max(0.5, (c.articles / maxArticles) * 100)}%`, background: 'var(--color-bar)' }} /></span>
                <span className="font-ibm-mono text-[12.5px] tabular-nums text-right">{nf(c.articles)}</span>
              </span>
              <span role="cell" className="grid grid-cols-[1fr_58px] items-center gap-2">
                {/* Bars grow left or right from a centre line. */}
                <span className="relative h-3.5">
                  <span className="absolute inset-y-[-3px] left-1/2 w-px bg-[var(--color-text-secondary)] opacity-50" />
                  <span className="absolute inset-y-0 rounded-[2px]" style={{
                    width: `${(Math.abs(c.changeYtd) / maxMove) * 50}%`,
                    ...(c.changeYtd >= 0 ? { left: '50%' } : { right: '50%' }),
                    background: c.changeYtd >= 0 ? 'var(--color-up)' : 'var(--color-down)',
                  }} />
                </span>
                <span className="font-ibm-mono text-[12.5px] tabular-nums text-right" style={{ color: c.changeYtd >= 0 ? 'var(--color-up)' : 'var(--color-down)' }}>{formatPct(c.changeYtd)}</span>
              </span>
            </div>
          ))}
        </div>
        <p className={NOTE}>Articles naming each group or one of its brands, {from} to {to}, from the {panel.sources} sources that published in at least four weeks out of five. Share prices: Yahoo Finance, local currency, from the first close of {YEAR}, two months before the article count starts. <Link href={RESEARCH} className={LINK}>Full table and method</Link>.</p>
      </section>

      {/* 2. Reacts, does not predict */}
      <section className={SECTION} aria-labelledby="c2">
        <p className={LABEL}>2 · Timing</p>
        <h2 id="c2" className={H2}>The press does not get there early</h2>
        <p className={SUB}>We tested whether a surge in coverage of a company comes before a move in its share price. We found no sign of it. The surge comes in the same week as the move.</p>
        <div className="grid grid-cols-2 gap-x-8 gap-y-6 max-w-[620px] mb-7">
          <div>
            <p className={`${BIG} text-[48px] md:text-[64px]`}>{bt.events.loud.sameWeekAbs.toFixed(1)}%</p>
            <p className="text-[14px] text-[var(--color-text-secondary)] mt-2">average share move in a week when coverage surged</p>
          </div>
          <div>
            <p className={`${BIG} text-[48px] md:text-[64px] text-[var(--color-text-secondary)]`}>{bt.events.rest.sameWeekAbs.toFixed(1)}%</p>
            <p className="text-[14px] text-[var(--color-text-secondary)] mt-2">in every other week</p>
          </div>
        </div>
        <p className={BODY}>
          In the four weeks after a surge we found no difference we could separate from noise ({bt.events.loud.n} surge weeks). The test covers {list(bt.companies)}, the {WORDS[bt.companies.length] ?? bt.companies.length} companies with enough weekly coverage to measure, so read it as a first look.
          {' '}<Link href={RESEARCH} className={LINK}>The full analysis, with the method and every number</Link>.
        </p>
      </section>

      {/* 3. Brands */}
      {leader && (
        <section className={SECTION} aria-labelledby="c3">
          <p className={LABEL}>3 · Share of voice</p>
          <h2 id="c3" className={H2}>
            {leaderIsPrivate ? `The most-covered brand has no share price: ${leader.name}` : `${leader.name} was the most-covered brand we track`}
          </h2>
          <p className={SUB}>
            Of the {brands.length} brands this site tracks, {leader.name} appeared in the most articles ({nf(leader.articles)})
            {leaderIsPrivate && firstListed ? `, ahead of ${firstListed.name} (${nf(firstListed.articles)}), the most-covered brand that belongs to a listed group` : ''}.
            {' '}Of the ten most-covered names, {WORDS[topBrands.filter(b => b.group === 'Private').length]} are privately owned.
          </p>
          <div className="grid gap-[7px] max-w-[640px]">
            {topBrands.map((b, i) => (
              <div key={b.name} className="grid grid-cols-[minmax(0,120px)_1fr_44px] md:grid-cols-[150px_1fr_52px] items-center gap-2.5 text-[14px]">
                <span className="truncate">{b.name}</span>
                <span className="relative h-3.5"><span className="absolute inset-y-0 left-0 rounded-[2px]" style={{ width: `${(b.articles / leader.articles) * 100}%`, background: i === 0 ? 'var(--color-accent)' : 'var(--color-bar)' }} /></span>
                <span className="font-ibm-mono text-[12.5px] tabular-nums text-right text-[var(--color-text-secondary)]">{nf(b.articles)}</span>
              </div>
            ))}
          </div>
          <p className={NOTE}>Articles naming each brand in a headline or summary. An article naming two brands counts for both. The sources include watch trade titles, which lifts watch brands.</p>
        </section>
      )}

      {/* 4. Themes */}
      <section className={SECTION} aria-labelledby="c4">
        <p className={LABEL}>4 · Themes</p>
        <h2 id="c4" className={H2}>What the trade press talked about less</h2>
        <p className={SUB}>
          A model read {nf(themes.articles)} headlines from {themes.outlets.length} luxury and fashion trade titles and filed each under the themes it was about. Share of headlines, {firstLabel} against {secondLabel}.
        </p>

        <ul className="list-none m-0 mb-8 p-0 grid gap-3 max-w-[40em]">
          {faded.map(r => (
            <li key={r.name} className="grid grid-cols-[28px_1fr] gap-1.5 font-display font-semibold text-[21px] md:text-[25px] leading-[1.25]">
              <span className="text-[17px] pt-[5px]" style={{ color: 'var(--color-down)' }} aria-hidden="true">▼</span>
              <span>{r.name}: {r.firstHalf.toFixed(1)}% of headlines, then {r.secondHalf.toFixed(1)}%.</span>
            </li>
          ))}
          {spike && (
            <li className="grid grid-cols-[28px_1fr] gap-1.5 font-display font-semibold text-[21px] md:text-[25px] leading-[1.25]">
              <span className="text-[17px] pt-[5px] text-[var(--color-accent)]" aria-hidden="true">◆</span>
              <span>{spike.r.name} took {spike.value.toFixed(1)}% of headlines in {new Date(`${spike.month}-15`).toLocaleDateString('en-GB', { month: 'long' })}, then fell back to {spike.r.monthlyShare.at(-1)!.toFixed(1)}%.</span>
            </li>
          )}
          {ai && Math.abs((ai.ratio ?? 1) - 1) < 0.2 && (
            <li className="grid grid-cols-[28px_1fr] gap-1.5 font-display font-semibold text-[21px] md:text-[25px] leading-[1.25]">
              <span className="text-[17px] pt-[5px] text-[var(--color-text-secondary)]" aria-hidden="true">●</span>
              <span>{ai.name} averaged {ai.firstHalf.toFixed(1)}% and then {ai.secondHalf.toFixed(1)}%: no clear trend, on {nf(ai.articles)} headlines.</span>
            </li>
          )}
        </ul>

        <ThemeRows rows={trends} months={themes.months} firstLabel={firstLabel} secondLabel={secondLabel} />
        <p className={NOTE}>Each bar is one month; all rows share one scale. Each outlet counts equally, so a prolific outlet cannot set the share. A highlighted bar is a peak month, far above the theme’s usual level. Runway coverage peaks with the show calendar, so its rise is the season, not a trend. {themes.unlabelled.toFixed(0)}% of headlines fitted no theme.</p>
      </section>

      {/* 5. Background */}
      {drops && (
        <section className={SECTION} aria-labelledby="c5">
          <p className={LABEL}>5 · The constant</p>
          <h2 id="c5" className={H2}>About one headline in {WORDS[Math.round(100 / ((drops.firstHalf + drops.secondHalf) / 2))] ?? Math.round(100 / ((drops.firstHalf + drops.secondHalf) / 2))} is a product drop</h2>
          <p className={SUB}>
            Whatever else happened, the largest share of the luxury and fashion press went to new products and collaborations: {drops.firstHalf.toFixed(0)}% of headlines in {firstLabel} and {drops.secondHalf.toFixed(0)}% in {secondLabel}.
            {background.length > 1 && ` ${list(background.slice(1).map(r => `${r.name} (${((r.firstHalf + r.secondHalf) / 2).toFixed(0)}%)`))} came next among the constants.`}
          </p>
          <ThemeRows rows={background} months={themes.months} firstLabel={firstLabel} secondLabel={secondLabel} />
          <p className={NOTE}>
            Shares of the {nf(themes.articles)} headlines, each outlet counted equally.
            {business.length > 0 && ` Compare with ${list(business.map(r => `${lower(r.name)} (${((r.firstHalf + r.secondHalf) / 2).toFixed(0)}%)`))}.`}
          </p>
        </section>
      )}

      {/* 6. Method */}
      <section className={SECTION} aria-labelledby="method-h">
        <p className={LABEL}>Method and limits</p>
        <h2 id="method-h" className="font-display font-semibold text-[26px] md:text-[30px] leading-[1.2] mb-2">How this was counted</h2>
        <ul className="m-0 pl-[18px] max-w-[46em] text-[15px] leading-[1.6] list-disc marker:text-[var(--color-accent)] grid gap-2.5 mt-4">
          <li><strong>The period is {from} to {to}.</strong> Most sources joined the archive in March, so January and February are left out.</li>
          <li><strong>Shares, not counts.</strong> The archive collected more articles per week from October. Every figure here is a share of articles from sources that published in at least four weeks (or months) out of five, so the change in collection does not show up as a trend.</li>
          <li><strong>Themes are assigned by an AI model</strong> from the headline and summary, against a fixed list of {themes.rows.length} themes. A headline can have two themes or none.</li>
          <li><strong>Jewellery has no themes chapter.</strong> The archive has too few steady jewellery trade titles for a monthly chart to mean anything. Jewellery companies appear in chapter 1.</li>
          <li><strong>No one edits these figures.</strong> The page is built automatically from the archive, last on {reviewDate(data.builtAtISO.slice(0, 10), true)}. <Link href="/methodology" className={LINK}>How the archive is collected</Link>.</li>
        </ul>
      </section>

      <section className="py-12" aria-labelledby="next-h">
        <h2 id="next-h" className="font-display font-semibold text-[28px] md:text-[34px] leading-[1.2] mb-2">Next year, week by week</h2>
        <p className={SUB}>The same archive becomes a free briefing every Monday: the stories that mattered in AI, ecommerce, luxury and jewellery, to read, hear or watch.</p>
        <div className="max-w-[520px]"><FreeSubscribeForm placement="review_2026" /></div>
      </section>
    </div>
  );
}
