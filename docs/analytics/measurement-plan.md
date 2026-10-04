# Luxury Intelligence — Analytics Measurement Plan

**Site:** luxury-intel.com  
**Purpose:** Single source of truth for analytics implementation (events, properties, attribution, quality).

---

## 1. Goals

- **Retention:** Measure return visits and digest engagement over time (e.g. weekly active readers, digest open/click rate).
- **Content performance:** Understand which digest weeks, articles, and page types drive engagement (views, clicks, time on page).
- **Subscription conversion:** Track funnel from subscribe intent → checkout start → checkout complete; optimize for conversion rate and drop-off.
- **Acquisition efficiency:** Compare cost and quality by channel (paid/organic search, social, email, referral, direct) to optimize spend and content distribution.

---

## 2. Core Funnels

| Funnel | Steps |
|--------|--------|
| **Digest → Article** | Acquisition (land/session) → Digest engagement (digest view, scroll) → Article click (outbound to source) |
| **Subscribe → Paid** | Acquisition → Subscribe view → Checkout start → Checkout complete |

---

## 3. Event Taxonomy

| `event_name` | When fired | Key properties |
|--------------|------------|----------------|
| `page_view` | Every full page load (SPA route or SSR load) | `page_title`, `page_type`, `route_path` |
| `digest_view` | Digest page or digest section in view (e.g. weekly digest / email digest) | `digest_week`, `digest_type` (e.g. `web`, `email`) |
| `article_click` | User clicks through to external article URL | `article_url`, `article_title`, `article_rank`, `digest_week`, `link_context` |
| `filter_changed` | User changes any filter (topic, date, etc.) | `filter_name`, `filter_value_previous`, `filter_value_new` |
| `search_used` | User submits search or uses search UI meaningfully | `search_term` (hashed if PII risk), `results_count` |
| `subscribe_view` | Subscribe CTA or subscribe page is viewed | `subscribe_source` (e.g. `footer`, `digest`, `modal`) |
| `checkout_start` | User starts checkout (e.g. clicks pay / enters checkout flow) | `checkout_provider`, `plan_id` or `product_id` |
| `checkout_complete` | Payment or subscription confirmed | `checkout_provider`, `plan_id`, `value` (if allowed by provider) |
| `share_clicked` | User clicks a share button | `share_destination` (e.g. `twitter`, `linkedin`, `copy_link`), `content_type`, `content_id` |

---

## 4. Global Properties (Every Event)

All events must include:

| Property | Description | Example / notes |
|----------|-------------|------------------|
| `timestamp` | ISO 8601 (UTC) | Auto-set at send time |
| `week` | Current digest week (YYYY-Www) or null | From `getCurrentDigestWeek()` or equivalent |
| `locale` | UI locale | e.g. `en`, `da` |
| `page_type` | High-level page type | `home`, `digest`, `article`, `subscribe`, `checkout`, `other` |
| `route_path` | Pathname (no query) | e.g. `/`, `/email-digest` |
| `referrer_domain` | Document referrer host (first touch in session) or empty | e.g. `google.com`, `twitter.com` |
| `utm_source` | Last-click UTM | |
| `utm_medium` | Last-click UTM | |
| `utm_campaign` | Last-click UTM | |
| `utm_content` | Last-click UTM | |
| `utm_term` | Last-click UTM | |
| `acq_channel_last_click` | Resolved channel (see §5) | e.g. `paid_search`, `organic_social` |
| `acq_source_last_click` | Resolved source | e.g. `google`, `newsletter` |
| `acq_medium_last_click` | Resolved medium | e.g. `cpc`, `email` |
| `acq_campaign_last_click` | Resolved campaign (UTM or empty) | |
| `schema_version` | Event schema version | e.g. `1` (bump on breaking changes) |
| `app_env` | Deployment environment | `prod` \| `preview` \| `dev` |

---

## 5. Channel Attribution (Last-Click)

**Rules:**

1. **UTMs override referrer:** If any UTM is present on the request, use UTM-based channel resolution; do not use referrer for that hit.
2. **No UTMs:** Infer channel from `referrer_domain`: AI assistants → `ai_assistant`, search engines → `search`, known social domains → `organic_social`, known email domains / links → `email`, other external → `referral`, no referrer → `direct`.
3. **Persistence:** Store last-click attribution (channel, source, medium, campaign) in session storage; optionally persist in a first-party cookie (e.g. 30 days) for cross-session consistency. Attach the same last-click set to every event in the session/page.

**Channel mapping (last-click):**

| Resolved channel | Typical source / medium / conditions |
|------------------|--------------------------------------|
| `paid_search` | `utm_medium=cpc` (or `ppc`, `paid`) and search-like source (e.g. `google`, `bing`) |
| `ai_assistant` | Referrer from an AI assistant (ChatGPT, Perplexity, Gemini, Copilot, Claude), no UTMs. Checked before `search` because Gemini is on a google.com subdomain. Added 2026-10-04 |
| `search` | Organic referrer from known search engine, no UTMs |
| `paid_social` | `utm_medium=paid_social` or social source + paid medium |
| `organic_social` | Referrer from known social domain, no UTMs or organic UTM |
| `email` | `utm_medium=email` or referrer from known email client/redirect domain |
| `referral` | External referrer, not search/social/email |
| `direct` | No referrer, no UTMs |
| `other` | Fallback when rules above do not match |

---

## 6. Naming Conventions

- **Events and properties:** `snake_case` only.
- **Events:** `verb_noun` (e.g. `article_click`, `filter_changed`, `checkout_complete`).
- **No duplicates:** One canonical event name per action; avoid aliases or vague names (e.g. use `article_click` not `click` or `link_click` for outbound article links).
- **Properties:** Noun or adjective (e.g. `route_path`, `digest_week`, `acq_channel_last_click`).

---

## 7. Data Quality Rules

- **Required props:** Every event must include all global properties (§4); event-specific required properties from §3 must be present. Reject or queue-for-fix events missing required props in dev/preview.
- **No PII:** Do not send emails, full names, or other identifiers that could identify a person in event payloads. Hash or omit if needed (e.g. search terms).
- **Schema versioning:** Each event carries `schema_version`. When adding/removing/renaming properties, bump the version and document in a changelog; keep backward compatibility for a defined period or support both versions in the pipeline.

---

*Last updated: 2026-03. Use this doc to drive tagging, SDK usage, and validation in the app.*
