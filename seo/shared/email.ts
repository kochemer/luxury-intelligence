/**
 * Email delivery for the SEO system — one implementation, used by the daily
 * alert and the weekly summary.
 *
 * Shared because the hard part is not sending, it is knowing whether the send
 * worked. Resend v4 does not throw when it rejects a message: an unverified
 * sender domain, a bad recipient, an invalid key or a rate limit all come back
 * as `{ error }` on a resolved promise. The daily alert originally ignored that
 * and logged success regardless. A second email path written from scratch
 * would be the obvious place to make the same mistake again.
 */

import { Resend } from 'resend';

export interface OutgoingEmail {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface SendResponse {
  data?: { id?: string } | null;
  error?: { message?: string } | null;
}

/** Injectable so delivery handling can be tested offline, without the network. */
export type EmailSender = (email: OutgoingEmail) => Promise<SendResponse>;

export interface EmailConfig {
  to: string;
  from: string;
  apiKey: string;
}

export type ConfigResult =
  | { ok: true; config: EmailConfig }
  | { ok: false; reason: 'no-recipient' | 'no-sender'; message: string };

/**
 * Read delivery settings.
 *
 * "No recipient" and "no sender credentials" are reported separately because
 * they mean different things: the first is a legitimate choice (a local run
 * that should not email anyone), the second is a misconfiguration.
 */
export function getEmailConfig(): ConfigResult {
  const to = process.env.SEO_ALERT_EMAIL?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  const apiKey = process.env.RESEND_API_KEY?.trim();

  if (!to) {
    return { ok: false, reason: 'no-recipient', message: 'SEO_ALERT_EMAIL not set — nothing emailed.' };
  }
  if (!from || !apiKey) {
    return { ok: false, reason: 'no-sender', message: 'RESEND_API_KEY or EMAIL_FROM missing — cannot send email.' };
  }
  return { ok: true, config: { to, from, apiKey } };
}

function resendSender(apiKey: string): EmailSender {
  const resend = new Resend(apiKey);
  return (email) => resend.emails.send(email) as Promise<SendResponse>;
}

export interface DeliveryResult {
  delivered: boolean;
  /** Resend's message id when delivered — the evidence that it was accepted. */
  id?: string;
  error?: string;
}

/**
 * Send one email and report honestly whether it was accepted.
 *
 * Delivered means both no error *and* a message id. An error is decisive even
 * if an id is also present, and a response with neither is treated as unsent,
 * since there is then no evidence the message went anywhere.
 *
 * Never throws: a mail failure must not crash whatever was trying to report.
 */
export async function deliverEmail(
  email: Omit<OutgoingEmail, 'from' | 'to'>,
  config: EmailConfig,
  send?: EmailSender
): Promise<DeliveryResult> {
  try {
    const deliver = send ?? resendSender(config.apiKey);
    const response = await deliver({ ...email, from: config.from, to: config.to });

    if (response.error) {
      return { delivered: false, error: response.error.message || JSON.stringify(response.error) };
    }
    if (!response.data?.id) {
      return { delivered: false, error: 'Resend returned no message id, so there is no evidence it was accepted.' };
    }
    return { delivered: true, id: response.data.id };
  } catch (err) {
    return { delivered: false, error: err instanceof Error ? err.message : String(err) };
  }
}
