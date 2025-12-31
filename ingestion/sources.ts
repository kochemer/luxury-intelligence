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
    name: "National Jeweler",
    url: "https://www.nationaljeweler.com/rss/feed/news",
  },
  {
    name: "JCK Online",
    url: "https://www.jckonline.com/feed/",
  },
  {
    name: "Professional Jeweller",
    url: "https://www.professionaljeweller.com/feed/",
  },
  {
    name: "Jeweller Magazine (AU)",
    url: "https://www.jewellermagazine.com/rss",
  },
  {
    name: "Rapaport News",
    url: "https://www.diamonds.net/News/rss.aspx",
  },

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
  {
    "name": "WWD RSS - Global News",
    "url": "https://wwd.com/rss-feeds/" 
  },
  {
    "name": "FashionNetwork.com - RSS (Global)",
    "url": "https://ww.fashionnetwork.com/rss/"
  },
  {
    "name": "FashionNetwork.com - RSS (US)",
    "url": "https://us.fashionnetwork.com/rss/"
  },
  {
    "name": "JustLuxe - RSS",
    "url": "https://www.justluxe.com/rss/"
  },
  {
    "name": "Trend Hunter - Luxury RSS",
    "url": "https://www.trendhunter.com/rssfeeds"
  },
  {
    "name": "Business of Fashion - Luxury (via RSS generator)",
    "url": "https://rss.app/en/rss-feed/the-business-of-fashion-rss-feed?url=https://www.businessoffashion.com/topics/luxury"
  }
  ,

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
    name: "Shopify Engineering",
    url: "https://shopify.engineering/rss.xml",
  },

  // --- AI, Tech & Consulting (General/Filtered) ---
  {
    name: "NYTimes Technology",
    url: "https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml",
  },
  {
    name: "Harvard Business Review (Technology & AI)",
    url: "https://hbr.org/feeds/section/technology",
  },
  {
    name: "Bain & Company Insights (Technology)",
    url: "https://www.bain.com/about/media-center/rss/technology.xml",
  },
  {
    name: "McKinsey & Company: Artificial Intelligence",
    url: "https://www.mckinsey.com/rss/our-insights/artificial-intelligence",
  },
];

// --- Web page & non-RSS sources ---
export const SOURCE_PAGES: SourcePage[] = [
  // --- Ecommerce & Retail: Retail TouchPoints --- 
  {
    name: "Retail TouchPoints - Technology",
    url: "https://www.retailtouchpoints.com/topics/technology",
    selectors: {
      item: ".article-list article",
      title: "h3",
      link: "a",
      date: ".post-meta time"
    },
    linkAttr: "href",
    dateFormatHint: "YYYY-MM-DD"
  },
  // --- Luxury: The Business of Fashion News --- 
  {
    name: "BoF - News",
    url: "https://www.businessoffashion.com/news/",
    selectors: {
      item: "li.ArticleCard",
      title: "h3",
      link: "a",
      date: "time"
    },
    linkAttr: "href"
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
  {
    name: "InstoreMag - Latest News",
    url: "https://instoremag.com/category/latest-news/",
    selectors: {
      item: "div.td_module_16",
      title: "h3.entry-title a",
      link: "h3.entry-title a",
      date: "time"
    },
    linkAttr: "href",
    dateFormatHint: "YYYY-MM-DD"
  }
];
