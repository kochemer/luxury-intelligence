/**
 * The year in review film: narration and visuals, built from
 * data/review/<year>.json so no number is typed by hand. A rebuild of the data
 * changes the script; read the preview frames after every rebuild.
 *
 * Wording follows docs/year-review.md ("Wording rules"): no "the press watched
 * the losers", no "the press reacts", "headlines" for theme shares, and
 * Pandora is never named in the narration.
 */

import type { ThemeRow, YearReview } from '../../lib/review/types';

export interface Scene { vo: string; visual: Record<string, unknown> & { kind: string } }

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const nf = (n: number) => n.toLocaleString('en-GB');
const pct = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(0)}%`;
const word = (n: number) => WORDS[n] ?? String(n);
/** "2.2 percent" reads better aloud than "2.2%". */
const spoken = (n: number) => `${Number(n.toFixed(1))} percent`;
const list = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);

function peak(r: ThemeRow) {
  const value = Math.max(...r.monthlyShare);
  const sorted = [...r.monthlyShare].sort((a, b) => a - b);
  const median = (sorted[Math.floor((sorted.length - 1) / 2)]! + sorted[Math.ceil((sorted.length - 1) / 2)]!) / 2;
  return { value, index: r.monthlyShare.indexOf(value), isPeak: value >= 8 && value >= median * 1.8 };
}

export function buildScenes(d: YearReview): Scene[] {
  const scenes: Scene[] = [];
  const months = d.themes.months.map(m => MONTH[Number(m.slice(5)) - 1]!);
  const half = Math.ceil(months.length / 2);
  const span = `${months[0]}–${months[half - 1]}`, span2 = `${months[half]}–${months.at(-1)}`;
  const long = (i: number) => MONTH_LONG[Number(d.themes.months[i]!.slice(5)) - 1]!;
  /** Spoken halves: "from March to June", "from July to October". */
  const early = `from ${long(0)} to ${long(half - 1)}`, late = `from ${long(half)} to ${long(months.length - 1)}`;

  // 1. Intro
  scenes.push({
    vo: `${d.year} in luxury, by the numbers. We read ${nf(d.archive.articles)} articles from ${d.archive.sources} sources, so you didn't have to. Here is what a year of trade press looks like when you add it up.`,
    visual: {
      kind: 'intro', kicker: 'The year in review', title: String(d.year), tail: 'in luxury', sub: 'by the numbers',
      stats: [
        { n: nf(d.archive.articles), l: 'articles read' },
        { n: String(d.archive.sources), l: 'sources' },
        { n: String(d.window.weeks), l: 'weeks' },
      ],
    },
  });

  // 2. Brands
  const brands = d.brands.slice(0, 8);
  const leader = brands[0]!, second = brands[1]!;
  scenes.push({
    vo: `Start with who got the ink. Of the ${d.brands.length} brands we track, the most covered was ${leader.name}, in ${nf(leader.articles)} articles. ${second.name} came second.${leader.group === 'Private' ? ` And ${leader.name} has no share price at all.` : ''}`,
    visual: {
      kind: 'bars', kicker: '01 · Share of voice', heading: `The most-covered brand: ${leader.name}`,
      rows: brands.map((b, i) => ({ label: b.name, value: b.articles, text: nf(b.articles), hi: i === 0 })),
      note: `Articles naming each brand, of the ${d.brands.length} brands tracked. Watch trade titles lift watch brands.`,
    },
  });

  // 3. Themes that lost share
  const trends = d.themes.rows.filter(r => !r.background);
  const spike = trends.map(r => ({ r, ...peak(r) })).filter(x => x.isPeak && !/^Fashion weeks/.test(x.r.name)).sort((a, b) => b.value - a.value)[0];
  const faded = trends.filter(r => r.ratio != null && r.ratio <= 0.75 && r.name !== spike?.r.name).sort((a, b) => a.ratio! - b.ratio!).slice(0, 3);
  if (faded.length >= 2) {
    const [a, b] = faded as [ThemeRow, ThemeRow];
    scenes.push({
      vo: `Then, what faded. ${a.name} took ${spoken(a.firstHalf)} of headlines ${early}, and ${spoken(a.secondHalf)} ${late}. ${b.name} went from ${spoken(b.firstHalf)} to ${spoken(b.secondHalf)}.`,
      visual: {
        kind: 'themes', kicker: '02 · Themes', heading: 'What the trade press talked about less',
        months, span, span2,
        rows: faded.map(r => ({ label: r.name, values: r.monthlyShare, a: `${r.firstHalf.toFixed(1)}%`, b: `${r.secondHalf.toFixed(1)}%` })),
        note: `Share of ${nf(d.themes.articles)} headlines from ${d.themes.outlets.length} trade titles, each outlet counted equally.`,
      },
    });
  }

  // 4. The spike
  if (spike) {
    const share = spike.value;
    scenes.push({
      vo: `One story took over the summer. In ${MONTH_LONG[Number(d.themes.months[spike.index]!.slice(5)) - 1]}, ${spike.r.name} made up about one headline in ${word(Math.round(100 / share))}. By ${MONTH_LONG[Number(d.themes.months.at(-1)!.slice(5)) - 1]} it was back to ${spoken(spike.r.monthlyShare.at(-1)!)}.`,
      visual: {
        kind: 'months', kicker: '03 · The summer', heading: spike.r.name,
        months, values: spike.r.monthlyShare, hi: spike.index,
        note: 'Share of luxury and fashion trade headlines, by month.',
      },
    });
  }

  // 5. AI: no trend
  const ai = trends.find(r => /^AI/.test(r.name));
  if (ai && ai.ratio != null && Math.abs(ai.ratio - 1) < 0.2) {
    scenes.push({
      vo: `And A.I.? No clear trend. It averaged ${spoken(ai.firstHalf)} of headlines ${early}, and ${spoken(ai.secondHalf)} ${late}.`,
      visual: {
        kind: 'compare', kicker: '04 · AI in retail', heading: 'AI: no clear trend in this press',
        left: { n: `${ai.firstHalf.toFixed(1)}%`, l: `of headlines, ${span}` },
        right: { n: `${ai.secondHalf.toFixed(1)}%`, l: `of headlines, ${span2}` },
        note: `${nf(ai.articles)} headlines about AI in retail, so treat it as indicative.`,
      },
    });
  }

  // 6. The constant
  const drops = d.themes.rows.filter(r => r.background).sort((a, b) => b.articles - a.articles)[0];
  if (drops) {
    const oneIn = Math.round(100 / ((drops.firstHalf + drops.secondHalf) / 2));
    scenes.push({
      vo: `What never changes: about one headline in ${word(oneIn)} is a product drop or a collaboration. Every month, all year.`,
      visual: {
        kind: 'months', kicker: '05 · The constant', heading: `About one headline in ${word(oneIn)} is a product drop`,
        months, values: drops.monthlyShare, hi: -1,
        note: 'Product drops and collaborations, share of headlines by month.',
      },
    });
  }

  // 7. Companies
  const byCoverage = [...d.companies].sort((a, b) => b.articles - a.articles);
  const top = byCoverage.slice(0, 2);
  const bothFell = top.every(c => c.changeYtd < 0);
  const weak = d.coverageRank.p >= 0.05;
  scenes.push({
    vo: `Now the money. ${list(top.map(c => c.company))} were the most-covered groups${bothFell ? `, and their shares fell ${list(top.map(c => `${Math.abs(c.changeYtd).toFixed(0)}`))} percent` : ''}.${weak ? ` But don't read too much into that. Across all ${word(d.companies.length)} companies, coverage says little about performance. The biggest groups simply get the most articles.` : ''}`,
    visual: {
      kind: 'pairs', kicker: '06 · Coverage and share prices', heading: bothFell ? 'The two most-covered groups had a bad year' : 'Coverage and the share price',
      rows: byCoverage.map(c => ({ label: c.company, articles: c.articles, change: c.changeYtd, text: pct(c.changeYtd) })),
      left: 'Articles', right: `Share price, ${d.year}`,
      note: weak ? `Across all ${d.companies.length}: rank correlation ${d.coverageRank.rho.toFixed(2).replace('-', '−')}, not significant.` : '',
    },
  });

  // 8. Timing
  const ev = d.backtest.events;
  const ratio = ev.loud.sameWeekAbs / ev.rest.sameWeekAbs;
  scenes.push({
    vo: `We also tested whether the press sees a share-price move coming. We found no sign of it. Coverage surges in the same week as the move, when shares swing ${spoken(ev.loud.sameWeekAbs)} on average, ${Math.abs(ratio - 2) < 0.15 ? 'twice' : `${ratio.toFixed(1)} times`} a normal week. Not the week before.`,
    visual: {
      kind: 'compare', kicker: '07 · Timing', heading: 'No sign that coverage comes first',
      left: { n: `${ev.loud.sameWeekAbs.toFixed(1)}%`, l: 'average share move in a week when coverage surged' },
      right: { n: `${ev.rest.sameWeekAbs.toFixed(1)}%`, l: 'in every other week', muted: true },
      note: `${list(d.backtest.companies)}, ${d.window.weeks - d.backtest.trailingWeeks} weeks each. A small sample.`,
    },
  });

  // 9. Outro
  scenes.push({
    vo: `That's the year, counted. The full analysis is on luxury intel dot com, and the briefing arrives free, every Monday.`,
    visual: { kind: 'outro', title: String(d.year), tail: 'in luxury', sub: 'The full analysis, and a free briefing every Monday', url: 'luxury-intel.com' },
  });

  return scenes;
}
