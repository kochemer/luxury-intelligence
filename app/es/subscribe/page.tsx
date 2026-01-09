import Link from 'next/link';
import SubscribePricing from '../../components/SubscribePricing';

export default function SubscribePageES() {
  const formAction =
    process.env.NEXT_PUBLIC_FEEDBACK_FORM_ACTION?.trim() ||
    'https://formspree.io/f/xwvpbnbz';

  return (
    <main className="w-full bg-[#f7f9fb] min-h-screen">
      {/* Hero */}
      <section className="w-full border-b border-gray-200 bg-gradient-to-r from-[#2e3741] via-[#394855] to-[#4a5a6b]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-12">
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Resumen semanal por email
          </h1>
          <p className="text-sm sm:text-base text-gray-100 leading-relaxed mb-3 max-w-xl">
            Un resumen semanal conciso sobre{' '}
            <span className="font-semibold">IA y estrategia</span>,{' '}
            <span className="font-semibold">ecommerce y tecnología retail</span>,{' '}
            <span className="font-semibold">lujo y consumo</span>, y{' '}
            <span className="font-semibold">joyería</span>.
          </p>
          <p className="text-xs sm:text-sm text-gray-200 mb-6">
            Entregado una vez por semana (cubriendo lunes–domingo, CET). Sin ruido, solo
            señales curadas.
          </p>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Link
              href="/es"
              className="inline-flex items-center justify-center rounded-md border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-medium text-gray-50 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-yellow-300 focus-visible:ring-offset-[#2e3741]"
            >
              Ver último resumen
            </Link>
            <span className="text-gray-200 text-xs">o explorar el archivo</span>
            <Link
              href="/es/archive"
              className="text-xs font-medium text-yellow-200 underline underline-offset-4 hover:text-yellow-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-yellow-300 focus-visible:ring-offset-[#2e3741] rounded"
            >
              Archivo
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
            Qué está incluido
          </h2>
          <div className="rounded-xl bg-white border border-gray-200 p-4 sm:p-5 shadow-sm">
            <ul className="space-y-2 text-sm text-gray-700">
              <li className="flex gap-2">
                <span className="mt-[3px] text-green-500">●</span>
                <span>Historias principales por categoría, curadas de una amplia lista de fuentes.</span>
              </li>
              <li className="flex gap-2">
                <span className="mt-[3px] text-green-500">●</span>
                <span>Enlaces directos a fuentes originales para lectura más profunda.</span>
              </li>
              <li className="flex gap-2">
                <span className="mt-[3px] text-green-500">●</span>
                <span>Resúmenes opcionales asistidos por IA para acelerar el escaneo.</span>
              </li>
              <li className="flex gap-2">
                <span className="mt-[3px] text-green-500">●</span>
                <span>Acceso al archivo en el sitio web para que puedas revisar semanas pasadas.</span>
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
            Preguntas Frecuentes
          </h2>
          <div className="space-y-4 text-sm text-gray-800">
            <div>
              <h3 className="font-medium text-gray-900">
                ¿Cuándo se envían los emails?
              </h3>
              <p className="mt-1 text-gray-700">
                El resumen cubre lunes–domingo en hora de Europa Central (CET).
                Los emails generalmente se envían a principios de la semana siguiente una vez que el
                resumen semanal está construido.
              </p>
            </div>
            <div>
              <h3 className="font-medium text-gray-900">¿Puedo cancelar?</h3>
              <p className="mt-1 text-gray-700">
                Sí. Las suscripciones se podrán cancelar en cualquier momento. Por ahora,
                los pagos no están habilitados—esta página es una vista previa del futuro
                flujo de suscripción.
              </p>
            </div>
            <div>
              <h3 className="font-medium text-gray-900">¿Se usa IA?</h3>
              <p className="mt-1 text-gray-700">
                Sí, la IA se usa para ayudar a clasificar y resumir artículos, pero las
                fuentes subyacentes siempre están enlazadas para que puedas leerlas en
                su totalidad. El objetivo es reducir el ruido, no reemplazar el reportaje
                original.
              </p>
            </div>
          </div>
        </section>

        {/* Trust footer note */}
        <section className="border-t border-dashed border-gray-300 pt-4 text-xs text-gray-500">
          <p>
            Los pagos <span className="font-semibold">no</span> están habilitados aún
            — esta es una página de marcador de posición mientras se prueban las opciones de suscripción.
          </p>
        </section>
      </section>
    </main>
  );
}

