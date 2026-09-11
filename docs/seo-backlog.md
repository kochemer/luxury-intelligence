# SEO / GEO / AEO backlog

Not scheduled. Ordered by expected value, with the honest caveats attached.

---

## First, the standing constraint

Everything below is a multiplier on demand you already have. As of 2026-09-11
the site had **177 impressions and 3 clicks over 28 days**, and only **two**
search queries cleared Google's privacy threshold — both branded
("luxury intelligence", "luxe intel"). Non-branded discovery is effectively
zero.

That is not a technical SEO problem. Positions are fine: several digest pages
rank 3rd–7th for what they match. Almost nothing matches. The binding
constraint is that weekly digest archives have close to no inherent search
demand — nobody googles "august 2026 week 33".

So the highest-value item on this list is not an SEO task at all: it is
**publishing pages that target things people actually search for**. Evergreen
explainers, company or brand pages, recurring topic hubs. The rest of this
list makes existing demand convert better.

Re-check the constraint before investing here: `npm run seo:gsc`.

---

## Social presence — creative angles

You asked for creative ways to make socials work for SEO/GEO/AEO. First the
correction: **social links are not a ranking factor**, and `sameAs` markup
does not improve rankings. Google has been consistent on this. Anyone
promising otherwise is selling something.

What social presence *can* do is narrower and more interesting.

### 1. Entity disambiguation (`sameAs`) — small, cheap, real

**What:** add real profile URLs to `buildOrganizationLd()` in
`lib/seo/jsonLd.ts`. There is a test asserting `sameAs` stays absent, so
remove that assertion in the same change.

**Why it matters:** it is one of the signals that confirms "Luxury
Intelligence" is a specific real publisher rather than a string. Matters more
for AEO than SEO — an answer engine needs to resolve a source before citing
it. Necessary-but-not-sufficient: it enables a Knowledge Panel eventually,
but only alongside actual notability.

**Effort:** minutes. **Do it if the profiles exist; do not create profiles for this.**

### 2. Make the digest quotable, so citations happen without you

**What:** publish each week's `keyThemes` and `oneSentenceSummary` as a short,
copy-pasteable "this week in three lines" block — on the page and as the
social post. One canonical phrasing per week, identical in both places.

**Why:** AEO citations follow *quotable, attributable claims*. A sentence an
engine can lift verbatim and attribute is far likelier to be cited than a
paragraph it must summarise. Consistency between the page and the social post reinforces
that the claim originated with you.

**Effort:** small. **This is the highest-value social item.**

### 3. Named human authority (E-E-A-T)

**What:** replace the anonymous `Person: "The Editor"` with a named author
carrying a real background, on `/about` and in the entity graph, linked to a
professional profile.

**Why:** E-E-A-T is in the `seo-audit` skill's checklist. For a publication
making editorial judgements about an industry, a named expert is citable where
"The Editor" is not. This is worth more than `sameAs` and more than most of
this list.

**Caveat:** a real trade-off, not a defect. Plenty of trade newsletters are
deliberately pseudonymous. If the anonymity is a choice, keep it and skip this.

**Effort:** small technically; a decision, not a task.

### 4. Social as a crawl-discovery channel, not a ranking one

**What:** post each new digest to one platform whose links Google actually
crawls, within hours of publishing.

**Why:** this is the genuinely underrated mechanism. Google discovered 25 of
your pages not at all for months because the sitemap had gone stale — social
posts are an independent discovery path that does not depend on the sitemap
being re-read. The value is *crawl discovery*, not link equity.

**Caveat:** most platforms `nofollow` outbound links, so this passes no
ranking signal. Worth doing for discovery and audience, not for SEO.

**Effort:** small if automated off the weekly pipeline, which already has the
digest data and an email/podcast distribution step to hook into.

### 5. Syndication with correct canonicals

**What:** republish the weekly editorial take to LinkedIn Articles or
Substack, with a `rel=canonical` or a prominent "originally published at" link
back to the digest page.

**Why:** reaches an audience that will not find you via search, while keeping
the canonical version on your domain.

**Caveat:** get the canonical wrong and you are competing with yourself. The
existing `LIVE_CANONICAL_MISMATCH` and `GSC_CANONICAL_OVERRIDDEN` checks would
catch it, which is some comfort.

**Effort:** medium, mostly editorial.

---

## Technical items

### 6. Core Web Vitals from the CrUX / GSC API

The `seo-audit` skill lists Core Web Vitals; nothing currently measures them.
Real field data is available via the Search Console API rather than synthetic
Lighthouse runs. **Medium effort, genuine best-practice coverage gap.**

### 7. Schema depth pass

`FAQPage` exists on `/about`. Candidates elsewhere: `Speakable` on the weekly
summary, `Dataset` for the article counts, per-article `NewsArticle` beyond the
`ItemList` entries. **Low effort, speculative value — do not add schema for its
own sake.**

### 8. The four "Crawled – currently not indexed" pages

`/es/about`, `/da/methodology`, and two digests. Google saw them and declined.
Usually means thin or duplicative content — the locale pages are thin
translations of English pages, which is likely the real answer. **Investigate
before acting: the fix might legitimately be to noindex them.**

### 9. Wire the optimiser into a cadence

`npm run seo:optimize` is manual. It currently reports one info-level
opportunity, so there is nothing to react to — worth scheduling only once it
has something to say.

### 10. The measurement loop (deferred, and correctly so)

Ship a change, freeze that page for 4–6 weeks, then compare GSC before/after.
Needs the `LedgerEntry`-style record that was deliberately removed as dead
code.

**Revisit at roughly 5,000 impressions/month.** At 177, one extra click moves
a page's CTR by more than any real improvement would, so the loop would
confidently report noise. Building it now would produce a precise instrument
for a signal that is not there.

---

## Deliberately not doing

- **DNS or registrar automation.** No way to test a change before it is live,
  48-hour propagation, and a wrong record takes down email and payments too —
  not just SEO. Diagnosis only.
- **Filing reconsideration requests.** A written appeal read by a person at
  Google. A bad one costs weeks.
- **Chasing social signals as a ranking factor.** They are not one.
- **Inventing `sameAs` URLs.** Fabricated structured data is worse than absent
  structured data.
