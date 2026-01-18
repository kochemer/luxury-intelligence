/**
 * Jewellery company tiers for prioritization boost
 * Used to surface material news about key jewellery players in Top-N selection
 */

export const JEWELLERY_COMPANY_TIERS = {
  tier1_global_mass_premium: [
    "swarovski",
    "tiffany",
    "tiffany & co",
    "pandora",
    "signet",
    "kay jewelers",
    "zales",
    "jared",
    "chow tai fook",
    "claire's",
    "lovisa",
    "tous",
    "thomas sabo",
    "mejuri"
  ],
  tier1_luxury_houses: [
    "cartier",
    "van cleef",
    "van cleef & arpels",
    "bvlgari",
    "bulgari",
    "harry winston",
    "graff"
  ],
  tier1_groups: [
    "richemont",
    "lvmh",
    "kering"
  ]
} as const;

/**
 * Flatten all company names into a single array for matching
 */
export function getAllCompanyNames(): string[] {
  return [
    ...JEWELLERY_COMPANY_TIERS.tier1_global_mass_premium,
    ...JEWELLERY_COMPANY_TIERS.tier1_luxury_houses,
    ...JEWELLERY_COMPANY_TIERS.tier1_groups
  ];
}

/**
 * Get tier name for a company
 */
export function getCompanyTier(companyName: string): string | null {
  const lower = companyName.toLowerCase();
  if (JEWELLERY_COMPANY_TIERS.tier1_global_mass_premium.some(c => c === lower)) {
    return 'tier1_global_mass_premium';
  }
  if (JEWELLERY_COMPANY_TIERS.tier1_luxury_houses.some(c => c === lower)) {
    return 'tier1_luxury_houses';
  }
  if (JEWELLERY_COMPANY_TIERS.tier1_groups.some(c => c === lower)) {
    return 'tier1_groups';
  }
  return null;
}
