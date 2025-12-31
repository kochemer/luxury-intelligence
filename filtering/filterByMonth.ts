import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as monthCET from '../utils/monthCET';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Article type as in ingestion/fetchRss.ts
type Article = {
  id: string;
  title: string;
  url: string;
  source: string;
  published_at: string;
  ingested_at: string;
};

const DATA_PATH = path.join(__dirname, '../data/articles.json');

// Return articles whose published_at falls within the current CET calendar month.
// (window is [start, end], inclusive. Period represents full month in CET.)
export async function filterArticlesByCETMonth(
  inputDate?: Date
): Promise<{ monthLabel: string; articles: Article[] }> {
  // Use the provided date or now, to determine the month window (CET).
  const date = inputDate ?? new Date();
  const { monthStartCET, monthEndCET, monthLabel } = monthCET.getMonthRangeCET(date);

  let articles: Article[] = [];
  try {
    const raw = await fs.readFile(DATA_PATH, 'utf-8');
    articles = JSON.parse(raw);
  } catch (err) {
    console.error('Failed to read articles.json:', (err as Error).message);
    return { monthLabel: monthLabel, articles: [] };
  }

  const windowStart = monthStartCET.getTime();
  const windowEnd = monthEndCET.getTime();

  // Filter if published_at is within [windowStart, windowEnd] (inclusive, and not assuming 7 days).
  const filtered = articles.filter((article) => {
    if (!article.published_at) return false;
    const dt = new Date(article.published_at);
    if (isNaN(dt.getTime())) return false;
    const t = dt.getTime();
    return t >= windowStart && t <= windowEnd;
  });

  return { monthLabel: monthLabel, articles: filtered };
}

// CLI runner
filterArticlesByCETMonth()
  .then(({ monthLabel, articles }) => {
    console.log(`${monthLabel}: ${articles.length} articles`);
    process.exit(0);
  })
  .catch((err) => {
    console.error('Filtering failed:', err);
    process.exit(1);
  });

