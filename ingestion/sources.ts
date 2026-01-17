import { SourceFeed, SourcePage } from './types.js';

// --- Jewellery Industry ---
export const SOURCE_FEEDS: SourceFeed[] = [
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
  {
    name: "JCK Online",
    url: "https://www.jckonline.com/feed/",
  },
  {
    name: "Professional Jeweller",
    url: "https://www.professionaljeweller.com/feed/",
  },
  {
    name: "Luxury Daily - Retail",
    url: "https://www.luxurydaily.com/category/news/retail/feed/"
  },
  {
    name: "Luxury Daily - Commerce",
    url: "https://www.luxurydaily.com/category/news/commerce/feed/"
  },
  {
    name: "Luxury Daily - Research",
    url: "https://www.luxurydaily.com/category/news/research/feed/"
  },
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
  },
  // --- Consultancy & Strategy Insights ---
  // NOTE: Consultancy sources (McKinsey, Bain, BCG) are captured via domain-targeted
  // discovery queries (site: operators) rather than page scraping due to:
  // - McKinsey: Blocking/authentication issues
  // - Bain: JS-rendered content
  // - BCG: URL 404s
  // See discovery/consultancyDomains.ts and discovery/queryDirector.ts for implementation.
  // These sources are automatically included in discovery queries and tagged with sourceType: "consultancy"
  
  // DISABLED: Page scraping failed for these sources
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
