import { NextRequest } from 'next/server';
import { recordArticleClick } from '@/lib/analytics/visits';

/**
 * Anonymous article-click beacon (see recordArticleClick). Always 204, so
 * counting can never affect a reader following a link.
 */
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const text = await req.text();
    if (text.length > 2000) return new Response(null, { status: 204 });
    const body = JSON.parse(text) as { u?: unknown; t?: unknown; s?: unknown; w?: unknown };
    await recordArticleClick({
      url: body.u,
      title: body.t,
      source: body.s,
      webdriver: body.w,
      userAgent: req.headers.get('user-agent'),
    });
  } catch (err) {
    console.warn('[click] not recorded:', (err as Error)?.message ?? err);
  }
  return new Response(null, { status: 204 });
}
