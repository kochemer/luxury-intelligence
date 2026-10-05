/**
 * Thin analytics facade.
 * Enriches every event with global props, gates on consent, forwards to Amplitude.
 * In dev/preview: runs data-quality guardrails (warn only, never block).
 */

import * as amplitude from '@amplitude/unified';
import { getGlobalEventProps } from './context';
import { getAnalyticsConsent } from './consent';

export type { LastClickAttribution, FirstTouchAttribution } from './attribution';
export { getLastClickAttribution, getFirstTouchAttribution } from './attribution';
export { getGlobalEventProps } from './context';
export {
  getAnalyticsConsent,
  setAnalyticsConsent,
  hasConsentChoice,
  openConsentSettings,
  clearAnalyticsStorage,
  CONSENT_CHANGE_EVENT,
  CONSENT_OPEN_EVENT,
} from './consent';
export type { ConsentValue } from './consent';

// ——— Allowlisted event names (from docs/analytics/measurement-plan.md) ———
// To extend: add the new event name here and document it in measurement-plan.md.
export const ANALYTICS_EVENT_ALLOWLIST: readonly string[] = [
  'page_view',
  'digest_view',
  'article_click',
  'filter_changed',
  'search_used',
  'subscribe_view',
  'checkout_start',
  'checkout_complete',
  'share_clicked',
];

// ——— Required global props on every event ———
// To extend: add the key here and ensure getGlobalEventProps() (context.ts) sets it.
export const ANALYTICS_REQUIRED_GLOBAL_PROPS: readonly string[] = [
  'schema_version',
  'app_env',
  'route_path',
  'page_type',
  'timestamp',
  'acq_channel_last_click',
];

// Keys that suggest PII; if present in payload in dev/preview we warn (do not send PII in event props).
const SUSPICIOUS_PII_KEYS = [
  'email',
  'phone',
  'name',
  'first_name',
  'last_name',
  'address',
];

const isDev = process.env.NODE_ENV === 'development';
const isPreview = process.env.NEXT_PUBLIC_VERCEL_ENV === 'preview';
const runGuardrails = isDev || isPreview;

function runDataQualityGuardrails(
  eventName: string,
  payload: Record<string, unknown>,
): void {
  if (!runGuardrails) return;

  const allowlistSet = new Set(ANALYTICS_EVENT_ALLOWLIST);
  if (!allowlistSet.has(eventName)) {
    console.warn(
      `[analytics] Unknown event name: "${eventName}". Add to ANALYTICS_EVENT_ALLOWLIST and measurement-plan.md if intentional.`,
    );
  }

  const missingRequired = ANALYTICS_REQUIRED_GLOBAL_PROPS.filter(
    (key) =>
      payload[key] === undefined ||
      payload[key] === null ||
      payload[key] === '',
  );
  if (missingRequired.length > 0) {
    console.warn(
      `[analytics] Missing required global props for "${eventName}":`,
      missingRequired.join(', '),
    );
  }

  const payloadKeys = Object.keys(payload).map((k) => k.toLowerCase());
  const suspiciousFound = SUSPICIOUS_PII_KEYS.filter((pii) =>
    payloadKeys.includes(pii),
  );
  if (suspiciousFound.length > 0) {
    console.warn(
      `[analytics] Payload for "${eventName}" contains keys that may be PII (avoid sending in event props):`,
      suspiciousFound.join(', '),
    );
  }
}

export function track(
  eventName: string,
  props?: Record<string, unknown>,
): void {
  if (typeof window === 'undefined') return;

  if (!getAnalyticsConsent()) return;

  const payload: Record<string, unknown> = {
    ...getGlobalEventProps(),
    ...(props || {}),
  };

  runDataQualityGuardrails(eventName, payload);

  if (isDev || isPreview) {
    // eslint-disable-next-line no-console
    console.log('[analytics]', eventName, payload);
  }

  try {
    amplitude.track(eventName, payload);
  } catch {
    // Amplitude may not be initialized yet — silently ignore; never block navigation.
  }
}
