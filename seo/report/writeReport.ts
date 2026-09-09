import { promises as fs } from 'fs';
import path from 'path';
import { renderMarkdown } from './markdown';
import type { SeoReport } from '../types';

const REPORT_DIR = path.join(process.cwd(), 'data', 'seo');

export async function writeReport(report: SeoReport): Promise<{ jsonPath: string; mdPath: string }> {
  await fs.mkdir(REPORT_DIR, { recursive: true });

  const jsonPath = path.join(REPORT_DIR, `report-${report.week}.json`);
  const mdPath = path.join(REPORT_DIR, `report-${report.week}.md`);
  const latestJsonPath = path.join(REPORT_DIR, 'latest.json');

  await fs.writeFile(jsonPath, JSON.stringify(report, null, 2), 'utf-8');
  await fs.writeFile(mdPath, renderMarkdown(report), 'utf-8');
  await fs.writeFile(latestJsonPath, JSON.stringify(report, null, 2), 'utf-8');

  console.log(`[SEO] ✓ Report saved to: ${jsonPath}`);
  console.log(`[SEO] ✓ Report saved to: ${mdPath}`);

  return { jsonPath, mdPath };
}
