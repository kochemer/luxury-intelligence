# Social content plan: what we post where, fully automated

Status: plan, nothing built yet (2026-10-14). Accounts and links: `docs/distribution.md`.

## Goal and constraints (owner, 2026-10-14)

- **Goal:** grow free subscribers (`PRODUCT.md`). Every post exists to bring someone
  to an issue or to `/subscribe`.
- **Fully automatic, zero owner time.** No approval step. The owner may reshare or
  reply now and then, but nothing depends on it.
- **Fail closed.** A post that fails any check is dropped and the owner gets an
  email. A doubtful post never goes out; a missing post is fine.
- **Honest about automation** (`PRODUCT.md`): never claim a human picked, read or
  reviewed an issue. Bios and posts may say "AI-assisted".
- **Monday is issue day.** The digest workflow runs Mondays 06:00 UTC
  (`.github/workflows/weekly-digest.yml`).
- **No paid tools beyond Buffer's free plan** unless the 8-week review says
  otherwise.

## Raw material (already produced every week, nothing new to write)

| Material | Where |
|---|---|
| 28 ranked stories, 7 per category, with summaries | `data/digests/{week}.json` → `topics` |
| Headline sentence, Editor's Spotlight, key themes | same file: `oneSentenceSummary`, `editorialTake`, `keyThemes` |
| Cover image | `coverImageUrl` |
| Podcast, 13–18 min | `public/podcast/{week}.mp3`, script in `data/weeks/{week}/podcast-script.txt` |
| 60 s Short (vertical; horizontal can be rendered) | `video-short/`, `data/weeks/{week}/video.json` |
| Signals: theme share of articles, coverage vs share price | `data/markets/{luxury,jewellery}.json` |

Posts are written **only from this material**. No new facts, no outside browsing.

## Channel roles

| Channel | Role | Voice |
|---|---|---|
| LinkedIn page | Main channel; the only one that has brought traffic | Brand editorial voice: a sharp analyst, plain English, one clear point per post |
| YouTube | Discovery through search and Shorts recommendations; podcast audience | Same, spoken |
| X | Experiment: a newswire-style account | Shorter, one fact per post |
| Spotify (+ Apple later) | Podcast listeners; fed by RSS, no posting | Show notes |

## Weekly calendar (Copenhagen time)

| Day | LinkedIn page | X @luxintel_hq | YouTube | Spotify |
|---|---|---|---|---|
| **Mon** | 10:00 **Issue post** (P1) | 10:30 **Issue thread** (P1) | Short (live) | Episode via RSS (live) |
| **Tue** | — | 12:00 **Story of the day** (P1) | 12:00 **Podcast as video** (P2) | — |
| **Wed** | 09:00 **Slide post**, "the week in 6 slides" (P2) | 12:00 Story of the day (P1) | — | — |
| **Thu** | 09:00 **Signal chart** (P2) | 12:00 **Signal chart** (P2), else story of the day | Category Short (P3) | — |
| **Fri** | 09:00 **Short as native video** (P3) | 12:00 Story of the day (P1) | — | — |

That's 1 LinkedIn post a week in Phase 1, rising to 4. X gets 5 in Phase 1.
LinkedIn rewards consistency more than volume, so we never post more than once a day.

## Post formats

All links carry `utm_source={linkedin|x|youtube|spotify}&utm_medium=social&utm_campaign={week}&utm_content={format}`.

**LinkedIn issue post (Mon).** 900–1,300 characters. Opening line = the week's
point, taken from the Spotlight, written to stop the scroll. Then 3 signals, one
line each, each naming a brand or number. Close: one line with the issue link. Cover
image attached. 3 hashtags at most, from a fixed list (#luxury #retailtech
#ecommerce #jewelry #AI). No emojis as bullets; no "🚀".

**LinkedIn slide post (Wed, P2).** PDF, 6 slides at 1080×1350: title slide with the
week's point → 4 slides, one story each (headline, the "why it matters" line, source)
→ end slide with the subscribe link. Rendered from HTML with the site's colours,
like the cover pipeline. Short caption, 300–500 characters.

**Signal chart (Thu, P2).** One chart PNG from the markets data: the theme whose
share moved most against its 4-week average, or the brand whose coverage pulled
furthest from its share price. Caption: the number, why it's notable, a link to
`/markets/...`. If nothing crosses the threshold already set in `markets/signals.ts`,
the post is skipped. This is the seed of roadmap N3 (Signal Index).

**Short as native video (Fri, P3).** The week's Short uploaded straight to LinkedIn
and X (not a YouTube link). The caption is the Short's title plus the issue link.

**X issue thread (Mon).** 4–5 posts: (1) the week's point, no link; (2–4) one story
each, ≤ 260 characters, no link; (5) "Full issue, free every Monday:" + link.
Cover image on post 1.

**X story of the day (Tue–Fri).** One story from the issue that wasn't in the thread,
≤ 260 characters, as a 2-post thread with the link in the second post. The pool is
the issue's 28 stories, highest-ranked first, at most one per category per week.

**Podcast as video (Tue, P2).** 1920×1080: cover image + the episode's title +
burned-in captions from the script, audio from the MP3, chapters per story in the
description. Uploaded with the existing YouTube uploader to a "Weekly briefing"
playlist. Needs the YouTube API audit approved (uploads are private until then).

**Category Short (Thu, P3).** A second Short per week, focused on one category in
rotation. Kept to 2 Shorts a week until data says more helps. Repetitive mass-made AI
video risks YouTube's "inauthentic content" policy, so each Short must differ in
structure, not just text.

## Spotify and the podcast

RSS keeps Spotify running with no posting. What makes it richer, all in
`app/podcast/feed.xml/route.ts` and the podcast step (P1 unless noted):

1. **Episode titles that say something.** Today: "Oct 4-11th 2026 · Luxury
   Intelligence Weekly". Better for Spotify search and for clicks: the week's point
   first, date last, e.g. "Americans quit European fashion over returns · W41".
2. **Show notes.** The story list with links, a subscribe link (UTM), and
   timestamps per story. Spotify and Apple turn `MM:SS` lines in the description
   into chapters. Timestamps come from the TTS step, which already knows each
   segment's length.
3. **Episode cover art** is already sent (`<itunes:image>` per episode).
4. **Links on the site and in the email:** "Listen on Spotify" next to the MP3 player
   and in the email's "Watch & listen" band (P1; the profile links go in the footer
   and in `sameAs` at the same time).
5. **Not doing:** Spotify-hosted video podcast (owner chose to keep RSS hosting),
   polls and Q&A (they need a human to manage them).

## How it runs

```
weekly-digest.yml (Mon 06:00 UTC)
  └─ build digest → podcast → Short → email (as today)
  └─ NEW social step  → data/weeks/{week}/social.json + data/weeks/{week}/social/*.png|pdf
       • one LLM call per format, with the digest text as the only input
       • slides and charts rendered from HTML (Playwright); podcast video with FFmpeg
  └─ NEW checks (each post; any failure drops that post and emails the owner)
       • length and hashtag limits per channel
       • every URL returns 200
       • every brand, number and quote in the post appears in the digest or markets data
       • no claim that a human picked, read or reviewed the issue
       • no post repeated from the last 8 weeks (similarity check)
  └─ NEW publish → Buffer API: each post scheduled with its exact time
       (≤ 5 posts per channel per week, under the free plan's 10-in-queue cap)
     YouTube uploads go through the existing uploader.
```

Re-running the week must not double-post: the publish step records each sent post's
Buffer ID in `social.json` and skips posts that already have one.

## Phases

| Phase | Contents | Depends on |
|---|---|---|
| **P0** (now) | Buffer account with both channels; LinkedIn banner; profile links on the site; first 2–3 posts | Owner: Buffer setup |
| **P1** | Social step + checks + Buffer publish: LinkedIn issue post, X thread, X story of the day. Podcast titles and show notes. Spotify links | P0 |
| **P2** | Slide post, signal chart, podcast as YouTube video | YouTube audit for the video |
| **P3** | Short as native video on LinkedIn/X, category Shorts | P2 working for 4 weeks |
| **Review** | 8 weeks after P1's first run: sign-ups per channel and per format (UTM); drop what brings none, X first | P1 |

## Costs

| Item | Cost |
|---|---|
| Buffer free plan (3 channels, 10 queued posts each, API included) | $0 |
| X posting | $0 through Buffer. Direct API would be $0.015/post, $0.20 with a link |
| LLM for posts | Cents per week |
| Rendering (slides, charts, video) | $0, runs in GitHub Actions |
| LinkedIn Community Management API (applied in parallel) | $0; needs a registered legal entity and a review |

## Open questions

- Is Luxury Intelligence a registered legal entity? Without one, LinkedIn will
  likely refuse the Community Management API and Buffer stays the route.
- Does Buffer's free plan post to X without restrictions, and does its API support
  LinkedIn PDF (document) posts, video, and X threads? Check during P0. If PDF
  isn't supported, the slide post becomes a multi-image post.

## What we deliberately don't do

Automated replies, likes, follows or DMs; engagement pods; bought followers;
browser bots. Each breaks platform rules or the honesty commitment, and each can get
the accounts restricted.
