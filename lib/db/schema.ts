import {
  pgTable,
  pgEnum,
  text,
  boolean,
  timestamp,
  uuid,
  bigserial,
  date,
  index,
  integer,
  primaryKey,
  serial,
  jsonb,
} from 'drizzle-orm/pg-core';

// ── Enums ─────────────────────────────────────────────────────────────────────

/** Subscription tier. "none" = unsubscribed / pre-payment. */
export const planTypeEnum = pgEnum('plan_type', [
  'none',
  'free',
  'supporter_monthly',
  'patron_monthly',
]);

/** Mirrors Stripe subscription statuses. */
export const paymentStatusEnum = pgEnum('payment_status', [
  'active',
  'canceled',
  'past_due',
  'incomplete',
  'unpaid',
  'trialing',
]);

// ── Table ─────────────────────────────────────────────────────────────────────

export const subscribers = pgTable('subscribers', {
  id: uuid('id').primaryKey().defaultRandom(),

  // Nullable at the DB level; the UNIQUE index allows multiple NULLs (SQL standard).
  // Application layer should always validate format before writing.
  email: text('email').unique(),

  planType: planTypeEnum('plan_type').notNull().default('none'),

  // Whether this person should receive the weekly email digest.
  // Kept separate from plan_type so free subscribers can opt in/out independently.
  emailDigestEnabled: boolean('email_digest_enabled').notNull().default(false),

  // Stripe fields — populated by webhook handler (Step 3).
  stripeCustomerId:     text('stripe_customer_id').unique(),
  stripeSubscriptionId: text('stripe_subscription_id').unique(),
  paymentStatus:        paymentStatusEnum('payment_status'),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Cookieless visit counter ──────────────────────────────────────────────────
// One row per page view, written by /api/hit for every visitor (no consent
// needed: no cookies, no IP, no stable identifier). `visitor` is a one-way
// hash of IP + user agent with that day's salt; salts older than a day are
// deleted, after which the hash can't be linked to anyone. See
// lib/analytics/visits.ts.

export const pageHits = pgTable('page_hits', {
  id:       bigserial('id', { mode: 'number' }).primaryKey(),
  day:      date('day').notNull(),
  path:     text('path').notNull(),
  /** First page of a page load (landing); channel/referrer only meaningful here. */
  entry:    boolean('entry').notNull().default(false),
  channel:  text('channel'),
  referrer: text('referrer'),
  country:  text('country'),
  device:   text('device'),
  /** Null for bots — they're stored only so the number filtered out is known. */
  visitor:  text('visitor'),
  bot:      boolean('bot').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [index('page_hits_day_idx').on(t.day)]);

export const analyticsSalts = pgTable('analytics_salts', {
  day:  date('day').primaryKey(),
  salt: text('salt').notNull(),
});

// Daily visit history from before the counter existed, imported once from
// Amplitude (which saw every visitor until the consent change on 2026-10-05).
// One row per day x dimension x value, e.g. (2026-09-20, 'country', 'Denmark', 2).
// Dimensions: visitors, bots, pageviews, channel, referrer, country, device.
// Written by scripts/backfillVisitHistory.ts; read by lib/analytics/visits.ts.
export const visitHistory = pgTable('visit_history', {
  day:   date('day').notNull(),
  dim:   text('dim').notNull(),
  value: text('value').notNull().default(''),
  n:     integer('n').notNull(),
}, t => [primaryKey({ columns: [t.day, t.dim, t.value] })]);

// Outbound article clicks, counted anonymously like page views: per day and
// article only — no visitor hash, IP or cookie. Written by /api/click for
// every reader (lib/analytics/visits.ts recordArticleClick); days up to
// HISTORY_END also hold clicks imported from Amplitude by
// scripts/backfillVisitHistory.ts.
export const articleClicks = pgTable('article_clicks', {
  day:    date('day').notNull(),
  url:    text('url').notNull(),
  title:  text('title').notNull().default(''),
  source: text('source').notNull().default(''),
  n:      integer('n').notNull(),
}, t => [primaryKey({ columns: [t.day, t.url] })]);

// ── Historical insights (/analytics) ─────────────────────────────────────────
// Tiles written by the weekly agent (lib/analytics/insights/). The text carries
// traffic facts, so it lives here and never in the repo. `evidence` is the fact
// ids and values the tile was checked against at write time. The page shows the
// active rows (retired_on is null), newest first, max 6.
export const analyticsInsights = pgTable('analytics_insights', {
  id:        serial('id').primaryKey(),
  /** InsightTile with the chart resolved to numbers. */
  tile:      jsonb('tile').notNull(),
  evidence:  jsonb('evidence').notNull(),
  sources:   text('sources').array().notNull(),
  addedOn:   date('added_on').notNull().defaultNow(),
  /** 'seed' | 'agent' */
  addedBy:   text('added_by').notNull(),
  retiredOn: date('retired_on'),
  /** 'agent' | 'owner' */
  retiredBy: text('retired_by'),
  model:     text('model'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Inferred TypeScript types ─────────────────────────────────────────────────

export type Subscriber    = typeof subscribers.$inferSelect;
export type NewSubscriber = typeof subscribers.$inferInsert;
