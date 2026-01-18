/**
 * Tier 4: Platform domain allowlist for domain-targeted discovery.
 * These domains are captured via web discovery queries (site: operators)
 * rather than page scraping due to blocking/JS-rendering issues.
 * 
 * Includes: Google, Amazon, Walmart, Shopify, PayPal, Visa, Alibaba, eBay, Flipkart, Instacart, ASOS, JD Sports
 */

export const PLATFORM_DOMAINS = [
  "blog.google",
  "googleblog.com",
  "ai.googleblog.com",
  "amazon.com",
  "corporate.walmart.com",
  "shopify.com",
  "paypal.com",
  "visa.com",
  "alibabagroup.com",
  "ebayinc.com",
  "flipkart.com",
  "instacart.com",
  "asosplc.com",
  "asos.com",
  "jdsportsfashionplc.com"
] as const;

export type PlatformDomain = typeof PLATFORM_DOMAINS[number];

/**
 * Check if a domain is a platform domain
 */
export function isPlatformDomain(domain: string): boolean {
  const normalizedDomain = domain.toLowerCase().replace('www.', '');
  return PLATFORM_DOMAINS.some(platformDomain => 
    normalizedDomain === platformDomain || 
    normalizedDomain.endsWith(`.${platformDomain}`) ||
    normalizedDomain.includes(platformDomain)
  );
}

/**
 * Generate platform-targeted queries for a category
 * Returns 2 queries per category that target platform domains
 */
export function generatePlatformQueries(topic: string, categoryLabel: string): string[] {
  const queries: string[] = [];
  
  // Map topics to relevant platform query patterns
  const topicQueries: Record<string, { google: string; amazon: string; shopify: string; walmart: string }> = {
    "AI_and_Strategy": {
      google: "site:ai.googleblog.com artificial intelligence",
      amazon: "site:amazon.com AI technology",
      shopify: "site:shopify.com AI commerce",
      walmart: "site:corporate.walmart.com artificial intelligence"
    },
    "Ecommerce_Retail_Tech": {
      google: "site:blog.google ecommerce retail",
      amazon: "site:amazon.com retail technology",
      shopify: "site:shopify.com ecommerce platform",
      walmart: "site:corporate.walmart.com retail tech"
    },
    "Luxury_and_Consumer": {
      google: "site:blog.google luxury consumer",
      amazon: "site:amazon.com luxury retail",
      shopify: "site:shopify.com luxury commerce",
      walmart: "site:corporate.walmart.com consumer trends"
    },
    "Jewellery_Industry": {
      google: "site:blog.google luxury retail",
      amazon: "site:amazon.com jewelry retail",
      shopify: "site:shopify.com jewelry commerce",
      walmart: "site:corporate.walmart.com luxury retail"
    }
  };
  
  const patterns = topicQueries[topic];
  if (patterns) {
    // Return 2 queries: one from Google/Amazon, one from Shopify/Walmart (alternating)
    if (categoryLabel.includes("AI") || categoryLabel.includes("Technology")) {
      queries.push(patterns.google);
      queries.push(patterns.amazon);
    } else {
      queries.push(patterns.shopify);
      queries.push(patterns.walmart);
    }
  } else {
    // Fallback: generic platform queries
    queries.push(`site:blog.google ${categoryLabel.toLowerCase()}`);
    queries.push(`site:amazon.com ${categoryLabel.toLowerCase()}`);
  }
  
  return queries;
}
