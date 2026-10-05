/**
 * i18n message dictionaries for UI chrome (nav labels, section headers, etc.)
 *
 * Usage:
 *   import { getMessages } from '@/lib/i18n/messages';
 *   const t = getMessages('da');
 *   // t.nav.home → "Hjem"
 */

import type { Locale } from './types';

export type Messages = {
  nav: {
    home: string;
    archive: string;
    emailDigest: string;
    subscribe: string;
    methodology: string;
    about: string;
    support: string;
    feedback: string;
    subscribeCta: string;
    luxuryMarket: string;
    jewelleryMarket: string;
    /** Shorter forms for the desktop nav between 1024 and 1280px. */
    luxuryMarketShort: string;
    jewelleryMarketShort: string;
  };
  digest: {
    week: string;
    articlesProcessed: string;
    articlesAnalysedThisWeek: string;
    thisWeek: string;
    browseByCategory: string;
    coverLabel: string;
    digestNotBuilt: string;
    noDigestFound: string;
    buildCommand: string;
    browseOtherWeeks: string;
    previousWeek: string;
    nextWeek: string;
    aiSummary: string;
    coverageLightTitle: string;
    coverageLightDesc: string;
    suggestSource: string;
    articlesCount: string;
  };
  podcast: {
    title: string;
    description: string;
  };
  categories: {
    ecommerceRetailTech: string;
    ecommerceRetailTechDesc: string;
    ecommerceRetailTechCardDesc: string;
    jewelleryIndustry: string;
    jewelleryIndustryDesc: string;
    jewelleryIndustryCardDesc: string;
    aiStrategy: string;
    aiStrategyDesc: string;
    aiStrategyCardDesc: string;
    fashionLuxury: string;
    fashionLuxuryDesc: string;
    fashionLuxuryCardDesc: string;
  };
  hero: {
    tagline: string;
    subtitle: string;
  };
  footer: {
    stayInformed: string;
    stayInformedDesc: string;
    disclaimer: string;
  };
  search: {
    placeholder: string;
    noResults: string;
    resultsCount: string;
  };
  competitorWatch: {
    pageTitle: string;
    pageDescription: string;
    allBrands: string;
    noArticles: string;
    latestIntelligence: string;
    brandMentioned: string;
  };
};

const en: Messages = {
  nav: {
    home: 'Home',
    archive: 'Archive',
    emailDigest: 'Email Digest',
    subscribe: 'Subscribe',
    methodology: 'Methodology',
    about: 'About',
    support: 'Support',
    feedback: 'Feedback',
    subscribeCta: 'Subscribe',
    luxuryMarket: 'Luxury market',
    jewelleryMarket: 'Jewellery market',
    luxuryMarketShort: 'Luxury',
    jewelleryMarketShort: 'Jewellery',
  },
  digest: {
    week: 'Week',
    articlesProcessed: 'articles processed this week',
    articlesAnalysedThisWeek: 'articles analysed this week',
    thisWeek: 'THIS WEEK',
    browseByCategory: 'Browse by category',
    coverLabel: "This week's cover",
    digestNotBuilt: 'Digest not built yet',
    noDigestFound: 'No latest digest found for this week.',
    buildCommand: 'npx tsx scripts/buildWeeklyDigest.ts',
    browseOtherWeeks: 'Browse other weeks',
    previousWeek: 'Previous week',
    nextWeek: 'Next week',
    aiSummary: 'AI summary',
    coverageLightTitle: 'Coverage light this week',
    coverageLightDesc: 'This is a curated weekly selection. Not every category will have articles every week.',
    suggestSource: 'Suggest a source',
    articlesCount: '# of articles processed',
  },
  podcast: {
    title: 'Weekly Luxury Intelligence · ~12 minutes',
    description: "Listen to this week's key ecommerce, jewellery & luxury stories",
  },
  categories: {
    ecommerceRetailTech: 'Ecommerce & Retail Tech',
    ecommerceRetailTechDesc: 'Breakthroughs and trends shaping online commerce, retail, and emerging tech.',
    ecommerceRetailTechCardDesc: 'Digital commerce, retail innovation, DTC trends',
    jewelleryIndustry: 'Jewellery Industry',
    jewelleryIndustryDesc: 'Key updates and articles across jewellery brands, trade, and supply chain.',
    jewelleryIndustryCardDesc: 'Market moves, brand strategy, trade insights',
    aiStrategy: 'Artificial Intelligence News',
    aiStrategyDesc: 'The latest advances and strategies in artificial intelligence and business transformation.',
    aiStrategyCardDesc: 'AI news, strategy, and business transformation',
    fashionLuxury: 'Fashion & Luxury',
    fashionLuxuryDesc: 'Innovations and changes in luxury and wider consumer products, experiences, and brands.',
    fashionLuxuryCardDesc: 'Luxury brands, consumer trends, fashion',
  },
  hero: {
    tagline: 'Weekly intelligence across AI, ecommerce, luxury, and jewellery.',
    subtitle: 'Curated articles, signals, and context — handpicked and summarised by AI agents each week.',
  },
  footer: {
    stayInformed: 'Stay Informed',
    stayInformedDesc: 'Get the weekly digest in your inbox.',
    disclaimer: 'AI-assisted summaries — Not investment or business advice. Curated by The Editor.',
  },
  search: {
    placeholder: 'Search articles…',
    noResults: 'No articles found.',
    resultsCount: '{count} articles',
  },
  competitorWatch: {
    pageTitle: 'Competitor Watch',
    pageDescription:
      "Track news and coverage of Pandora's key jewellery competitors — sourced from the same article feed as the weekly digest.",
    allBrands: 'All Brands',
    noArticles: 'No articles found for this brand.',
    latestIntelligence: 'Latest Intelligence',
    brandMentioned: 'Mentioned in article',
  },
};

const da: Messages = {
  nav: {
    home: 'Hjem',
    archive: 'Arkiv',
    emailDigest: 'Email-oversigt',
    subscribe: 'Abonner',
    methodology: 'Metode',
    about: 'Om',
    support: 'Support',
    feedback: 'Feedback',
    subscribeCta: 'Abonner',
    luxuryMarket: 'Luksusmarkedet',
    jewelleryMarket: 'Smykkemarkedet',
    luxuryMarketShort: 'Luksus',
    jewelleryMarketShort: 'Smykker',
  },
  digest: {
    week: 'Uge',
    articlesProcessed: 'artikler behandlet denne uge',
    articlesAnalysedThisWeek: 'artikler analyseret denne uge',
    thisWeek: 'DENNE UGE',
    browseByCategory: 'Gennemse efter kategori',
    coverLabel: 'Denne uges omslag',
    digestNotBuilt: 'Oversigt endnu ikke bygget',
    noDigestFound: 'Ingen oversigt fundet for denne uge.',
    buildCommand: 'npx tsx scripts/buildWeeklyDigest.ts',
    browseOtherWeeks: 'Gennemse andre uger',
    previousWeek: 'Forrige uge',
    nextWeek: 'Næste uge',
    aiSummary: 'AI-sammenfatning',
    coverageLightTitle: 'Begrænset dækning denne uge',
    coverageLightDesc: 'Dette er et kureret ugeudvalg. Ikke alle kategorier har artikler hver uge.',
    suggestSource: 'Foreslå en kilde',
    articlesCount: 'antal artikler behandlet',
  },
  podcast: {
    title: 'Ugentlig Luxury Intelligence · ca. 12 min',
    description: 'Lyt til denne uges vigtigste e-handel-, smykke- og luksusnyheder',
  },
  categories: {
    ecommerceRetailTech: 'E-handel & Detailhandel Tech',
    ecommerceRetailTechDesc: 'Fremskridt og tendenser, der former online handel, detailhandel og nye teknologier.',
    ecommerceRetailTechCardDesc: 'Digital handel, retail-innovation, DTC-tendenser',
    jewelleryIndustry: 'Smykkeindustrien',
    jewelleryIndustryDesc: 'Vigtige opdateringer og artikler om smykkemærker, handel og forsyningskæde.',
    jewelleryIndustryCardDesc: 'Markedsbevægelser, mærkestrategi, handelsindsigter',
    aiStrategy: 'Kunstig Intelligens Nyheder',
    aiStrategyDesc: 'De seneste fremskridt og strategier inden for kunstig intelligens og forretningstransformation.',
    aiStrategyCardDesc: 'AI-nyheder, strategi og forretningstransformation',
    fashionLuxury: 'Mode & Luksus',
    fashionLuxuryDesc: 'Innovationer og ændringer i luksus og bredere forbrugerprodukter, oplevelser og mærker.',
    fashionLuxuryCardDesc: 'Luksusmærker, forbruger tendenser, mode',
  },
  hero: {
    tagline: 'Ugentlig intelligens om AI, e-handel, luksus og smykker.',
    subtitle: 'Kurerede artikler, signaler og kontekst — udvalgt og sammenfattet af AI-agenter hver uge.',
  },
  footer: {
    stayInformed: 'Bliv informeret',
    stayInformedDesc: 'Få den ugentlige oversigt i din indbakke.',
    disclaimer: 'AI-assisterede sammenfatninger — Ikke investerings- eller forretningsrådgivning. Kurateret af redaktøren.',
  },
  search: {
    placeholder: 'Søg artikler…',
    noResults: 'Ingen artikler fundet.',
    resultsCount: '{count} artikler',
  },
  competitorWatch: {
    pageTitle: 'Konkurrent-overvågning',
    pageDescription:
      'Følg nyheder om Pandoras vigtigste smykkekonkurrenter — fra den samme artiklefeed som det ugentlige digest.',
    allBrands: 'Alle mærker',
    noArticles: 'Ingen artikler fundet for dette mærke.',
    latestIntelligence: 'Seneste efterretninger',
    brandMentioned: 'Nævnt i artikel',
  },
};

const es: Messages = {
  nav: {
    home: 'Inicio',
    archive: 'Archivo',
    emailDigest: 'Resumen por Email',
    subscribe: 'Suscribirse',
    methodology: 'Metodología',
    about: 'Acerca de',
    support: 'Soporte',
    feedback: 'Opinión',
    subscribeCta: 'Suscribirse',
    luxuryMarket: 'Mercado del lujo',
    jewelleryMarket: 'Mercado de joyería',
    luxuryMarketShort: 'Lujo',
    jewelleryMarketShort: 'Joyería',
  },
  digest: {
    week: 'Semana',
    articlesProcessed: 'artículos procesados esta semana',
    articlesAnalysedThisWeek: 'artículos analizados esta semana',
    thisWeek: 'ESTA SEMANA',
    browseByCategory: 'Explorar por categoría',
    coverLabel: 'Portada de esta semana',
    digestNotBuilt: 'Resumen aún no construido',
    noDigestFound: 'No se encontró resumen para esta semana.',
    buildCommand: 'npx tsx scripts/buildWeeklyDigest.ts',
    browseOtherWeeks: 'Explorar otras semanas',
    previousWeek: 'Semana anterior',
    nextWeek: 'Semana siguiente',
    aiSummary: 'Resumen IA',
    coverageLightTitle: 'Cobertura limitada esta semana',
    coverageLightDesc: 'Esta es una selección semanal curada. No todas las categorías tendrán artículos cada semana.',
    suggestSource: 'Sugerir una fuente',
    articlesCount: 'nº de artículos procesados',
  },
  podcast: {
    title: 'Luxury Intelligence semanal · ~12 min',
    description: 'Escucha las principales noticias de ecommerce, joyería y lujo de esta semana',
  },
  categories: {
    ecommerceRetailTech: 'Ecommerce y Tecnología Retail',
    ecommerceRetailTechDesc: 'Avances y tendencias que dan forma al comercio en línea, retail y tecnología emergente.',
    ecommerceRetailTechCardDesc: 'Comercio digital, innovación retail, tendencias DTC',
    jewelleryIndustry: 'Industria de la Joyería',
    jewelleryIndustryDesc: 'Actualizaciones clave y artículos sobre marcas de joyería, comercio y cadena de suministro.',
    jewelleryIndustryCardDesc: 'Movimientos de mercado, estrategia de marca, información del sector',
    aiStrategy: 'Noticias de Inteligencia Artificial',
    aiStrategyDesc: 'Los últimos avances y estrategias en inteligencia artificial y transformación empresarial.',
    aiStrategyCardDesc: 'Noticias IA, estrategia y transformación empresarial',
    fashionLuxury: 'Moda y Lujo',
    fashionLuxuryDesc: 'Innovaciones y cambios en lujo y productos de consumo más amplios, experiencias y marcas.',
    fashionLuxuryCardDesc: 'Marcas de lujo, tendencias de consumo, moda',
  },
  hero: {
    tagline: 'Inteligencia semanal sobre IA, ecommerce, lujo y joyería.',
    subtitle: 'Artículos, señales y contexto curados — seleccionados y resumidos por agentes de IA cada semana.',
  },
  footer: {
    stayInformed: 'Mantente informado',
    stayInformedDesc: 'Recibe el resumen semanal en tu bandeja de entrada.',
    disclaimer: 'Resúmenes con IA — No son asesoramiento de inversión ni empresarial. Curado por el editor.',
  },
  search: {
    placeholder: 'Buscar artículos…',
    noResults: 'No se encontraron artículos.',
    resultsCount: '{count} artículos',
  },
  competitorWatch: {
    pageTitle: 'Seguimiento de Competidores',
    pageDescription:
      'Sigue las noticias de los principales competidores de joyería de Pandora — extraídas del mismo feed de artículos que el resumen semanal.',
    allBrands: 'Todas las marcas',
    noArticles: 'No se encontraron artículos para esta marca.',
    latestIntelligence: 'Última inteligencia',
    brandMentioned: 'Mencionado en artículo',
  },
};

const ALL_MESSAGES: Record<Locale, Messages> = { en, da, es };

/**
 * Get the message dictionary for a given locale.
 * Falls back to English if locale is unknown.
 */
export function getMessages(locale: Locale | string): Messages {
  return ALL_MESSAGES[locale as Locale] || en;
}

/**
 * Detect locale from a URL pathname.
 * Returns 'da' for /da/*, 'es' for /es/*, 'en' otherwise.
 */
export function detectLocaleFromPathname(pathname: string): Locale {
  if (pathname.startsWith('/da')) return 'da';
  if (pathname.startsWith('/es')) return 'es';
  return 'en';
}
