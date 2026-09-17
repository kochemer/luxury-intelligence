/**
 * @module sources
 *
 * Master list of RSS feeds and web pages ingested by the weekly pipeline.
 *
 * ## Tier system
 *
 * Sources are split into four tiers based on editorial quality and relevance:
 *
 * | Tier | Description | Priority |
 * |------|-------------|----------|
 * | 1 | Global business & news (FT, WSJ, Bloomberg, Guardian) | Highest — broad, authoritative |
 * | 2 | Retail, ecommerce & commerce-tech specialists | High — directly on-topic for digest |
 * | 3 | Luxury, fashion, jewellery & consumer specialists | High — directly on-topic for digest |
 * | 4 | AI, strategy & emerging tech | Medium — supplementary; heavy overlap with discovery |
 *
 * Tier 1 sources provide breadth and cross-vertical signals (AI policy, macro
 * trends) that specialists don't cover. Tiers 2–4 provide depth in the digest's
 * core verticals.
 *
 * ## Adding a new source
 * 1. Check that the feed URL returns valid RSS/Atom (use `curl -I <url>`).
 * 2. Pick the appropriate tier and `sourceType`.
 * 3. Add a `categoryHint` if the source maps cleanly to one topic (optional —
 *    omit for general/multi-topic sources).
 * 4. If the source frequently blocks direct fetches, add it to `fetchPages.ts`
 *    instead as a web page scrape target.
 *
 * ## Removed sources
 * Sources that were removed are kept as comments explaining why (bot protection,
 * deprecated feeds, index pages not genuine feeds). This prevents re-adding
 * known broken sources.
 */
import { SourceFeed, SourcePage } from './types.js';

// --- Tier 1: Global Business & News ---
const TIER_1_FEEDS: SourceFeed[] = [
  // Reuters - Business: Removed (tools/rss is an index page, not a feed; public feeds deprecated)
  {
    name: "Financial Times - Technology",
    url: "https://www.ft.com/technology?format=rss",
    tier: 1,
    sourceType: "news"
  },
  {
    name: "WSJ - Technology",
    url: "https://feeds.a.dj.com/rss/RSSWSJD.xml",
    tier: 1,
    sourceType: "news"
  },
  {
    name: "Bloomberg - Technology",
    url: "https://feeds.bloomberg.com/markets/news.rss",
    tier: 1,
    sourceType: "news"
  },
  {
    name: "Business Insider - Tech",
    url: "https://www.businessinsider.com/rss",
    tier: 1,
    sourceType: "news"
  },
  // Axios - Technology: Removed (feed consistently returns 0 items / blocked)
  {
    name: "The Verge",
    url: "https://www.theverge.com/rss/index.xml",
    tier: 1,
    sourceType: "news"
  },
  // Forbes - Technology: Removed (Cloudflare/bot protection, 403 in production)
  // Barron's - Technology: Removed (403/blocked, no public RSS available)
  // AP News - Technology: Removed (apnews.com/apf-technology is a section page, not RSS)
  {
    name: "The Guardian - Technology",
    url: "https://www.theguardian.com/technology/rss",
    tier: 1,
    sourceType: "news"
  },
  {
    name: "Economic Times - Technology",
    url: "https://economictimes.indiatimes.com/tech/rssfeeds/13357270.cms",
    tier: 1,
    sourceType: "news"
  }
];

// --- Tier 2: Retail, Ecommerce & Commerce-Tech ---
const TIER_2_FEEDS: SourceFeed[] = [
  {
    name: "Digital Commerce 360",
    url: "https://www.digitalcommerce360.com/feed/",
    tier: 2,
    sourceType: "retail"
  },
  // Retail Brew: Removed (403/blocked, gated content)
  {
    name: "Retail Dive",
    url: "https://www.retaildive.com/feeds/news/",
    tier: 2,
    sourceType: "retail"
  },
  {
    name: "Grocery Dive",
    url: "https://www.grocerydive.com/feeds/news/",
    tier: 2,
    sourceType: "retail"
  },
  {
    name: "Retail TouchPoints",
    url: "https://www.retailtouchpoints.com/feed/",
    tier: 2,
    sourceType: "retail"
  },
  {
    name: "Internet Retailing",
    url: "https://internetretailing.net/feed/",
    tier: 2,
    sourceType: "retail"
  },
  {
    name: "Practical Ecommerce",
    url: "https://www.practicalecommerce.com/feed",
    tier: 2,
    sourceType: "retail"
  },
  // Retail Tech Innovation Hub: Removed (404, site may be down or restructured)
  // ProCarrier: Removed (no valid RSS feed available)
  {
    name: "PYMNTS",
    url: "https://www.pymnts.com/feed/",
    tier: 2,
    sourceType: "retail"
  },
  // AI Shopper: Removed (redirects to landing page, no RSS feed)
  // BlueAlpha.ai: Removed (404, no RSS feed available)
  {
    name: "Marketing Week",
    url: "https://www.marketingweek.com/feed/",
    tier: 2,
    sourceType: "retail"
  },
  // The Drum: Removed (all URL variants return 404; no stable public RSS)

  {
    name: "Sourcing Journal",
    url: "https://sourcingjournal.com/feed/",
    tier: 2,
    sourceType: "retail"
  },
];

// --- Tier 5: Academic & Technical ---
const TIER_5_FEEDS: SourceFeed[] = [
  // TEMPORARILY DISABLED: Arxiv sources (to test ranking without Arxiv dominance)
  // {
  //   name: "arXiv - AI (cs.AI)",
  //   url: "http://arxiv.org/rss/cs.AI",
  //   tier: 5,
  //   sourceType: "academic"
  // },
  // {
  //   name: "arXiv - Machine Learning (cs.LG)",
  //   url: "http://arxiv.org/rss/cs.LG",
  //   tier: 5,
  //   sourceType: "academic"
  // },
  // {
  //   name: "arXiv - Computation and Language (cs.CL)",
  //   url: "http://arxiv.org/rss/cs.CL",
  //   tier: 5,
  //   sourceType: "academic"
  // },
  // Microsoft Research - AI: Removed (404)
];

// --- Tier 6: Regional / Specialist ---
const TIER_6_FEEDS: SourceFeed[] = [
  // Ritzau: Removed (parse error, no valid RSS feed structure)
  // TechRadar - Ecommerce: Removed (403/bot protection)
  {
    name: "TechCrunch - Commerce",
    url: "https://techcrunch.com/category/commerce/feed/",
    tier: 6,
    sourceType: "retail"
  },
  {
    name: "TechCrunch - AI",
    url: "https://techcrunch.com/category/artificial-intelligence/feed/",
    tier: 6,
    sourceType: "news"
  },
  {
    name: "Total Retail",
    url: "https://www.mytotalretail.com/feed/",
    tier: 6,
    sourceType: "retail"
  },
  {
    name: "Payments Journal",
    url: "https://www.paymentsjournal.com/feed/",
    tier: 6,
    sourceType: "retail"
  },
  {
    name: "Computerworld - Ecommerce",
    url: "https://www.computerworld.com/rss",
    tier: 6,
    sourceType: "specialist"
  },
  // ResultSense: Removed (404, no RSS feed available)
  {
    name: "UseInsider",
    url: "https://useinsider.com/blog/feed/",
    tier: 6,
    sourceType: "specialist"
  },
  // Neuron Expert: Removed (redirects to landing page, no RSS feed)
  {
    name: "ToneTag",
    url: "https://www.tonetag.com/blog/feed/",
    tier: 6,
    sourceType: "specialist"
  }
];

// --- Tier 2: Fashion & Luxury Media ---
const FASHION_LUXURY_FEEDS: SourceFeed[] = [
  {
    name: "Business of Fashion - News",
    url: "https://www.businessoffashion.com/feed/",
    tier: 2,
    sourceType: "fashion_luxury",
    categoryHint: "Fashion & Luxury"
  },
  {
    name: "WWD - Women's Wear Daily",
    url: "https://wwd.com/feed/",
    tier: 2,
    sourceType: "fashion_luxury",
    categoryHint: "Fashion & Luxury"
  },
  // FashionNetwork: Removed (403 blocked)
  {
    name: "Luxury Daily - Main",
    url: "https://www.luxurydaily.com/feed/",
    tier: 2,
    sourceType: "fashion_luxury",
    categoryHint: "Fashion & Luxury"
  },
  // Vogue Business: Removed (no public RSS feed found; all URLs return 404)
  {
    name: "Drapers",
    url: "https://www.drapersonline.com/feed/",
    tier: 2,
    sourceType: "fashion_luxury",
    categoryHint: "Fashion & Luxury"
  },
  // The Impression: Removed (returns HTML instead of RSS; blocked)
  // Jing Daily: Removed (404)
  {
    name: "Retail Gazette",
    url: "https://www.retailgazette.co.uk/feed/",
    tier: 2,
    sourceType: "fashion_luxury",
    categoryHint: "Fashion & Luxury"
  },
  {
    name: "Hypebeast - Business",
    url: "https://hypebeast.com/business/feed",
    tier: 2,
    sourceType: "fashion_luxury",
    categoryHint: "Fashion & Luxury"
  },
  {
    name: "Glossy",
    url: "https://www.glossy.co/feed/",
    tier: 2,
    sourceType: "fashion_luxury",
    categoryHint: "Fashion & Luxury"
  },
  {
    name: "Robb Report",
    url: "https://robbreport.com/feed/",
    tier: 2,
    sourceType: "fashion_luxury",
    categoryHint: "Fashion & Luxury"
  },
  {
    name: "Footwear News",
    url: "https://footwearnews.com/feed/",
    tier: 2,
    sourceType: "fashion_luxury",
    categoryHint: "Fashion & Luxury"
  },
  {
    name: "Luxe Digital",
    url: "https://luxe.digital/feed/",
    tier: 2,
    sourceType: "fashion_luxury",
    categoryHint: "Fashion & Luxury"
  },
  {
    name: "Fashionista",
    url: "https://fashionista.com/feed",
    tier: 2,
    sourceType: "fashion_luxury",
    categoryHint: "Fashion & Luxury"
  },
  {
    name: "Just Style",
    url: "https://www.just-style.com/feed/",
    tier: 2,
    sourceType: "fashion_luxury",
    categoryHint: "Fashion & Luxury"
  },
  {
    name: "Dazed",
    url: "https://www.dazeddigital.com/rss",
    tier: 3,
    sourceType: "fashion_luxury",
    categoryHint: "Fashion & Luxury"
  },
  {
    name: "Highsnobiety",
    url: "https://www.highsnobiety.com/feed/",
    tier: 3,
    sourceType: "fashion_luxury",
    categoryHint: "Fashion & Luxury"
  },
  {
    name: "Dezeen",
    url: "https://www.dezeen.com/feed/",
    tier: 3,
    sourceType: "fashion_luxury",
    categoryHint: "Fashion & Luxury"
  },
];

// --- Tier 2: Jewellery Industry ---
const JEWELLERY_FEEDS: SourceFeed[] = [
  {
    name: "Jeweller - Business News",
    url: "https://www.jewellermagazine.com/rss/jewellery-business.xml",
    tier: 2,
    sourceType: "jewellery",
    categoryHint: "Jewellery Industry"
  },
  {
    name: "Jeweller - Jewellery Trends",
    url: "https://www.jewellermagazine.com/rss/jewellery-trends.xml",
    tier: 2,
    sourceType: "jewellery",
    categoryHint: "Jewellery Industry"
  },
  {
    name: "Jeweller - Main",
    url: "https://www.jewellermagazine.com/rss/jeweller.xml",
    tier: 2,
    sourceType: "jewellery",
    categoryHint: "Jewellery Industry"
  },
  // JCK Online: Removed (feed returns 0 items — empty feed)
  {
    name: "A Blog to Watch",
    url: "https://www.ablogtowatch.com/feed/",
    tier: 2,
    sourceType: "jewellery",
    categoryHint: "Jewellery Industry"
  },
  {
    name: "Monochrome Watches",
    url: "https://monochrome-watches.com/feed/",
    tier: 2,
    sourceType: "jewellery",
    categoryHint: "Jewellery Industry"
  },
  {
    name: "Fratello Watches",
    url: "https://fratellowatches.com/feed/",
    tier: 2,
    sourceType: "jewellery",
    categoryHint: "Jewellery Industry"
  },
  {
    name: "Professional Jeweller",
    url: "https://www.professionaljeweller.com/feed/",
    tier: 2,
    sourceType: "jewellery",
    categoryHint: "Jewellery Industry"
  },
  // National Jeweler: Removed (404)
  // Jewellery Focus: Removed (network error / unreachable)
  // Rapaport News: Removed (404)
  {
    name: "Instore Magazine",
    url: "https://instoremag.com/feed/",
    tier: 2,
    sourceType: "jewellery",
    categoryHint: "Jewellery Industry"
  },
  {
    name: "WatchPro",
    url: "https://www.watchpro.com/feed/",
    tier: 2,
    sourceType: "jewellery",
    categoryHint: "Jewellery Industry"
  },
  // --- Added 17 Sep 2026 to enrich the thin Jewellery pool (all RSS-validated) ---
  {
    name: "The Jewellery Editor",
    url: "https://www.thejewelleryeditor.com/feed/",
    tier: 2,
    sourceType: "jewellery",
    categoryHint: "Jewellery Industry"
  },
  {
    name: "Retail Jeweller UK",
    url: "https://www.retail-jeweller.com/feed/",
    tier: 2,
    sourceType: "jewellery",
    categoryHint: "Jewellery Industry"
  },
  {
    name: "Watchonista",
    url: "https://www.watchonista.com/rss.xml",
    tier: 2,
    sourceType: "jewellery",
    categoryHint: "Jewellery Industry"
  },
  {
    name: "Worn & Wound",
    url: "https://wornandwound.com/feed/",
    tier: 2,
    sourceType: "jewellery",
    categoryHint: "Jewellery Industry"
  },
  {
    name: "SJX Watches",
    url: "https://watchesbysjx.com/feed",
    tier: 2,
    sourceType: "jewellery",
    categoryHint: "Jewellery Industry"
  },
  {
    name: "Time and Tide Watches",
    url: "https://timeandtidewatches.com/feed/",
    tier: 2,
    sourceType: "jewellery",
    categoryHint: "Jewellery Industry"
  },
  {
    name: "Quill & Pad",
    url: "https://quillandpad.com/feed/",
    tier: 2,
    sourceType: "jewellery",
    categoryHint: "Jewellery Industry"
  },
  // Hodinkee - Business: Removed (404)
  // Legacy Luxury Daily feeds (moved to Fashion & Luxury)
  {
    name: "Luxury Daily - Retail",
    url: "https://www.luxurydaily.com/category/news/retail/feed/",
    tier: 2,
    sourceType: "fashion_luxury",
    categoryHint: "Fashion & Luxury"
  },
  {
    name: "Luxury Daily - Commerce",
    url: "https://www.luxurydaily.com/category/news/commerce/feed/",
    tier: 2,
    sourceType: "fashion_luxury",
    categoryHint: "Fashion & Luxury"
  },
  {
    name: "Luxury Daily - Research",
    url: "https://www.luxurydaily.com/category/news/research/feed/",
    tier: 2,
    sourceType: "fashion_luxury",
    categoryHint: "Fashion & Luxury"
  }
];

// --- AI & Strategy Feeds ---
const AI_FEEDS: SourceFeed[] = [
  {
    name: "The Decoder",
    url: "https://the-decoder.com/feed/",
    tier: 2,
    sourceType: "news"
  },
  {
    name: "AI News",
    url: "https://www.artificialintelligence-news.com/feed/",
    tier: 2,
    sourceType: "news"
  },
  {
    name: "MIT Technology Review",
    url: "https://www.technologyreview.com/feed/",
    tier: 2,
    sourceType: "news"
  },
  {
    name: "IEEE Spectrum",
    url: "https://spectrum.ieee.org/feeds/feed.rss",
    tier: 2,
    sourceType: "news"
  },
  {
    name: "Simon Willison",
    url: "https://simonwillison.net/atom/everything/",
    tier: 3,
    sourceType: "blog"
  },
  {
    name: "Forrester Blog",
    url: "https://www.forrester.com/feed/",
    tier: 3,
    sourceType: "consultancy"
  },
  {
    name: "MIT Sloan Management Review",
    url: "https://sloanreview.mit.edu/feed/",
    tier: 3,
    sourceType: "consultancy"
  },
  {
    name: "Strategy+Business",
    url: "https://www.strategy-business.com/all_updates.xml",
    tier: 3,
    sourceType: "consultancy"
  },
  // Google News topic-filtered feeds: best available proxy for MBB consultancy content.
  // McKinsey/BCG/Bain have no RSS and use JS-rendered sites. These topic feeds return
  // 50 items/week of directly relevant luxury+retail+ecommerce articles from these firms
  // plus third-party coverage of their research.
  {
    name: "McKinsey - Luxury & Retail Research",
    url: "https://news.google.com/rss/search?q=mckinsey+retail+luxury+ecommerce&hl=en&gl=US&ceid=US:en",
    tier: 3,
    sourceType: "consultancy"
  },
  {
    name: "BCG - Luxury & Retail Research",
    url: "https://news.google.com/rss/search?q=bcg+luxury+retail+ecommerce&hl=en&gl=US&ceid=US:en",
    tier: 3,
    sourceType: "consultancy"
  },
  {
    name: "Bain - Luxury & Retail Research",
    url: "https://news.google.com/rss/search?q=bain+luxury+retail+ecommerce&hl=en&gl=US&ceid=US:en",
    tier: 3,
    sourceType: "consultancy"
  },
  {
    name: "CNBC Technology",
    url: "https://www.cnbc.com/id/19854910/device/rss/rss.html",
    tier: 2,
    sourceType: "news"
  },
];

// --- Other Existing Feeds (Tech/AI focused) ---
const OTHER_FEEDS: SourceFeed[] = [
  {
    name: "Modern Retail",
    url: "https://www.modernretail.co/feed/",
  },
  {
    name: "TechCrunch Ecommerce",
    url: "https://techcrunch.com/tag/ecommerce/feed/",
  },
  {
    name: "NYTimes Technology",
    url: "https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml",
  },
  {
    name: "MIT Sloan Management Review – AI",
    url: "https://sloanreview.mit.edu/tag/artificial-intelligence/feed/",
  },
  {
    name: "Benedict Evans",
    url: "https://www.ben-evans.com/benedictevans?format=rss",
  },
  {
    name: "Stratechery",
    url: "https://stratechery.com/feed/",
  },
  {
    name: "VentureBeat - AI",
    url: "https://venturebeat.com/category/ai/feed/",
    sourceType: "news"
  },
];

// Combined RSS feeds list
export const SOURCE_FEEDS: SourceFeed[] = [
  ...TIER_1_FEEDS,
  ...TIER_2_FEEDS,
  ...TIER_5_FEEDS,
  ...TIER_6_FEEDS,
  ...FASHION_LUXURY_FEEDS,
  ...JEWELLERY_FEEDS,
  ...AI_FEEDS,
  ...OTHER_FEEDS
];

// --- SOURCE_PAGES: Minimal page scraping sources ---
// NOTE: We keep SOURCE_PAGES minimal because:
// - Tier 3 (Consultancy): Captured via domain-targeted discovery (site: operators)
//   - McKinsey, Bain, BCG, Deloitte, EY, Salesforce, Adobe, DHL
//   - Reasons: Blocking/authentication, JS-rendering, URL 404s
// - Tier 4 (Platform): Captured via domain-targeted discovery (site: operators)
//   - Google, Amazon, Walmart, Shopify, PayPal, Visa, Alibaba, eBay, Flipkart, Instacart, ASOS, JD Sports
//   - Reasons: Bot protection, JS-rendering, PDFs, gated content
// See discovery/consultancyDomains.ts, discovery/platformDomains.ts, and discovery/queryDirector.ts
// These sources are automatically included in discovery queries and tagged with sourceType: "consultancy" or "platform"

export const SOURCE_PAGES: SourcePage[] = [
  {
    name: "BoF - News (The News in Brief)",
    url: "https://www.businessoffashion.com/news/",
    selectors: {
      item: "main h2:has(a[href^='/']), main article h2:has(a[href^='/']), main .news-item h2:has(a[href^='/'])",
      title: "a[href^='/']",
      link: "a[href^='/']",
      date: ""
    },
    linkAttr: "href",
    dateFormatHint: "D MMMM YYYY",
    fallbackSelectors: {
      item: "main h2 a[href^='/'], main article h2 a[href^='/']",
      title: "",
      link: "",
      date: ""
    }
  },
  // MIT Technology Review - AI: Removed (section page returns 404; replaced by RSS feed in AI_FEEDS)
  {
    // Jing Daily: APAC luxury & fashion intelligence.
    // Homepage lists articles as h2.font-serif elements; links are relative /posts/slug paths.
    // Dates in time[itemProp="datePublished"] as relative text ("2 days ago") or absolute ("March 13, 2026").
    // Vogue Business: now merged into vogue.com/business (React-rendered, no stable selectors) — skip.
    name: "Jing Daily",
    url: "https://jingdaily.com/",
    selectors: {
      // Structure: <a href="/posts/slug"><h3 class="font-serif">Title</h3></a>
    // The h3 is inside the anchor, so we use closest parent a for the link.
    item: "a[href^='/posts/']:has(h3.font-serif)",
      title: "h3",
      link: "",
      date: ""
    },
    linkAttr: "href",
    dateFormatHint: "RELATIVE",
    sourceType: "fashion_luxury",
    categoryHint: "Fashion & Luxury"
  },
  {
    // The Impression: fashion industry news (appointments, brand moves, campaigns).
    // /news/ redirects to latest article; /fashion-news/ is the listing page.
    // Structure: article > div.preview-mini-wrap > div.meta > h3.title > a
    // No date element in listing — falls back to ingestion date via RELATIVE hint.
    name: "The Impression",
    url: "https://theimpression.com/fashion-news/",
    selectors: {
      item: "article",
      title: "h3.title a",
      link: "h3.title a",
      date: ""
    },
    linkAttr: "href",
    dateFormatHint: "RELATIVE",
    sourceType: "fashion_luxury",
    categoryHint: "Fashion & Luxury"
  }
  // --- Tier 3 & 4 sources are captured via discovery, not page scraping ---
  // See discovery/consultancyDomains.ts and discovery/platformDomains.ts
  // {
  //   name: "McKinsey - Retail & Consumer Insights",
  //   url: "https://www.mckinsey.com/industries/retail/our-insights",
  //   selectors: {
  //     item: "article, div.mdc-c-card",
  //     title: "a",
  //     link: "a",
  //     date: "time"
  //   },
  //   linkAttr: "href",
  //   sourceType: "consultancy"
  // },
  // {
  //   name: "McKinsey - Consumer Insights",
  //   url: "https://www.mckinsey.com/industries/consumer-packaged-goods/our-insights",
  //   selectors: {
  //     item: "article, div.mdc-c-card",
  //     title: "a",
  //     link: "a",
  //     date: "time"
  //   },
  //   linkAttr: "href",
  //   sourceType: "consultancy"
  // },
  // {
  //   name: "Bain - Retail & Consumer Insights",
  //   url: "https://www.bain.com/insights/?industry=retail",
  //   selectors: {
  //     item: "div.card",
  //     title: "a",
  //     link: "a",
  //     date: "time"
  //   },
  //   linkAttr: "href",
  //   sourceType: "consultancy"
  // },
  // {
  //   name: "Bain - Technology & AI Insights",
  //   url: "https://www.bain.com/insights/?topic=artificial-intelligence",
  //   selectors: {
  //     item: "div.card",
  //     title: "a",
  //     link: "a",
  //     date: "time"
  //   },
  //   linkAttr: "href",
  //   sourceType: "consultancy"
  // },
  // {
  //   name: "BCG - Retail & Consumer Insights",
  //   url: "https://www.bcg.com/industries/retail-consumer-products/insights",
  //   selectors: {
  //     item: "article",
  //     title: "a",
  //     link: "a",
  //     date: "time"
  //   },
  //   linkAttr: "href",
  //   sourceType: "consultancy"
  // },
  // {
  //   name: "BCG - Technology & AI Insights",
  //   url: "https://www.bcg.com/topics/artificial-intelligence/insights",
  //   selectors: {
  //     item: "article",
  //     title: "a",
  //     link: "a",
  //     date: "time"
  //   },
  //   linkAttr: "href",
  //   sourceType: "consultancy"
  // }
];
