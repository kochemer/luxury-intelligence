# Distribution channels: accounts, how each is fed, owner decisions

Where Luxury Intelligence is published outside the site, how content reaches
each channel, and what is still open. Every state claim is dated; replace stale
lines rather than appending.

## Channels (as of 2026-10-13)

| Channel | Account / URL | State | How content gets there |
|---|---|---|---|
| Website | https://luxury-intel.com | Live | Weekly pipeline (`docs/pipeline.md`) |
| Email | Resend, sender in `EMAIL_FROM` | Live | `scripts/sendWeeklyEmailDigest.ts` |
| YouTube | https://www.youtube.com/@luxury-intel | Live; uploads land **private** until Google approves the API audit (submitted 2026-10-12) | `weekly-short.yml`, see `video-short/README.md` |
| Spotify | https://open.spotify.com/show/1aKp7bTOtYtYJGLMjyvxQf (dashboard: https://creators.spotify.com/home/show/1aKp7bTOtYtYJGLMjyvxQf) | Live since 2026-10-13, all 41 episodes | Pulls `/podcast/feed.xml` automatically; nothing to upload |
| Apple Podcasts | not submitted | Not started as of 2026-10-13: the owner must sign in at podcastsconnect.apple.com and accept Apple's terms first | Will pull the same RSS feed |
| LinkedIn | https://www.linkedin.com/company/luxury-intel | Page created 2026-10-13, 0 followers, no posts yet | Automated from W42 (first post Mon 2026-10-19): Monday issue post via Buffer, see "How posting runs" |
| X | https://x.com/luxintel_hq | Created 2026-10-13, 0 posts, 0 follows | Automated from W42: Monday thread + Tue–Fri story of the day via Buffer |

Since 2026-10-14 the profile links are on the site: footer (all four),
"Follow the podcast: Spotify" under the player, "Follow on Spotify" in the
email, and all four in the Organization's `sameAs`. One list feeds them all:
`lib/socialProfiles.ts`.

Content plan and automation design: `docs/superpowers/specs/2026-10-14-social-content-plan.md`.

## Podcast feed

- Feed: `https://luxury-intel.com/podcast/feed.xml`, built by
  `app/podcast/feed.xml/route.ts` from `data/weeks/*/podcast.json` and the digests.
- Artwork: `public/podcast/artwork.png`, 1400×1400, the minimum Spotify and Apple accept.
- Owner email in the feed (`<itunes:owner>`): `luxuryintelligence@zohomail.eu`.
  Spotify and Apple send ownership codes there. Changed from the dead
  `hello@luxury-intel.com` in c1ed982.
- Spotify settings chosen on claim: Denmark, English, Business & Technology › Business.
  Title, description, artwork and episodes all come from the feed; edit them in
  the route, never in the Spotify dashboard.

## LinkedIn page details (set 2026-10-13)

- Name: Luxury Intelligence · URL slug `luxury-intel`
- Tagline: "Weekly intelligence on luxury, ecommerce and retail technology"
- Industry: Online Audio and Video Media · Size 0-1 · Self-owned
- Location: Copenhagen, Denmark (primary, no street address)
- Custom button: "Visit website" → https://luxury-intel.com
- Logo: `public/icons/icon-512.png`. No cover banner yet (needs 1128×191).
- Overview still says "every Sunday" as of 2026-10-14; the digest has published
  on Mondays since W42 (see `.github/workflows/weekly-digest.yml`). Fix on the page.
- Admin: the owner's personal profile, which lists *Founder & Editor, Luxury
  Intelligence* (from December 2025) linked to the page.

## X account details (set 2026-10-13)

- Handle `@luxintel_hq` (`luxury_intel` and `luxuryintel` were taken). Signed up
  with `luxuryintelligence@zohomail.eu`, which is also the recovery route.
- Bio: "Weekly intelligence on luxury, ecommerce & retail tech. The signals that
  matter, every Monday. Free newsletter ↓" · Website https://luxury-intel.com ·
  Location Copenhagen, Denmark
- Logo `public/icons/icon-512.png`. The 1500×500 banner was made in a Claude in
  Chrome chat and is not in the repo.
- Public posts; not findable by email or phone. No Premium, no connected apps.
- Not done as of 2026-10-14: two-factor authentication (owner), a pinned intro
  post (the bio's "↓" points at it).
- API: X moved to pay-per-use credits in 2026 (per third-party reports). Check
  current pricing at https://docs.x.com before building automated posting.

## Buffer (publishing for LinkedIn and X, set up 2026-10-14)

- Free plan (3 channels, 2 used), login `luxuryintelligence@zohomail.eu`, no
  payment method. Org timezone Europe/Berlin (Buffer wouldn't save
  Europe/Copenhagen; same rules). Org ID `6acfc203469d5c57ecd96058`.
- Channels: LinkedIn Page "Luxury Intelligence" `6acfc785778b240e2f0baa9d`;
  X "luxintel_hq" `6acfcebb778b240e2f0c3998`.
- API: GraphQL at `https://api.buffer.com`, header `Authorization: Bearer <key>`.
  Docs https://developers.buffer.com/. Key "luxury-intel pipeline" lives in the
  GitHub secret and `.env.local` as `BUFFER_API_KEY`; verified working
  2026-10-14. Keys are managed at https://publish.buffer.com/settings/api.
- Free-plan rate limits (all keys combined): 100 / 15 min, 500 / 24 h,
  10,000 / 30 days.
- LinkedIn Page posts: text ≤ 3,000 chars; ≤ 20 images; 1 video; 1 PDF per post
  (a document title is required, or the post won't schedule).
- X posts: 280 chars; ≤ 4 images or 1 video (0.5–140 s); threads up to 25 posts.

## Owner decisions

- **2026-10-13:** separate brand accounts on LinkedIn and X. On LinkedIn that means
  a Company Page administered from the owner's personal profile; a made-up
  personal profile for the brand would break LinkedIn's terms.
- **2026-10-13:** the podcast stays hosted on our own RSS feed. No Spotify hosting,
  monetisation, ads or video podcast.
- **2026-10-14:** posting is fully automatic with no approval step and zero
  owner time; brand accounts only (LinkedIn page + X), no personal-profile
  posting. Publishing goes through Buffer's free plan.
- **2026-10-14:** no LinkedIn Community Management API application. It requires a
  registered legal entity and Luxury Intelligence isn't one (owner has no plans
  to register yet). Revisit only if the business is registered. Plan: `docs/superpowers/specs/2026-10-14-social-content-plan.md`.

## How posting runs (built 2026-10-14, Phase 1)

1. Monday: `weekly-digest.yml` → after the Short, `weekly-social.yml` runs
   `npm run social:build`. It writes `data/weeks/<week>/social.json`: six posts
   (LinkedIn issue post Mon 10:00, X thread Mon 10:30, X story of the day
   Tue–Fri 12:00, Copenhagen time), each written by the `polish` model from the
   digest only. Links, hashtags and fixed lines are added in code.
2. Every post passes `social/checks.ts` or is dropped: length, hashtags, house
   style, no claim that a person picked or read the stories, every number and
   name must appear in the digest, no repeat of the last 8 weeks. One retry
   with the problems listed, then dropped. Dropped posts are never sent; the
   owner is emailed.
3. `social:publish` sends **only today's** posts to Buffer at their planned time
   (Monday right after the build, Tue–Fri from `social-publish.yml` at 05:30
   UTC). It first checks every link answers, and skips posts Buffer already has
   (safe re-runs). A post whose slot has passed goes out 5 minutes later, but
   not after 20:00.
4. Posts are marked AI-assisted in Buffer, and on X with Buffer's
   `isAiGenerated` flag (PRODUCT.md: honest about automation).

Every automated post ends with the same fixed line, "Read, listen or watch
the full issue, free every Monday: <link>" (X stories: "More in this week's
issue: <link>"), so the choice of format (PRODUCT.md, value proposition) is in
every post.

Profile banners (LinkedIn 2256×382, X 1500×500, YouTube 2560×1440) are in
`assets/social/`, made by `node assets/social/renderBanners.mjs` (headless
Chrome, site fonts and colours).

Test without posting: `npm run social:publish -- --dry-run` (checks only) or
`--draft` (saves Buffer drafts). Rebuild a week's posts before they go out:
`npm run social:build -- --week=YYYY-Www --force`.

Live test 2026-10-14: the W41 LinkedIn post (image + link) and X thread (5
posts + image) were accepted by Buffer as drafts, found by date, and deleted.

## Things that will bite you

- **The Buffer API key expires on 2026-11-13** (30 days after creation). When it
  does, every post fails. Create a new key at
  https://publish.buffer.com/settings/api, then `gh secret set BUFFER_API_KEY`
  and update `.env.local`. The publish step must warn by email ahead of expiry.
- **Buffer free plan: only 1 scheduled X thread in the queue at a time**, and 10
  queued posts per channel. That's why the publish step runs daily and schedules
  only that day's posts, not the whole week on Monday.
- **LinkedIn "first comment" is paid-only on Buffer.** Links go in the post body.

- **Contact addresses on `luxury-intel.com` don't receive mail.** The real inbox is
  `luxuryintelligence@zohomail.eu`, which the About (privacy), Terms and Feedback
  pages show since 2026-10-13 (they used to show `feedback@luxury-intel.com`). The
  email sender `noreply@luxury-intel.com` only sends. Never put a
  `@luxury-intel.com` address anywhere a person or platform will reply to or
  send a verification code.
- **Don't automate LinkedIn or X through browser bots or unofficial tools.** Both
  can restrict the account. Use the official APIs or a scheduler that does.
- **LinkedIn API tokens expire after 60 days** unless the app is an approved
  partner, so a direct integration needs a re-auth plan.
