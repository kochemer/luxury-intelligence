import { permanentRedirect } from 'next/navigation';
import { weekLabelToSlug } from '@/lib/utils/weekSlug';

/**
 * Legacy route — permanently redirects to /digest/[slug].
 * Handles all weeks including future ones not covered by next.config.ts redirects.
 */
export default async function LegacyWeekPage({
  params,
}: {
  params: Promise<{ weekLabel: string }>;
}) {
  const { weekLabel } = await params;
  const slug = weekLabelToSlug(weekLabel);
  permanentRedirect(`/digest/${slug}`);
}
