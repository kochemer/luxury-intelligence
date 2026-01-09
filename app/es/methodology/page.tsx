import Link from 'next/link';
import type { Metadata } from 'next';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://luxury-intelligence.vercel.app";

export const metadata: Metadata = {
  title: 'Metodología – Cómo se cura Luxury Intelligence',
  description: 'Cómo se recopila, clasifica y resume el resumen semanal de IA, ecommerce, lujo y joyería.',
  alternates: {
    canonical: '/es/methodology',
  },
  openGraph: {
    title: 'Metodología – Cómo se cura Luxury Intelligence',
    description: 'Cómo se recopila, clasifica y resume el resumen semanal de IA, ecommerce, lujo y joyería.',
    images: [`${siteUrl}/og-default.svg`],
  },
  twitter: {
    title: 'Metodología – Cómo se cura Luxury Intelligence',
    description: 'Cómo se recopila, clasifica y resume el resumen semanal de IA, ecommerce, lujo y joyería.',
    images: [`${siteUrl}/og-default.svg`],
  },
};

export default function MethodologyPageES() {
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
            Metodología
          </h1>
          <div className="text-base md:text-lg text-gray-100 leading-relaxed max-w-xl mx-auto">
            Cómo se produce el resumen semanal
          </div>
        </div>
      </section>

      {/* Content Section */}
      <section className="max-w-3xl mx-auto px-4 md:px-6 py-12 md:py-16">
        {/* What this site is */}
        <div className="mb-10 md:mb-12">
          <h2 className="text-2xl md:text-3xl font-semibold text-gray-900 mb-4">
            Qué es este sitio
          </h2>
          <p className="text-base md:text-lg text-gray-700 leading-relaxed mb-3">
            Un resumen semanal de inteligencia industrial curado que cubre <strong className="text-gray-900">IA y Estrategia</strong>, <strong className="text-gray-900">Ecommerce y Tecnología Retail</strong>, <strong className="text-gray-900">Lujo y Consumo</strong>, e <strong className="text-gray-900">Industria de la Joyería</strong>.
          </p>
          <p className="text-base md:text-lg text-gray-700 leading-relaxed">
            Cada semana, seleccionamos los artículos más relevantes, generamos resúmenes concisos y los presentamos en un formato fácil de escanear.
          </p>
        </div>

        {/* How articles are collected */}
        <div className="mb-10 md:mb-12">
          <h2 className="text-2xl md:text-3xl font-semibold text-gray-900 mb-4">
            Cómo se recopilan los artículos
          </h2>
          <ul className="space-y-3 text-base md:text-lg text-gray-700 leading-relaxed">
            <li>
              <strong className="text-gray-900">Fuentes:</strong> Feeds RSS y páginas web seleccionadas de publicaciones de la industria confiables, sitios de noticias y blogs de expertos.
            </li>
            <li>
              <strong className="text-gray-900">Ingesta:</strong> Los artículos se ingieren automáticamente en un horario regular usando un sistema de solo anexión.
            </li>
            <li>
              <strong className="text-gray-900">Desduplicación:</strong> Los artículos duplicados se identifican y filtran automáticamente para asegurar que cada artículo aparezca solo una vez.
            </li>
          </ul>
        </div>

        {/* How articles are selected */}
        <div className="mb-10 md:mb-12">
          <h2 className="text-2xl md:text-3xl font-semibold text-gray-900 mb-4">
            Cómo se seleccionan los artículos
          </h2>
          <ul className="space-y-3 text-base md:text-lg text-gray-700 leading-relaxed">
            <li>
              <strong className="text-gray-900">Ventana semanal:</strong> De lunes a domingo, zona horaria de Europa/Copenhague. Cada resumen cubre artículos publicados durante esa semana.
            </li>
            <li>
              <strong className="text-gray-900">Categorización:</strong> Los artículos se clasifican en una de cuatro categorías temáticas usando clasificación asistida por LLM.
            </li>
            <li>
              <strong className="text-gray-900">Clasificación:</strong> Los artículos se puntúan según relevancia y diversidad de fuentes. Las protecciones de diversidad previenen la sobrerrepresentación de una sola fuente.
            </li>
            <li>
              <strong className="text-gray-900">Selección Top-N:</strong> Los artículos con mayor puntuación en cada categoría se seleccionan y publican por categoría.
            </li>
          </ul>
        </div>

        {/* How AI is used */}
        <div className="mb-10 md:mb-12">
          <h2 className="text-2xl md:text-3xl font-semibold text-gray-900 mb-4">
            Cómo se usa la IA
          </h2>
          <p className="text-base md:text-lg text-gray-700 leading-relaxed mb-4">
            La IA se usa de dos maneras:
          </p>
          <ul className="space-y-3 text-base md:text-lg text-gray-700 leading-relaxed mb-4">
            <li>
              <strong className="text-gray-900">Categorización:</strong> La clasificación asistida por LLM ayuda a asignar artículos a la categoría temática apropiada.
            </li>
            <li>
              <strong className="text-gray-900">Resúmenes:</strong> Se generan resúmenes cortos cuando hay fragmentos de artículos disponibles, usando solo el título, fuente, fecha de publicación y fragmento.
            </li>
          </ul>
          <p className="text-base md:text-lg text-gray-700 leading-relaxed mb-3">
            <strong className="text-gray-900">Lo que la IA no hace:</strong>
          </p>
          <ul className="space-y-2 text-base md:text-lg text-gray-700 leading-relaxed mb-4">
            <li>• Extracción o reescritura de artículos completos</li>
            <li>• Acceso a contenido con paywall</li>
            <li>• Toma de decisiones editoriales (la selección y clasificación son algorítmicas)</li>
          </ul>
          <p className="text-base md:text-lg text-gray-700 leading-relaxed">
            Las entradas de IA se limitan a metadatos (título, fuente, fecha, fragmento) y se usan configuraciones deterministas donde sea posible para asegurar consistencia y explicabilidad.
          </p>
        </div>

        {/* Transparency & feedback */}
        <div className="mb-10 md:mb-12">
          <h2 className="text-2xl md:text-3xl font-semibold text-gray-900 mb-4">
            Transparencia y comentarios
          </h2>
          <p className="text-base md:text-lg text-gray-700 leading-relaxed mb-3">
            La selección de artículos es <strong className="text-gray-900">aumentada por IA, explicable primero</strong>. Priorizamos la transparencia en cómo se recopilan, categorizan y clasifican los artículos.
          </p>
          <p className="text-base md:text-lg text-gray-700 leading-relaxed">
            ¿Preguntas, sugerencias o quieres sugerir una fuente? <Link href="/es/feedback" className="text-blue-700 hover:text-blue-800 underline font-medium">Comparte tus comentarios</Link>.
          </p>
        </div>

        {/* Update cadence */}
        <div className="mb-10 md:mb-12">
          <h2 className="text-2xl md:text-3xl font-semibold text-gray-900 mb-4">
            Frecuencia de actualización
          </h2>
          <p className="text-base md:text-lg text-gray-700 leading-relaxed">
            Actualizado semanalmente. Se publican nuevos resúmenes cada semana cubriendo de lunes a domingo (zona horaria CET). Los resúmenes semanales pasados están disponibles en el <Link href="/es/archive" className="text-blue-700 hover:text-blue-800 underline">archivo</Link>.
          </p>
        </div>

        {/* Footer note */}
        <div className="border-t border-gray-200 pt-6 mt-8">
          <p className="text-sm text-gray-500 text-center">
            No afiliado con ningún editor. Los enlaces van a fuentes originales.
          </p>
        </div>
      </section>
    </main>
  );
}

