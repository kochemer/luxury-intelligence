/**
 * Consultancy domain allowlist for domain-targeted discovery.
 * These domains are captured via web discovery queries (site: operators)
 * rather than page scraping due to blocking/JS-rendering issues.
 */

export const CONSULTANCY_DOMAINS = [
  "mckinsey.com",
  "bain.com",
  "bcg.com"
] as const;

export type ConsultancyDomain = typeof CONSULTANCY_DOMAINS[number];

/**
 * Check if a domain is a consultancy domain
 */
export function isConsultancyDomain(domain: string): boolean {
  const normalizedDomain = domain.toLowerCase().replace('www.', '');
  return CONSULTANCY_DOMAINS.some(consultancyDomain => 
    normalizedDomain === consultancyDomain || normalizedDomain.endsWith(`.${consultancyDomain}`)
  );
}

/**
 * Generate consultancy-targeted queries for a category
 * Returns 2 queries per category that target consultancy domains
 */
export function generateConsultancyQueries(topic: string, categoryLabel: string): string[] {
  const queries: string[] = [];
  
  // Map topics to relevant consultancy query patterns
  const topicQueries: Record<string, { mckinsey: string; bain: string; bcg: string }> = {
    "AI_and_Strategy": {
      mckinsey: "site:mckinsey.com artificial intelligence strategy",
      bain: "site:bain.com/insights artificial intelligence",
      bcg: "site:bcg.com artificial intelligence insights"
    },
    "Ecommerce_Retail_Tech": {
      mckinsey: "site:mckinsey.com retail consumer insights",
      bain: "site:bain.com/insights retail technology",
      bcg: "site:bcg.com retail consumer products insights"
    },
    "Luxury_and_Consumer": {
      mckinsey: "site:mckinsey.com luxury consumer trends",
      bain: "site:bain.com/insights luxury consumer",
      bcg: "site:bcg.com luxury consumer insights"
    },
    "Jewellery_Industry": {
      mckinsey: "site:mckinsey.com luxury retail insights",
      bain: "site:bain.com/insights luxury retail",
      bcg: "site:bcg.com luxury retail insights"
    }
  };
  
  const patterns = topicQueries[topic];
  if (patterns) {
    // Return 2 queries: one McKinsey, one from Bain or BCG (alternating)
    queries.push(patterns.mckinsey);
    // Alternate between Bain and BCG based on category
    if (categoryLabel.includes("AI") || categoryLabel.includes("Technology")) {
      queries.push(patterns.bain);
    } else {
      queries.push(patterns.bcg);
    }
  } else {
    // Fallback: generic consultancy queries
    queries.push(`site:mckinsey.com ${categoryLabel.toLowerCase()}`);
    queries.push(`site:bain.com/insights ${categoryLabel.toLowerCase()}`);
  }
  
  return queries;
}
