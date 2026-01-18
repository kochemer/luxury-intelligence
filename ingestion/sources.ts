import { SourceFeed, SourcePage } from './types.js';

// --- Tier 1: Global Business & News ---
const TIER_1_FEEDS: SourceFeed[] = [
  {
    name: "Reuters - Business",
    url: "https://www.reuters.com/tools/rss",
    tier: 1,
    sourceType: "news"
  },
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
  {
    name: "Axios - Technology",
    url: "https://www.axios.com/feed/technology",
    tier: 1,
    sourceType: "news"
  },
  {
    name: "The Verge",
    url: "https://www.theverge.com/rss/index.xml",
    tier: 1,
    sourceType: "news"
  },
  {
    name: "Forbes - Technology",
    url: "https://www.forbes.com/technology/feed/",
    tier: 1,
    sourceType: "news"
  },
  // Barron's - Technology: Removed (403/blocked, no public RSS available)
  {
    name: "AP News - Technology",
    url: "https://apnews.com/apf-technology",
    tier: 1,
    sourceType: "news"
  },
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
];

// --- Tier 5: Academic & Technical ---
const TIER_5_FEEDS: SourceFeed[] = [
  {
    name: "arXiv - AI (cs.AI)",
    url: "http://arxiv.org/rss/cs.AI",
    tier: 5,
    sourceType: "academic"
  },
  {
    name: "arXiv - Machine Learning (cs.LG)",
    url: "http://arxiv.org/rss/cs.LG",
    tier: 5,
    sourceType: "academic"
  },
  {
    name: "arXiv - Computation and Language (cs.CL)",
    url: "http://arxiv.org/rss/cs.CL",
    tier: 5,
    sourceType: "academic"
  },
  {
    name: "Microsoft Research - AI",
    url: "https://www.microsoft.com/en-us/research/feed/tag/artificial-intelligence/",
    tier: 5,
    sourceType: "academic"
  }
];

// --- Tier 6: Regional / Specialist ---
const TIER_6_FEEDS: SourceFeed[] = [
  // Ritzau: Removed (parse error, no valid RSS feed structure)
  {
    name: "TechRadar - Ecommerce",
    url: "https://www.techradar.com/rss/news/ecommerce",
    tier: 6,
    sourceType: "specialist"
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
  {
    name: "FashionNetwork",
    url: "https://www.fashionnetwork.com/rss",
    tier: 2,
    sourceType: "fashion_luxury",
    categoryHint: "Fashion & Luxury"
  },
  {
    name: "Luxury Daily - Main",
    url: "https://www.luxurydaily.com/feed/",
    tier: 2,
    sourceType: "fashion_luxury",
    categoryHint: "Fashion & Luxury"
  },
  {
    name: "Vogue Business",
    url: "https://www.voguebusiness.com/feed",
    tier: 2,
    sourceType: "fashion_luxury",
    categoryHint: "Fashion & Luxury"
  },
  {
    name: "Drapers",
    url: "https://www.drapersonline.com/feed/",
    tier: 2,
    sourceType: "fashion_luxury",
    categoryHint: "Fashion & Luxury"
  },
  {
    name: "The Impression",
    url: "https://theimpression.com/feed/",
    tier: 2,
    sourceType: "fashion_luxury",
    categoryHint: "Fashion & Luxury"
  },
  {
    name: "Jing Daily",
    url: "https://jingdaily.com/feed/",
    tier: 2,
    sourceType: "fashion_luxury",
    categoryHint: "Fashion & Luxury"
  },
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
  }
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
  {
    name: "JCK Online",
    url: "https://www.jckonline.com/feed/",
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
  {
    name: "National Jeweler",
    url: "https://www.nationaljeweler.com/rss",
    tier: 2,
    sourceType: "jewellery",
    categoryHint: "Jewellery Industry"
  },
  {
    name: "Jewellery Focus",
    url: "https://www.jewelleryfocus.com/feed/",
    tier: 2,
    sourceType: "jewellery",
    categoryHint: "Jewellery Industry"
  },
  {
    name: "Rapaport News",
    url: "https://www.diamonds.net/rss/",
    tier: 2,
    sourceType: "jewellery",
    categoryHint: "Jewellery Industry"
  },
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
  {
    name: "Hodinkee - Business",
    url: "https://www.hodinkee.com/feed",
    tier: 2,
    sourceType: "jewellery",
    categoryHint: "Jewellery Industry"
  },
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
  }
];

// Combined RSS feeds list
export const SOURCE_FEEDS: SourceFeed[] = [
  ...TIER_1_FEEDS,
  ...TIER_2_FEEDS,
  ...TIER_5_FEEDS,
  ...TIER_6_FEEDS,
  ...FASHION_LUXURY_FEEDS,
  ...JEWELLERY_FEEDS,
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
  {
    name: "MIT Technology Review - AI",
    url: "https://www.technologyreview.com/ai/",
    selectors: {
      item: "article.stream-article",
      title: "a.stream-article__headline",
      link: "a.stream-article__headline",
      date: "time"
    },
    linkAttr: "href"
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
