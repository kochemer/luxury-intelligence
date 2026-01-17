import path from 'path';
import { promises as fs } from 'fs';
import type { Topic } from '../classification/classifyTopics';

export type CategoryLabel =
  | "Jewellery Industry"
  | "AI & Strategy"
  | "Ecommerce & Retail Tech"
  | "Luxury & Consumer";

export type IngestionExclusions = {
  nonEnglish: number;
  tooShort: number;
  notArticle: number;
  paywalled: number;
  controversial: number;
  duplicate: number;
};

export type IngestionCategoryStats = {
  rss_found: number;
  discovery_found: number;
  fetched_ok: number;
  extracted_ok: number;
  excluded: IngestionExclusions;
  final_candidates: number;
};

export type IngestionReport = {
  week: string;
  generatedAt: string;
  categories: Record<CategoryLabel, IngestionCategoryStats>;
};

export const TOPIC_TO_CATEGORY_LABEL: Record<Topic, CategoryLabel> = {
  "AI_and_Strategy": "AI & Strategy",
  "Ecommerce_Retail_Tech": "Ecommerce & Retail Tech",
  "Luxury_and_Consumer": "Luxury & Consumer",
  "Jewellery_Industry": "Jewellery Industry"
};

export const RSS_SOURCE_CATEGORY: Record<string, CategoryLabel> = {
  "Jeweller - Business News": "Jewellery Industry",
  "Jeweller - Jewellery Trends": "Jewellery Industry",
  "Jeweller - Main": "Jewellery Industry",
  "JCK Online": "Jewellery Industry",
  "Professional Jeweller": "Jewellery Industry",
  "Luxury Daily - Retail": "Luxury & Consumer",
  "Luxury Daily - Commerce": "Luxury & Consumer",
  "Luxury Daily - Research": "Luxury & Consumer",
  "Retail Dive": "Ecommerce & Retail Tech",
  "Practical Ecommerce": "Ecommerce & Retail Tech",
  "Modern Retail": "Ecommerce & Retail Tech",
  "TechCrunch Ecommerce": "Ecommerce & Retail Tech",
  "Digital Commerce 360": "Ecommerce & Retail Tech",
  "NYTimes Technology": "AI & Strategy",
  "MIT Sloan Management Review – AI": "AI & Strategy",
  "Benedict Evans": "AI & Strategy",
  "Stratechery": "AI & Strategy"
};

export const PAGE_SOURCE_CATEGORY: Record<string, CategoryLabel> = {
  "BoF - News (The News in Brief)": "Luxury & Consumer",
  "MIT Technology Review - AI": "AI & Strategy"
};

function createEmptyCategoryStats(): IngestionCategoryStats {
  return {
    rss_found: 0,
    discovery_found: 0,
    fetched_ok: 0,
    extracted_ok: 0,
    excluded: {
      nonEnglish: 0,
      tooShort: 0,
      notArticle: 0,
      paywalled: 0,
      controversial: 0,
      duplicate: 0
    },
    final_candidates: 0
  };
}

export function createEmptyReport(weekLabel: string): IngestionReport {
  return {
    week: weekLabel,
    generatedAt: new Date().toISOString(),
    categories: {
      "Jewellery Industry": createEmptyCategoryStats(),
      "AI & Strategy": createEmptyCategoryStats(),
      "Ecommerce & Retail Tech": createEmptyCategoryStats(),
      "Luxury & Consumer": createEmptyCategoryStats()
    }
  };
}

export async function writeIngestionReport(report: IngestionReport): Promise<void> {
  const outputPath = path.join(process.cwd(), 'data', 'weeks', report.week, 'ingestion-report.json');
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2), 'utf-8');
}
