/**
 * /podcast/feed.xml — RSS 2.0 feed with iTunes tags for the weekly podcast.
 *
 * Every week the pipeline produces data/weeks/{week}/podcast.json and
 * public/podcast/{week}.mp3, but until this route existed nothing let a
 * podcast app subscribe. Submit this URL once to Spotify for Podcasters,
 * Apple Podcasts Connect and YouTube Music; after that, new episodes are
 * picked up automatically (roadmap F3.2, 2026-09-18).
 *
 * Episode order is newest first. Weeks without a podcast.json or without the
 * MP3 on disk are skipped rather than published with a dead enclosure.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { getSiteUrl } from '@/lib/utils/siteUrl';
import { weekLabelToSlug } from '@/lib/utils/weekSlug';
import { getAvailableWeekLabels } from '@/lib/seo/urlInventory';
import { formatDateRange } from '@/lib/utils/formatDate';

// Re-read at most hourly; a new episode appears once a week.
export const revalidate = 3600;

const SHOW_TITLE = 'Luxury Intelligence Weekly';
const SHOW_AUTHOR = 'Luxury Intelligence';
const SHOW_EMAIL = 'hello@luxury-intel.com';
const SHOW_DESCRIPTION =
  'A weekly, AI-narrated briefing on what moved in luxury, jewellery, ecommerce and AI: ' +
  'the stories that mattered, why they matter, and what to watch next. ' +
  'Produced from the Luxury Intelligence digest at luxury-intel.com.';

interface Episode {
  weekLabel: string;
  title: string;
  description: string;
  pageUrl: string;
  audioUrl: string;
  audioBytes: number;
  durationSeconds: number;
  publishedAt: Date;
  imageUrl?: string;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function toItunesDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

async function loadEpisode(siteUrl: string, weekLabel: string): Promise<Episode | null> {
  const root = process.cwd();
  try {
    const podcast = JSON.parse(
      await fs.readFile(path.join(root, 'data', 'weeks', weekLabel, 'podcast.json'), 'utf-8')
    ) as { audioPath?: string; duration?: number; generatedAt?: string };
    if (!podcast.audioPath) return null;

    const audioFile = path.join(root, 'public', podcast.audioPath);
    const stat = await fs.stat(audioFile);
    if (!stat.isFile() || stat.size === 0) return null;

    const digest = JSON.parse(
      await fs.readFile(path.join(root, 'data', 'digests', `${weekLabel}.json`), 'utf-8')
    ) as {
      startISO?: string; endISO?: string; oneSentenceSummary?: string;
      editorialTake?: string; coverImageUrl?: string; keyThemes?: string[];
    };

    const dateRange = digest.startISO && digest.endISO
      ? formatDateRange(digest.startISO, digest.endISO)
      : weekLabel;
    const themes = digest.keyThemes?.length ? ` Key themes: ${digest.keyThemes.join(', ')}.` : '';
    const description = [
      digest.oneSentenceSummary,
      digest.editorialTake?.split(/\n\s*\n/)[0],
    ].filter(Boolean).join(' ') + themes || `The Luxury Intelligence briefing for ${dateRange}.`;

    return {
      weekLabel,
      title: `${dateRange} · Luxury Intelligence Weekly`,
      description,
      pageUrl: `${siteUrl}/digest/${weekLabelToSlug(weekLabel)}`,
      audioUrl: `${siteUrl}${podcast.audioPath}`,
      audioBytes: stat.size,
      durationSeconds: Math.round(podcast.duration ?? 0),
      publishedAt: new Date(podcast.generatedAt ?? digest.endISO ?? Date.now()),
      imageUrl: digest.coverImageUrl ? `${siteUrl}${digest.coverImageUrl}` : undefined,
    };
  } catch {
    return null;
  }
}

export async function GET() {
  const siteUrl = getSiteUrl();
  const weekLabels = await getAvailableWeekLabels(path.join(process.cwd(), 'data', 'digests'));
  const episodes = (await Promise.all(weekLabels.map(w => loadEpisode(siteUrl, w))))
    .filter((e): e is Episode => e !== null)
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());

  const artwork = `${siteUrl}/podcast/artwork.png`;
  const lastBuild = (episodes[0]?.publishedAt ?? new Date()).toUTCString();

  const items = episodes.map(e => `
    <item>
      <title>${escapeXml(e.title)}</title>
      <link>${escapeXml(e.pageUrl)}</link>
      <guid isPermaLink="false">${escapeXml(`luxury-intel-podcast-${e.weekLabel}`)}</guid>
      <pubDate>${e.publishedAt.toUTCString()}</pubDate>
      <description>${escapeXml(e.description)}</description>
      <enclosure url="${escapeXml(e.audioUrl)}" length="${e.audioBytes}" type="audio/mpeg" />
      <itunes:title>${escapeXml(e.title)}</itunes:title>
      <itunes:summary>${escapeXml(e.description)}</itunes:summary>
      <itunes:duration>${toItunesDuration(e.durationSeconds)}</itunes:duration>
      <itunes:explicit>false</itunes:explicit>
      <itunes:episodeType>full</itunes:episodeType>${e.imageUrl ? `
      <itunes:image href="${escapeXml(e.imageUrl)}" />` : ''}
    </item>`).join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
     xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
     xmlns:atom="http://www.w3.org/2005/Atom"
     xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${escapeXml(SHOW_TITLE)}</title>
    <link>${escapeXml(siteUrl)}/</link>
    <atom:link href="${escapeXml(siteUrl)}/podcast/feed.xml" rel="self" type="application/rss+xml" />
    <language>en</language>
    <copyright>© ${new Date().getUTCFullYear()} ${escapeXml(SHOW_AUTHOR)}</copyright>
    <description>${escapeXml(SHOW_DESCRIPTION)}</description>
    <lastBuildDate>${lastBuild}</lastBuildDate>
    <image>
      <url>${escapeXml(artwork)}</url>
      <title>${escapeXml(SHOW_TITLE)}</title>
      <link>${escapeXml(siteUrl)}/</link>
    </image>
    <itunes:author>${escapeXml(SHOW_AUTHOR)}</itunes:author>
    <itunes:summary>${escapeXml(SHOW_DESCRIPTION)}</itunes:summary>
    <itunes:type>episodic</itunes:type>
    <itunes:explicit>false</itunes:explicit>
    <itunes:image href="${escapeXml(artwork)}" />
    <itunes:category text="Business">
      <itunes:category text="Marketing" />
    </itunes:category>
    <itunes:category text="News">
      <itunes:category text="Business News" />
    </itunes:category>
    <itunes:owner>
      <itunes:name>${escapeXml(SHOW_AUTHOR)}</itunes:name>
      <itunes:email>${escapeXml(SHOW_EMAIL)}</itunes:email>
    </itunes:owner>${items}
  </channel>
</rss>
`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
