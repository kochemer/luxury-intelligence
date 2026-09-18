/**
 * Resend webhook: stop sending to addresses that bounce or complain.
 *
 * Resend signs webhooks with Svix. We verify the signature (HMAC-SHA256 over
 * "{svix-id}.{svix-timestamp}.{body}" with the base64 secret after "whsec_"),
 * reject stale timestamps, then flip emailDigestEnabled=false for every
 * recipient of an `email.bounced` or `email.complained` event.
 *
 * Setup (owner, once): Resend dashboard → Webhooks → Add endpoint
 *   URL:    https://luxury-intel.com/api/resend/webhook
 *   Events: email.bounced, email.complained
 * then put the endpoint's signing secret in Vercel as RESEND_WEBHOOK_SECRET.
 *
 * Idempotent: disabling an already-disabled subscriber is a no-op, which is
 * what Svix's at-least-once delivery needs.
 */

import { NextResponse } from 'next/server';
import { setEmailDigestEnabled } from '@/lib/db/subscribers';
import { verifySvixSignature } from '@/lib/webhooks/svix';

const HANDLED_EVENTS = new Set(['email.bounced', 'email.complained']);

interface ResendEvent {
  type?: string;
  created_at?: string;
  data?: { to?: string[] | string; email_id?: string; bounce?: { type?: string } };
}

export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[Resend webhook] RESEND_WEBHOOK_SECRET not set; refusing');
    return NextResponse.json({ error: 'webhook not configured' }, { status: 503 });
  }

  const body = await request.text();
  const verdict = verifySvixSignature({
    secret,
    id: request.headers.get('svix-id'),
    timestamp: request.headers.get('svix-timestamp'),
    signature: request.headers.get('svix-signature'),
    body,
  });
  if (!verdict.ok) {
    console.warn(`[Resend webhook] rejected: ${verdict.reason}`);
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  let event: ResendEvent;
  try {
    event = JSON.parse(body) as ResendEvent;
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  if (!event.type || !HANDLED_EVENTS.has(event.type)) {
    // Acknowledge everything else so Resend does not retry it.
    return NextResponse.json({ received: true, ignored: event.type ?? 'unknown' });
  }

  const recipients = (Array.isArray(event.data?.to) ? event.data!.to : [event.data?.to])
    .filter((e): e is string => typeof e === 'string' && e.includes('@'));

  const disabled: string[] = [];
  for (const email of recipients) {
    const row = await setEmailDigestEnabled(email, false);
    if (row) disabled.push(email);
  }

  console.log(
    `[Resend webhook] ${event.type}` +
      (event.data?.bounce?.type ? ` (${event.data.bounce.type})` : '') +
      `: disabled digest for ${disabled.length}/${recipients.length} recipient(s)`
  );
  return NextResponse.json({ received: true, disabled: disabled.length });
}
