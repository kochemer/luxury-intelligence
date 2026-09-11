/**
 * List all subscribers from the database.
 * Run: npx tsx scripts/listSubscribers.ts
 */
import { loadEnv } from '../lib/env';
import { getDb } from '../lib/db/index';
import { subscribers } from '../lib/db/schema';

loadEnv();

async function main() {
  const rows = await getDb().select().from(subscribers);
  console.log(`Subscribers (${rows.length}):\n`);
  rows.forEach((r, i) => {
    const email = r.email ?? '(no email)';
    const plan = r.planType;
    const digest = r.emailDigestEnabled ? 'yes' : 'no';
    const payment = r.paymentStatus ?? '-';
    const created = r.createdAt ? new Date(r.createdAt).toISOString().slice(0, 10) : '-';
    console.log(`${i + 1}. ${email}`);
    console.log(`   plan: ${plan} | digest: ${digest} | payment: ${payment} | created: ${created}\n`);
  });
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
