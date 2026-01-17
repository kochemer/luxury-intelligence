import path from 'path';
import { promises as fs } from 'fs';
import type { Topic } from '../classification/classifyTopics';

export type CategoryLabel =
  | "Jewellery Industry"
  | "Artificial Intelligence News"
  | "Ecommerce & Retail Tech"
  | "Fashion & Luxury";

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

// Backward compatibility: support both old and new category names when reading reports
export const TOPIC_TO_CATEGORY_LABEL: Record<Topic, CategoryLabel> = {
  "AI_and_Strategy": "Artificial Intelligence News",
  "Ecommerce_Retail_Tech": "Ecommerce & Retail Tech",
  "Luxury_and_Consumer": "Fashion & Luxury",
  "Jewellery_Industry": "Jewellery Industry"
};

// Alias map for backward compatibility when reading old reports
export const CATEGORY_LABEL_ALIASES: Record<string, CategoryLabel> = {
  "AI & Strategy": "Artificial Intelligence News",
  "Luxury & Consumer": "Fashion & Luxury",
  "Ecommerce & Retail Tech": "Ecommerce & Retail Tech",
  "Jewellery Industry": "Jewellery Industry",
  // New names map to themselves
  "Artificial Intelligence News": "Artificial Intelligence News",
  "Fashion & Luxury": "Fashion & Luxury",
};

export const RSS_SOURCE_CATEGORY: Record<string, CategoryLabel> = {
  "Jeweller - Business News": "Jewellery Industry",
  "Jeweller - Jewellery Trends": "Jewellery Industry",
  "Jeweller - Main": "Jewellery Industry",
  "JCK Online": "Jewellery Industry",
  "Professional Jeweller": "Jewellery Industry",
  "Luxury Daily - Retail": "Fashion & Luxury",
  "Luxury Daily - Commerce": "Fashion & Luxury",
  "Luxury Daily - Research": "Fashion & Luxury",
  "Retail Dive": "Ecommerce & Retail Tech",
  "Practical Ecommerce": "Ecommerce & Retail Tech",
  "Modern Retail": "Ecommerce & Retail Tech",
  "TechCrunch Ecommerce": "Ecommerce & Retail Tech",
  "Digital Commerce 360": "Ecommerce & Retail Tech",
  "NYTimes Technology": "Artificial Intelligence News",
  "MIT Sloan Management Review – AI": "Artificial Intelligence News",
  "Benedict Evans": "Artificial Intelligence News",
  "Stratechery": "Artificial Intelligence News"
};

export const PAGE_SOURCE_CATEGORY: Record<string, CategoryLabel> = {
  "BoF - News (The News in Brief)": "Fashion & Luxury",
  "MIT Technology Review - AI": "Artificial Intelligence News",
  // Consultancy sources
  "McKinsey - Retail & Consumer Insights": "Ecommerce & Retail Tech",
  "McKinsey - Consumer Insights": "Fashion & Luxury",
  "Bain - Retail & Consumer Insights": "Ecommerce & Retail Tech",
  "Bain - Technology & AI Insights": "Artificial Intelligence News",
  "BCG - Retail & Consumer Insights": "Ecommerce & Retail Tech",
  "BCG - Technology & AI Insights": "Artificial Intelligence News"
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
      "Artificial Intelligence News": createEmptyCategoryStats(),
      "Ecommerce & Retail Tech": createEmptyCategoryStats(),
      "Fashion & Luxury": createEmptyCategoryStats()
    }
  };
}

export async function writeIngestionReport(report: IngestionReport): Promise<void> {
  const outputPath = path.join(process.cwd(), 'data', 'weeks', report.week, 'ingestion-report.json');
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2), 'utf-8');
}
