import { SourceFeed, SourcePage } from './types.js';

// --- Jewellery Industry ---
export const SOURCE_FEEDS: SourceFeed[] = [
  // --- Must-have dedicated jewellery feeds ---
  {
    name: "Jeweller - Business News",
    url: "https://www.jewellermagazine.com/rss/jewellery-business.xml",
  },
  {
    name: "Jeweller - Jewellery Trends",
    url: "https://www.jewellermagazine.com/rss/jewellery-trends.xml",
  },
  {
    name: "Jeweller - Main",
    url: "https://www.jewellermagazine.com/rss/jeweller.xml",
  },
  // --- Additional Jewellery Industry ---
  {
    name: "JCK Online",
    url: "https://www.jckonline.com/feed/",
  },
  {
    name: "Professional Jeweller",
    url: "https://www.professionaljeweller.com/feed/",
  },
  // {
  //   name: "National Jeweler",
  //   url: "https://www.nationaljeweler.com/rss/feed/news",
  // }, // disabled: 404
  // {
  //   name: "Jeweller Magazine (AU)",
  //   url: "https://www.jewellermagazine.com/rss",
  // }, // disabled: not XML/RSS/Atom
  // {
  //   name: "Rapaport News",
  //   url: "https://www.diamonds.net/News/rss.aspx",
  // }, // disabled: not XML/RSS/Atom
  // {
  //   name: "Jewellery Outlook",
  //   url: "https://www.jewelleryoutlook.com/rss.xml",
  // }, // disabled: 404

  // --- Luxury Daily Key Category Feeds ---
  {
    "name": "Luxury Daily - Retail",
    "url": "https://www.luxurydaily.com/category/news/retail/feed/"
  },
  {
    "name": "Luxury Daily - Commerce",
    "url": "https://www.luxurydaily.com/category/news/commerce/feed/"
  },
  {
    "name": "Luxury Daily - Research",
    "url": "https://www.luxurydaily.com/category/news/research/feed/"
  },
  // {
  //   "name": "WWD RSS - Global News",
  //   "url": "https://wwd.com/rss-feeds/"
  // }, // disabled: not XML/RSS/Atom
  // {
  //   "name": "FashionNetwork.com - RSS (Global)",
  //   "url": "https://ww.fashionnetwork.com/rss/"
  // }, // disabled: not XML/RSS/Atom
  // {
  //   "name": "FashionNetwork.com - RSS (US)",
  //   "url": "https://us.fashionnetwork.com/rss/"
  // }, // disabled: not XML/RSS/Atom
  // {
  //   "name": "JustLuxe - RSS",
  //   "url": "https://www.justluxe.com/rss/"
  // }, // disabled: timeout
  // {
  //   "name": "Trend Hunter - Luxury RSS",
  //   "url": "https://www.trendhunter.com/rssfeeds"
  // }, // disabled: 403
  // {
  //   "name": "Business of Fashion - Luxury (via RSS generator)",
  //   "url": "https://rss.app/en/rss-feed/the-business-of-fashion-rss-feed?url=https://www.businessoffashion.com/topics/luxury"
  // }, // disabled: not XML/RSS/Atom
  // {
  //   name: "Vogue Business",
  //   url: "https://www.voguebusiness.com/rss",
  // }, // disabled: 404
  // {
  //   name: "Jing Daily",
  //   url: "https://jingdaily.com/feed/",
  // }, // disabled: 404
  // {
  //   name: "Luxury Society",
  //   url: "https://www.luxurysociety.com/en/rss.xml",
  // }, // disabled: 404

  // --- Ecommerce, Retail & DTC Technology ---
  {
    name: "Retail Dive",
    url: "https://www.retaildive.com/feeds/news/",
  },
  {
    name: "Practical Ecommerce",
    url: "https://www.practicalecommerce.com/feed",
  },
  {
    name: "Modern Retail",
    url: "https://www.modernretail.co/feed/",
  },
  {
    name: "TechCrunch Ecommerce",
    url: "https://techcrunch.com/tag/ecommerce/feed/",
  },
  {
    name: "Digital Commerce 360",
    url: "https://www.digitalcommerce360.com/feed/",
  },
  // {
  //   name: "Shopify Engineering",
  //   url: "https://shopify.engineering/rss.xml",
  // }, // disabled: 404
  // {
  //   name: "Retail Dive – Technology",
  //   url: "https://www.retaildive.com/feeds/news/technology/",
  // }, // disabled: 404

  // --- AI, Tech & Consulting (General/Filtered) ---
  {
    name: "NYTimes Technology",
    url: "https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml",
  },
  // {
  //   name: "Harvard Business Review (Technology & AI)",
  //   url: "https://hbr.org/feeds/section/technology",
  // }, // disabled: 404
  // {
  //   name: "Bain & Company Insights (Technology)",
  //   url: "https://www.bain.com/about/media-center/rss/technology.xml",
  // }, // disabled: 404
  // {
  //   name: "McKinsey & Company: Artificial Intelligence",
  //   url: "https://www.mckinsey.com/rss/our-insights/artificial-intelligence",
  // }, // disabled: 404
  
  // --- AI & Strategy ---
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
  // {
  //   name: "a16z – AI",
  //   url: "https://a16z.com/tag/ai/feed/",
  // }, // disabled: not XML/RSS/Atom
  // {
  //   name: "a16z",
  //   url: "https://a16z.com/feed/",
  // }, // disabled: 404
];

// --- Web page & non-RSS sources ---
// Yes, SOURCE_PAGES is actually used in the project flow—see for example ingestion/fetchPages.ts, which imports and uses SOURCE_PAGES.
export const SOURCE_PAGES: SourcePage[] = [
  // --- Ecommerce & Retail: Retail TouchPoints --- 
  // Disabled: page fetch yielded 100% duplicates vs RSS.
  // {
  //   name: "Retail TouchPoints - Technology",
  //   url: "https://www.retailtouchpoints.com/topics/retail-innovation",
  //   selectors: {
  //     item: "article, .article-item, .post-item, .entry",
  //     title: "h2 a, h3 a, h2, h3, .title, .entry-title",
  //     link: "h2 a, h3 a, a.entry-title-link, a",
  //     date: "time, .date, .post-date, .meta-date, .published-date"
  //   },
  //   linkAttr: "href",
  //   dateFormatHint: "RELATIVE"
  // },
  // --- Luxury: The Business of Fashion News --- 
  {
    name: "BoF - News (The News in Brief)",
    url: "https://www.businessoffashion.com/news/",
    selectors: {
      // Primary: target h2 elements that contain article links
      item: "main h2:has(a[href^='/']), main article h2:has(a[href^='/']), main .news-item h2:has(a[href^='/'])",
      // More specific: link must be direct child or descendant of h2, and have href starting with /
      title: "a[href^='/']",
      link: "a[href^='/']",
      date: "" // parse from the next sibling text node (e.g. "01 January 2026")
    },
    linkAttr: "href",
    dateFormatHint: "D MMMM YYYY",
    // Fallback selectors if primary finds 0 items
    // In fallback, item IS the link, so we extract title and url from the link element itself
    fallbackSelectors: {
      item: "main h2 a[href^='/'], main article h2 a[href^='/']",
      title: "", // Will use link text
      link: "", // Item itself is the link
      date: "" // Still parse from sibling text node
    }
  },
  // --- AI: The Algorithm - MIT Technology Review AI Section ---
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
  },
  // --- Jewellery: InstoreMag News Feed Page ---
  // Disabled: page fetch yielded 100% duplicates vs RSS.
  // {
  //   name: "InstoreMag - Latest News",
  //   url: "https://instoremag.com/news/headlines/",
  //   selectors: {
  //     item: "article, .post, .entry, li, .news-item, .headline-item",
  //     title: "h2 a, h3 a, h2, h3, .title a, .entry-title a, a",
  //     link: "h2 a, h3 a, .title a, .entry-title a, a",
  //     date: "time, .date, .post-date, .meta, .published, .timestamp"
  //   },
  //   linkAttr: "href",
  //   dateFormatHint: "RELATIVE"
  // }
];
