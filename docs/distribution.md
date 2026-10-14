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
| LinkedIn | https://www.linkedin.com/company/luxury-intel | Page created 2026-10-13, 0 followers, no posts yet | Manual for now; automated posting is roadmap item N2 |
| X | https://x.com/luxintel_hq | Created 2026-10-13, 0 posts, 0 follows | Manual for now; automated posting planned with N2 |

None of these profile links are on the site yet (footer, `sameAs` in the
JSON-LD, email digest). Only YouTube is.

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

## Owner decisions

- **2026-10-13:** separate brand accounts on LinkedIn and X. On LinkedIn that means
  a Company Page administered from the owner's personal profile; a made-up
  personal profile for the brand would break LinkedIn's terms.
- **2026-10-13:** the podcast stays hosted on our own RSS feed. No Spotify hosting,
  monetisation, ads or video podcast.
- **Open:** N2 posting: page only, personal profile only, or both; fully
  automatic vs one-tap approval; scheduler (Typefully/Buffer) vs LinkedIn's own
  API (Community Management API needs an application and review).

## Things that will bite you

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
