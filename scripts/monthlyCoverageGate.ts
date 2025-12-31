import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { getMonthRangeCET } from "../utils/monthCET.js";
import { SOURCE_FEEDS, SOURCE_PAGES } from "../ingestion/sources.js";
import type { Article } from "../ingestion/types.js";

// Source group mappings
const JEWELLERY_PATTERNS = [/jeweller/i, /\bJCK\b/i, /professional jeweller/i, /national jeweler/i];
const LUXURY_PATTERNS = [/luxury daily/i];

// Get all source names for groups (from feeds+pages)
function namesByGroup(patterns: RegExp[]) {
  const allSources = [...SOURCE_FEEDS, ...SOURCE_PAGES];
  return allSources
    .map(s => s.name)
    .filter(n => patterns.some(rx => rx.test(n)));
}

const JEWELLERY_SOURCES = namesByGroup(JEWELLERY_PATTERNS);
const LUXURY_SOURCES = namesByGroup(LUXURY_PATTERNS);

function groupNameOfSource(source: string) {
  if (JEWELLERY_SOURCES.includes(source)) return "Jewellery";
  if (LUXURY_SOURCES.includes(source)) return "Luxury";
  return null;
}

async function main() {
  // Load articles
  const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../data");
  const articlesPath = path.join(dataDir, "articles.json");
  let articles: Article[] = [];
  try {
    const raw = await fs.readFile(articlesPath, "utf8");
    articles = JSON.parse(raw) as Article[];
  } catch (err) {
    console.error(`Cannot read or parse ${articlesPath}:`, err);
    process.exit(2);
  }

  // Get current month window (CET)
  const { monthStartCET, monthEndCET, monthLabel } = getMonthRangeCET(new Date());
  const startIso = monthStartCET.toISOString();
  const endIso = monthEndCET.toISOString();

  // Filter articles to this month (inclusive range: start <= published < (end + 1ms))
  const thisMonthArticles = articles.filter(a =>
    a.published_at &&
    a.published_at >= startIso &&
    a.published_at <= endIso
  );

  // Tally by group
  const byGroup: {
    Jewellery: Article[];
    Luxury: Article[];
  } = {
    Jewellery: [],
    Luxury: []
  };
  for (const art of thisMonthArticles) {
    const g = groupNameOfSource(art.source);
    if (g) {
      byGroup[g].push(art);
    }
  }

  // Prepare month label
  // monthLabel should be like "Month: 2024-06 (CET)", we want "2024-06" for easier reading
  const labelMatch = monthLabel.match(/(\d{4}-\d{2})/);
  const monthLabelShort = labelMatch ? labelMatch[1] : monthLabel;

  console.log(
    `\n=== Coverage summary for month ${monthLabelShort} (${monthStartCET.toISOString()} — ${monthEndCET.toISOString()}) ===`
  );

  // Print summary
  for (const group of ["Jewellery", "Luxury"] as const) {
    const arts = byGroup[group];
    const sources = new Set(arts.map((a: Article) => a.source));
    console.log(
      `[${group}] ${arts.length} articles this month from sources: ` +
      (sources.size > 0 ? Array.from(sources).join(", ") : "None")
    );
  }

  // Exit with error if coverage not met
  let fail = false;
  if (byGroup.Jewellery.length < 10) {
    console.error(
      `Fail: Only ${byGroup.Jewellery.length} jewellery articles this month (minimum: 10 required)`
    );
    fail = true;
  }
  if (byGroup.Luxury.length < 5) {
    console.error(
      `Fail: Only ${byGroup.Luxury.length} luxury articles this month (minimum: 5 required)`
    );
    fail = true;
  }
  if (fail) process.exit(1);

  console.log("Coverage gate passed.");
}

// Only run when invoked directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

