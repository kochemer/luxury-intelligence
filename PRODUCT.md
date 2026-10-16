# Product

<!-- impeccable:product-schema 1 -->

Product truth for design work (Impeccable `init`, 2026-10-13). Visual decisions
live in DESIGN.md once one exists, not here. Facts marked *(inferred)* come from
the code and were not separately confirmed by the owner.

## Platform

web

## Users

Primary (owner, 2026-10-13): **retail and ecommerce generalists**. People in
ecommerce, retail tech and digital roles who follow AI and commerce broadly.
Luxury and jewellery are a lens on that world, not the only audience.

Situation *(inferred)*: a weekly catch-up, mostly arriving from the Monday email,
often on a phone, with a few minutes to find what matters this week.

## Product Purpose

A free weekly briefing that ranks and summarises the week's most significant
stories across four categories: AI & Strategy, Ecommerce & Retail Tech, Luxury &
Consumer, and Jewellery Industry.

Success for the next 6–12 months (owner, 2026-10-13): **grow free subscribers**,
meaning reach and a loyal Monday readership. Paid support is secondary.

## Positioning

Value proposition (owner, 2026-10-16). Lead with the fourth point; it is the
one nobody else offers:

1. **Your format.** Insights, trends and news in a form that is easy to take
   in: read (web issue, 28 short summaries), listen (podcast), watch (60-second
   Short).
2. **Delivered when it suits you.** Email, the web (installable on a phone),
   and LinkedIn, X and YouTube.
3. **More than a synthesis.** An editorial column with a point of view each
   week, and a little humour.
4. **Trends only a large archive shows.** The pipeline has collected tens of
   thousands of articles (31,368 on 2026-10-14); read together they show what
   is rising, what is fading, and where coverage and share prices disagree
   (`/markets`). Use real numbers from `data/markets/*.json` when citing it.

There is no store app; say "on your phone", not "in the app".

*(inferred)* One briefing that joins AI, ecommerce/retail tech, luxury and
jewellery, a mix the trade press covers separately. Each issue is ranked from
roughly 2,000 articles a week out of ~53 monitored sources, with a published,
explicit methodology, and arrives in four formats: web, email, podcast, and a
60-second video Short. The /markets pages add threshold-based signals per market.

## Operating Context

- Weekly cycle: the pipeline builds the issue every Monday for the Mon–Sun
  (Copenhagen) week that just ended, then sends the email.
- Formats: web issue page, email digest (Resend), podcast (RSS feed), weekly
  YouTube Short (@luxury-intel), /markets pages for luxury and jewellery.
- Locales: English is primary; /es and /da exist with translated UI, mostly
  English content, and are noindexed *(inferred)*.

## Capabilities and Constraints

- **Fully automated** (owner, 2026-10-13): AI selects, ranks and summarises,
  and writes the weekly Editor's Spotlight column. No human reviews an issue
  before it goes out. Copy must never claim human review or curation of an issue.
- Summaries are written from title, source, date and snippet; paywalled articles
  are skipped, never paraphrased from full text they could not fetch.
- Seven ranked articles per category, 28 per issue; the podcast is scripted from
  the top 8 and runs roughly 13–18 minutes.
- Free subscription by email. Optional paid support through Stripe (monthly and
  yearly) unlocks nothing extra.
- Stack: Next.js 16, React 19, Tailwind CSS v4 PWA on Vercel; light and dark themes.

## Brand Commitments

- Name: Luxury Intelligence, at luxury-intel.com. Based in Copenhagen.
- Voice for the weekly quote and insight: punchy, provocative, to the point,
  simple words (owner, 2026-10-09).
- Never about Pandora: the pipeline rejects quotes that mention it (owner,
  2026-10-09; enforced in `digest/generateThemes.ts`).
- The site is a personal project of its owner, presented as "The Editor" on /about.

## Evidence on Hand

- 45 published weekly issues (`data/digests/`), each with a podcast episode and
  a generated cover image; weekly Shorts since 2026-W41 (`video-short/README.md`).
- Real methodology pages (/methodology, /about) and the /markets data.
- Absent, never to be fabricated: subscriber or reader counts, testimonials,
  press mentions, client logos, open or click rates.

## Product Principles

1. Accuracy is the product. A wrong date or count costs more trust than any
   visual polish earns.
2. Honest about automation: say what AI does and that no one reviews issues.
3. Respect the reader's five minutes: the most important stories first, depth on demand.
4. Earn the free subscription: every surface makes it easy to start reading on Monday.

## Accessibility & Inclusion

No owner-set standard yet. The 2026-10-13 audit worked against WCAG 2.2 AA.
