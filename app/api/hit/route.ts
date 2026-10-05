import { NextRequest } from 'next/server';
import { recordHit } from '@/lib/analytics/visits';

/**
 * Cookieless visit beacon (see lib/analytics/visits.ts). Always answers 204
 * so a counting problem can never surface to a reader.
 */
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const text = await req.text();
    if (text.length > 2000) return new Response(null, { status: 204 });
    const body = JSON.parse(text) as { p?: unknown; e?: unknown; r?: unknown; w?: unknown };
    await recordHit({
      path: body.p,
      entry: body.e,
      referrer: body.r,
      webdriver: body.w,
      userAgent: req.headers.get('user-agent'),
      ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip'),
      country: req.headers.get('x-vercel-ip-country'),
      siteHost: req.headers.get('host') ?? 'luxury-intel.com',
    });
  } catch (err) {
    console.warn('[hit] not recorded:', (err as Error)?.message ?? err);
  }
  return new Response(null, { status: 204 });
}
