import { MetadataRoute } from 'next';
import { promises as fs } from 'fs';
import path from 'path';

async function getAvailableWeekLabels(): Promise<string[]> {
  try {
    const digestsDir = path.join(process.cwd(), 'data', 'digests');
    const files = await fs.readdir(digestsDir);
    const weekLabels = files
      .filter(file => file.endsWith('.json'))
      .map(file => file.replace('.json', ''))
      .filter(label => /^\d{4}-W\d{1,2}$/.test(label));
    return weekLabels;
  } catch {
    return [];
  }
}

async function getFileModifiedTime(filePath: string): Promise<Date> {
  try {
    const stats = await fs.stat(filePath);
    return stats.mtime;
  } catch {
    return new Date();
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 
    (process.env.NODE_ENV === 'production' 
      ? 'https://luxury-intelligence.vercel.app'
      : 'http://localhost:3000');

  const weekLabels = await getAvailableWeekLabels();
  const digestsDir = path.join(process.cwd(), 'data', 'digests');

  // Home page
  const homeEntry: MetadataRoute.Sitemap[0] = {
    url: baseUrl,
    lastModified: new Date(),
    changeFrequency: 'weekly',
    priority: 1.0,
  };

  // Archive page
  const archiveEntry: MetadataRoute.Sitemap[0] = {
    url: `${baseUrl}/archive`,
    lastModified: new Date(),
    changeFrequency: 'weekly',
    priority: 0.6,
  };

  // Week pages
  const weekEntries = await Promise.all(
    weekLabels.map(async (weekLabel) => {
      const filePath = path.join(digestsDir, `${weekLabel}.json`);
      const lastModified = await getFileModifiedTime(filePath);
      
      return {
        url: `${baseUrl}/week/${weekLabel}`,
        lastModified,
        changeFrequency: 'weekly' as const,
        priority: 0.8,
      };
    })
  );

  return [homeEntry, archiveEntry, ...weekEntries];
}

