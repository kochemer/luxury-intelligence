/**
 * Repository for subscriber records.
 * All functions are server-only (never imported by client components).
 *
 * The "unique when present" email rule is enforced by the DB UNIQUE constraint on
 * the email column. NULL values are treated as distinct by PostgreSQL, so rows
 * without an email (e.g. Stripe webhook creates before sign-up) are allowed.
 */

import { eq, and, or, inArray, isNotNull, isNull, lt } from 'drizzle-orm';
import { getDb } from './index';
import { subscribers } from './schema';
import type { Subscriber, NewSubscriber } from './schema';

// ── Helpers ───────────────────────────────────────────────────────────────────

function now() {
  return new Date();
}

// ── Read ──────────────────────────────────────────────────────────────────────

export async function getSubscriberByEmail(
  email: string,
): Promise<Subscriber | null> {
  const rows = await getDb()
    .select()
    .from(subscribers)
    .where(eq(subscribers.email, email.toLowerCase().trim()))
    .limit(1);
  return rows[0] ?? null;
}

export async function getSubscriberByStripeCustomerId(
  stripeCustomerId: string,
): Promise<Subscriber | null> {
  const rows = await getDb()
    .select()
    .from(subscribers)
    .where(eq(subscribers.stripeCustomerId, stripeCustomerId))
    .limit(1);
  return rows[0] ?? null;
}

/** Returns all subscribers who have opted in to the weekly email digest. */
export async function getWeeklyDigestRecipients(): Promise<Subscriber[]> {
  return getDb()
    .select()
    .from(subscribers)
    .where(
      and(
        eq(subscribers.emailDigestEnabled, true),
        isNotNull(subscribers.email),
      ),
    );
}

/**
 * Returns subscribers eligible to receive the weekly digest email.
 *
 * Eligibility rules:
 *   - email IS NOT NULL
 *   - email_digest_enabled = true
 *   - AND one of:
 *       plan_type = 'free'
 *       OR (plan_type IN ('supporter_monthly', 'patron_monthly') AND payment_status = 'active')
 */
export async function getEligibleWeeklyDigestRecipients(): Promise<Subscriber[]> {
  return getDb()
    .select()
    .from(subscribers)
    .where(
      and(
        isNotNull(subscribers.email),
        eq(subscribers.emailDigestEnabled, true),
        or(
          eq(subscribers.planType, 'free'),
          and(
            inArray(subscribers.planType, ['supporter_monthly', 'patron_monthly']),
            eq(subscribers.paymentStatus, 'active'),
          ),
        ),
      ),
    );
}

// ── Write ─────────────────────────────────────────────────────────────────────

/** Insert a new subscriber. Throws on duplicate email. */
export async function createSubscriber(
  data: Omit<NewSubscriber, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<Subscriber> {
  const email = data.email ? data.email.toLowerCase().trim() : data.email;
  const rows = await getDb()
    .insert(subscribers)
    .values({ ...data, email, createdAt: now(), updatedAt: now() })
    .returning();
  return rows[0]!;
}

/**
 * Insert-or-update by email address.
 * On conflict, merges only the supplied fields (does not clear unrelated fields).
 */
export async function upsertSubscriberByEmail(
  email: string,
  data: Partial<Omit<NewSubscriber, 'id' | 'email' | 'createdAt' | 'updatedAt'>>,
): Promise<Subscriber> {
  const normalised = email.toLowerCase().trim();
  const rows = await getDb()
    .insert(subscribers)
    .values({ email: normalised, ...data, createdAt: now(), updatedAt: now() })
    .onConflictDoUpdate({
      target: subscribers.email,
      set:    { ...data, updatedAt: now() },
    })
    .returning();
  return rows[0]!;
}

export async function updateSubscriberPlan(
  email: string,
  planType: Subscriber['planType'],
  paymentStatus?: Subscriber['paymentStatus'],
): Promise<Subscriber | null> {
  const rows = await getDb()
    .update(subscribers)
    .set({ planType, paymentStatus: paymentStatus ?? null, updatedAt: now() })
    .where(eq(subscribers.email, email.toLowerCase().trim()))
    .returning();
  return rows[0] ?? null;
}

export async function updateSubscriberStripeInfo(
  email: string,
  stripeCustomerId: string,
  stripeSubscriptionId: string,
  paymentStatus: Subscriber['paymentStatus'],
): Promise<Subscriber | null> {
  const rows = await getDb()
    .update(subscribers)
    .set({ stripeCustomerId, stripeSubscriptionId, paymentStatus, updatedAt: now() })
    .where(eq(subscribers.email, email.toLowerCase().trim()))
    .returning();
  return rows[0] ?? null;
}

export async function setEmailDigestEnabled(
  email: string,
  enabled: boolean,
): Promise<Subscriber | null> {
  const rows = await getDb()
    .update(subscribers)
    .set({ emailDigestEnabled: enabled, updatedAt: now() })
    .where(eq(subscribers.email, email.toLowerCase().trim()))
    .returning();
  return rows[0] ?? null;
}

/**
 * Update a subscriber located by their Stripe customer ID.
 * Used primarily by webhook handlers where we have the Stripe customer ID
 * but may not have the email readily available.
 * Returns null if no subscriber with that stripeCustomerId exists.
 */
export async function updateSubscriberByStripeCustomerId(
  stripeCustomerId: string,
  data: Partial<Omit<NewSubscriber, 'id' | 'createdAt' | 'updatedAt'>>,
): Promise<Subscriber | null> {
  const rows = await getDb()
    .update(subscribers)
    .set({ ...data, updatedAt: now() })
    .where(eq(subscribers.stripeCustomerId, stripeCustomerId))
    .returning();
  return rows[0] ?? null;
}

// ── Maintenance ───────────────────────────────────────────────────────────────

export interface StaleSweepResult {
  /** Rows older than the cutoff with planType='none' that opted into the digest → promoted to 'free'. */
  promoted: string[];
  /** Rows older than the cutoff with planType='none', no digest opt-in and no Stripe subscription → deleted. */
  deleted: string[];
}

/**
 * Clean up abandoned checkouts. A visitor who starts a paid checkout gets a
 * `planType='none'` row before Stripe confirms anything; if they never finish,
 * the row lingers forever, looks subscribed, and is silently excluded from
 * every send. Runs nightly from .github/workflows/subscriber-sweep.yml.
 *
 * Rows that still carry a Stripe subscription id are never touched here —
 * the Stripe webhook owns those.
 */
export async function sweepStaleNoneSubscribers(options: {
  olderThanHours?: number;
  dryRun?: boolean;
} = {}): Promise<StaleSweepResult> {
  const olderThanHours = options.olderThanHours ?? 24;
  const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
  const db = getDb();

  const stale = await db
    .select()
    .from(subscribers)
    .where(and(
      eq(subscribers.planType, 'none'),
      lt(subscribers.createdAt, cutoff),
      isNull(subscribers.stripeSubscriptionId),
    ));

  const toPromote = stale.filter(s => s.emailDigestEnabled && s.email);
  const toDelete  = stale.filter(s => !s.emailDigestEnabled);

  if (!options.dryRun) {
    if (toPromote.length > 0) {
      await db
        .update(subscribers)
        .set({ planType: 'free', updatedAt: now() })
        .where(inArray(subscribers.id, toPromote.map(s => s.id)));
    }
    if (toDelete.length > 0) {
      await db
        .delete(subscribers)
        .where(inArray(subscribers.id, toDelete.map(s => s.id)));
    }
  }

  return {
    promoted: toPromote.map(s => s.email ?? s.id),
    deleted:  toDelete.map(s => s.email ?? s.id),
  };
}
