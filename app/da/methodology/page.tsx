import Link from 'next/link';
import type { Metadata } from 'next';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://luxury-intelligence.vercel.app";

export const metadata: Metadata = {
  title: 'Metodologi – Sådan kureres Luxury Intelligence',
  description: 'Sådan indsamles, rangeres og opsummeres den ugentlige AI, ecommerce, luksus og smykkebrancheoversigt.',
  alternates: {
    canonical: '/da/methodology',
  },
  openGraph: {
    title: 'Metodologi – Sådan kureres Luxury Intelligence',
    description: 'Sådan indsamles, rangeres og opsummeres den ugentlige AI, ecommerce, luksus og smykkebrancheoversigt.',
    images: [`${siteUrl}/og-default.svg`],
  },
  twitter: {
    title: 'Metodologi – Sådan kureres Luxury Intelligence',
    description: 'Sådan indsamles, rangeres og opsummeres den ugentlige AI, ecommerce, luksus og smykkebrancheoversigt.',
    images: [`${siteUrl}/og-default.svg`],
  },
};

export default function MethodologyPageDA() {
  return (
    <main style={{
      maxWidth: '100vw',
      minHeight: '100vh',
      fontFamily: 'system-ui, Arial, sans-serif',
      background: '#f7f9fb',
      margin: 0,
      padding: 0,
    }}>
      {/* Hero Section */}
      <section style={{
        position: 'relative',
        width: '100%',
        minHeight: 240,
        background: 'linear-gradient(120deg,#2e3741 50%, #4a5a6b 100%)',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
        borderBottom: '1px solid #e5e7eb'
      }}>
        <div className="w-full max-w-[1200px] lg:max-w-[1400px] 2xl:max-w-[1560px] mx-auto px-4 md:px-8" style={{
          position: 'relative',
          zIndex: 2,
          color: '#fff',
          padding: '2rem 1.5rem 1.75rem 1.5rem',
          textAlign: 'center',
        }}>
          <h1 className="text-4xl md:text-5xl font-bold mb-3" style={{
            textShadow: '0 1px 4px rgba(18,30,49,0.15)'
          }}>
            Metodologi
          </h1>
          <div className="text-base md:text-lg text-gray-100 leading-relaxed max-w-xl mx-auto">
            Sådan produceres den ugentlige oversigt
          </div>
        </div>
      </section>

      {/* Content Section */}
      <section className="max-w-3xl mx-auto px-4 md:px-6 py-12 md:py-16">
        {/* What this site is */}
        <div className="mb-10 md:mb-12">
          <h2 className="text-2xl md:text-3xl font-semibold text-gray-900 mb-4">
            Hvad dette site er
          </h2>
          <p className="text-base md:text-lg text-gray-700 leading-relaxed mb-3">
            En ugentlig kurateret brancheintelligensoversigt, der dækker <strong className="text-gray-900">AI og Strategi</strong>, <strong className="text-gray-900">Ecommerce og Retail Teknologi</strong>, <strong className="text-gray-900">Luksus og Forbrug</strong>, og <strong className="text-gray-900">Smykkebranchen</strong>.
          </p>
          <p className="text-base md:text-lg text-gray-700 leading-relaxed">
            Hver uge vælger vi de mest relevante artikler, genererer koncise resuméer og præsenterer dem i et let-skanbart format.
          </p>
        </div>

        {/* How articles are collected */}
        <div className="mb-10 md:mb-12">
          <h2 className="text-2xl md:text-3xl font-semibold text-gray-900 mb-4">
            Sådan indsamles artikler
          </h2>
          <ul className="space-y-3 text-base md:text-lg text-gray-700 leading-relaxed">
            <li>
              <strong className="text-gray-900">Kilder:</strong> RSS-feeds og udvalgte websider fra pålidelige branchepublikationer, nyhedssites og ekspertblogge.
            </li>
            <li>
              <strong className="text-gray-900">Indtagelse:</strong> Artikler indtages automatisk på et regelmæssigt skema ved hjælp af et kun-tilføjelsessystem.
            </li>
            <li>
              <strong className="text-gray-900">Deduplikering:</strong> Duplikerede artikler identificeres og filtreres automatisk for at sikre, at hver artikel kun vises én gang.
            </li>
          </ul>
        </div>

        {/* How articles are selected */}
        <div className="mb-10 md:mb-12">
          <h2 className="text-2xl md:text-3xl font-semibold text-gray-900 mb-4">
            Sådan vælges artikler
          </h2>
          <ul className="space-y-3 text-base md:text-lg text-gray-700 leading-relaxed">
            <li>
              <strong className="text-gray-900">Ugentligt vindue:</strong> Mandag til søndag, Europa/København tidszone. Hver oversigt dækker artikler publiceret i løbet af den uge.
            </li>
            <li>
              <strong className="text-gray-900">Kategorisering:</strong> Artikler klassificeres i en af fire emnekategorier ved hjælp af LLM-assisteret klassificering.
            </li>
            <li>
              <strong className="text-gray-900">Rangering:</strong> Artikler scores baseret på relevans og kilde-diversitet. Diversitetsbeskyttelser forhindrer overrepræsentation af en enkelt kilde.
            </li>
            <li>
              <strong className="text-gray-900">Top-N valg:</strong> De højest scorede artikler i hver kategori vælges og publiceres per kategori.
            </li>
          </ul>
        </div>

        {/* How AI is used */}
        <div className="mb-10 md:mb-12">
          <h2 className="text-2xl md:text-3xl font-semibold text-gray-900 mb-4">
            Sådan bruges AI
          </h2>
          <p className="text-base md:text-lg text-gray-700 leading-relaxed mb-4">
            AI bruges på to måder:
          </p>
          <ul className="space-y-3 text-base md:text-lg text-gray-700 leading-relaxed mb-4">
            <li>
              <strong className="text-gray-900">Kategorisering:</strong> LLM-assisteret klassificering hjælper med at tildele artikler til den passende emnekategori.
            </li>
            <li>
              <strong className="text-gray-900">Resuméer:</strong> Korte resuméer genereres, når artikeluddrag er tilgængelige, ved kun at bruge titel, kilde, publiceringsdato og uddrag.
            </li>
          </ul>
          <p className="text-base md:text-lg text-gray-700 leading-relaxed mb-3">
            <strong className="text-gray-900">Hvad AI ikke gør:</strong>
          </p>
          <ul className="space-y-2 text-base md:text-lg text-gray-700 leading-relaxed mb-4">
            <li>• Fuld artikel-scraping eller omskrivning</li>
            <li>• Adgang til betalingsvægget indhold</li>
            <li>• Redaktionelle beslutninger (valg og rangering er algoritmiske)</li>
          </ul>
          <p className="text-base md:text-lg text-gray-700 leading-relaxed">
            AI-input er begrænset til metadata (titel, kilde, dato, uddrag) og deterministiske indstillinger bruges, hvor det er muligt, for at sikre konsistens og forklarlighed.
          </p>
        </div>

        {/* Transparency & feedback */}
        <div className="mb-10 md:mb-12">
          <h2 className="text-2xl md:text-3xl font-semibold text-gray-900 mb-4">
            Gennemsigtighed og feedback
          </h2>
          <p className="text-base md:text-lg text-gray-700 leading-relaxed mb-3">
            Artikelvalg er <strong className="text-gray-900">AI-forstærket, forklarlig-først</strong>. Vi prioriterer gennemsigtighed i, hvordan artikler indsamles, kategoriseres og rangeres.
          </p>
          <p className="text-base md:text-lg text-gray-700 leading-relaxed">
            Spørgsmål, forslag eller vil du foreslå en kilde? <Link href="/da/feedback" className="text-blue-700 hover:text-blue-800 underline font-medium">Del din feedback</Link>.
          </p>
        </div>

        {/* Update cadence */}
        <div className="mb-10 md:mb-12">
          <h2 className="text-2xl md:text-3xl font-semibold text-gray-900 mb-4">
            Opdateringsfrekvens
          </h2>
          <p className="text-base md:text-lg text-gray-700 leading-relaxed">
            Opdateret ugentligt. Nye oversigter publiceres hver uge, der dækker mandag til søndag (CET tidszone). Tidligere ugentlige oversigter er tilgængelige i <Link href="/da/archive" className="text-blue-700 hover:text-blue-800 underline">arkivet</Link>.
          </p>
        </div>

        {/* Footer note */}
        <div className="border-t border-gray-200 pt-6 mt-8">
          <p className="text-sm text-gray-500 text-center">
            Ikke tilknyttet nogen udgivere. Links går til originale kilder.
          </p>
        </div>
      </section>
    </main>
  );
}

