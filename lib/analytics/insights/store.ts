/**
 * Reads and writes the `analytics_insights` table (see lib/db/schema.ts).
 * The only module that knows the row shape; the page and the agent use the
 * types in ./types.
 */

import { and, asc, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { analyticsInsights } from '@/lib/db/schema';
import type {
  CheckedInsight, EvidenceRef, InsightRecord, InsightSource, InsightTile, StoredInsight,
} from './types';

type Row = typeof analyticsInsights.$inferSelect;

function toRecord(r: Row): InsightRecord {
  return {
    id: r.id,
    tile: r.tile as InsightTile,
    sources: r.sources as InsightSource[],
    addedOn: r.addedOn,
    addedBy: r.addedBy as 'seed' | 'agent',
    evidence: r.evidence as EvidenceRef[],
    retiredOn: r.retiredOn,
    retiredBy: r.retiredBy as 'agent' | 'owner' | null,
  };
}

/**
 * Display order: newer days first (added_on desc), but insights added on the
 * same day keep the order they were inserted in (id asc), because the starting
 * set was inserted in a deliberate order. Not unit-tested: needs a DB.
 */
const DISPLAY_ORDER = [desc(analyticsInsights.addedOn), asc(analyticsInsights.id)] as const;

/** Active insights for the page, newest day first, insertion order within a day. */
export async function listActiveInsights(limit = 6): Promise<StoredInsight[]> {
  const rows = await getDb().select().from(analyticsInsights)
    .where(isNull(analyticsInsights.retiredOn))
    .orderBy(...DISPLAY_ORDER)
    .limit(limit);
  return rows.map(r => {
    const { id, tile, sources, addedOn, addedBy } = toRecord(r);
    return { id, tile, sources, addedOn, addedBy };
  });
}

/** Active insights with their evidence, for the agent and its checks (no limit). */
export async function listActiveRecords(): Promise<InsightRecord[]> {
  const rows = await getDb().select().from(analyticsInsights)
    .where(isNull(analyticsInsights.retiredOn))
    .orderBy(...DISPLAY_ORDER);
  return rows.map(toRecord);
}

/**
 * Every retired insight, owner-removed and agent-retired. Owner-removed ones
 * are a signal the owner did not want it; agent-retired ones were replaced to
 * make room. Both count for the duplicate check so a tile does not come back.
 */
export async function listRemovedInsights(): Promise<InsightRecord[]> {
  const rows = await getDb().select().from(analyticsInsights)
    .where(isNotNull(analyticsInsights.retiredOn))
    .orderBy(desc(analyticsInsights.id));
  return rows.map(toRecord);
}

/** Adds a checked insight; with `retire`, retires that active one in the same batch. Returns the new id. */
export async function insertInsight(
  insight: CheckedInsight,
  by: 'seed' | 'agent',
  model: string | null,
): Promise<number> {
  const db = getDb();
  const values = {
    tile: insight.tile,
    evidence: insight.evidence,
    sources: insight.sources,
    addedBy: by,
    model,
  };
  if (insight.retire == null) {
    const [row] = await db.insert(analyticsInsights).values(values).returning({ id: analyticsInsights.id });
    return row!.id;
  }
  // One round trip, all or nothing: never 7 active tiles, never 5 after a failed insert.
  const [, inserted] = await db.batch([
    db.update(analyticsInsights)
      .set({ retiredOn: sql`current_date`, retiredBy: 'agent' })
      .where(and(eq(analyticsInsights.id, insight.retire), isNull(analyticsInsights.retiredOn))),
    db.insert(analyticsInsights).values(values).returning({ id: analyticsInsights.id }),
  ]);
  return inserted[0]!.id;
}

/** Retires one active insight. Returns false when it was not active. */
export async function retireInsight(id: number, by: 'agent' | 'owner'): Promise<boolean> {
  const rows = await getDb().update(analyticsInsights)
    .set({ retiredOn: sql`current_date`, retiredBy: by })
    .where(and(eq(analyticsInsights.id, id), isNull(analyticsInsights.retiredOn)))
    .returning({ id: analyticsInsights.id });
  return rows.length > 0;
}

