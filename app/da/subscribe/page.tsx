import Link from 'next/link';
import SubscribePricing from '../../components/SubscribePricing';

export default function SubscribePageDA() {
  const formAction =
    process.env.NEXT_PUBLIC_FEEDBACK_FORM_ACTION?.trim() ||
    'https://formspree.io/f/xwvpbnbz';

  return (
    <main className="w-full bg-[#f7f9fb] min-h-screen">
      {/* Hero */}
      <section className="w-full border-b border-gray-200 bg-gradient-to-r from-[#2e3741] via-[#394855] to-[#4a5a6b]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-12">
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Ugentlig email oversigt
          </h1>
          <p className="text-sm sm:text-base text-gray-100 leading-relaxed mb-3 max-w-xl">
            En koncis ugentlig oversigt på tværs af{' '}
            <span className="font-semibold">AI og strategi</span>,{' '}
            <span className="font-semibold">ecommerce og retail teknologi</span>,{' '}
            <span className="font-semibold">luksus og forbrug</span>, og{' '}
            <span className="font-semibold">smykker</span>.
          </p>
          <p className="text-xs sm:text-sm text-gray-200 mb-6">
            Leveres én gang om ugen (dækker mandag–søndag, CET). Ingen støj, kun
            kurerede signaler.
          </p>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Link
              href="/da"
              className="inline-flex items-center justify-center rounded-md border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-medium text-gray-50 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-yellow-300 focus-visible:ring-offset-[#2e3741]"
            >
              Se seneste oversigt
            </Link>
            <span className="text-gray-200 text-xs">eller gennemse arkivet</span>
            <Link
              href="/da/archive"
              className="text-xs font-medium text-yellow-200 underline underline-offset-4 hover:text-yellow-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-yellow-300 focus-visible:ring-offset-[#2e3741] rounded"
            >
              Arkiv
            </Link>
          </div>
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-12 space-y-10">
        {/* Pricing + email capture */}
        <SubscribePricing formAction={formAction} />

        {/* What's included */}
        <section aria-labelledby="whats-included-heading">
          <h2
            id="whats-included-heading"
            className="text-lg sm:text-xl font-semibold text-gray-900 mb-3"
          >
            Hvad er inkluderet
          </h2>
          <div className="rounded-xl bg-white border border-gray-200 p-4 sm:p-5 shadow-sm">
            <ul className="space-y-2 text-sm text-gray-700">
              <li className="flex gap-2">
                <span className="mt-[3px] text-green-500">●</span>
                <span>Top historier per kategori, kurerede fra en bred kilde liste.</span>
              </li>
              <li className="flex gap-2">
                <span className="mt-[3px] text-green-500">●</span>
                <span>Direkte links til originale kilder til dybere læsning.</span>
              </li>
              <li className="flex gap-2">
                <span className="mt-[3px] text-green-500">●</span>
                <span>Valgfrie AI-assisterede resuméer for at fremskynde scanning.</span>
              </li>
              <li className="flex gap-2">
                <span className="mt-[3px] text-green-500">●</span>
                <span>Arkivadgang på hjemmesiden, så du kan genbesøge tidligere uger.</span>
              </li>
            </ul>
          </div>
        </section>

        {/* FAQ */}
        <section aria-labelledby="faq-heading">
          <h2
            id="faq-heading"
            className="text-lg sm:text-xl font-semibold text-gray-900 mb-3"
          >
            Ofte Stillede Spørgsmål
          </h2>
          <div className="space-y-4 text-sm text-gray-800">
            <div>
              <h3 className="font-medium text-gray-900">
                Hvornår sendes emails?
              </h3>
              <p className="mt-1 text-gray-700">
                Oversigten dækker mandag–søndag i Centraleuropæisk Tid (CET).
                Emails sendes typisk tidligt i den følgende uge, når den
                ugentlige oversigt er bygget.
              </p>
            </div>
            <div>
              <h3 className="font-medium text-gray-900">Kan jeg annullere?</h3>
              <p className="mt-1 text-gray-700">
                Ja. Abonnementer kan annulleres når som helst. For nu
                er betalinger ikke aktiveret—denne side er en forhåndsvisning af den fremtidige
                abonnementsflow.
              </p>
            </div>
            <div>
              <h3 className="font-medium text-gray-900">Bruges AI?</h3>
              <p className="mt-1 text-gray-700">
                Ja, AI bruges til at hjælpe med at klassificere og opsummere artikler, men de
                underliggende kilder er altid linket, så du kan læse dem i
                deres helhed. Målet er at reducere støj, ikke at erstatte original
                rapportering.
              </p>
            </div>
          </div>
        </section>

        {/* Trust footer note */}
        <section className="border-t border-dashed border-gray-300 pt-4 text-xs text-gray-500">
          <p>
            Betalinger er <span className="font-semibold">ikke</span> aktiveret endnu
            — dette er en pladsholder-side, mens abonnementsmuligheder testes.
          </p>
        </section>
      </section>
    </main>
  );
}


