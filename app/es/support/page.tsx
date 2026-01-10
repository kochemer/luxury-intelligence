import Link from 'next/link';

export default function SupportPageES() {
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
        minHeight: 280,
        background: 'linear-gradient(120deg,#2e3741 40%, #637b8b 100%)',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
        borderBottom: '8px solid #eaeaea'
      }}>
        <div className="w-full max-w-5xl mx-auto px-4 md:px-6" style={{
          position: 'relative',
          zIndex: 2,
          color: '#fff',
          padding: '3rem 1.5rem 2.5rem 1.5rem',
          textAlign: 'center',
        }}>
          <h1 className="text-4xl md:text-5xl font-bold mb-4" style={{
            textShadow: '0 2px 8px rgba(18,30,49,0.20)'
          }}>
            Soporte y Contacto
          </h1>
          <div className="text-lg md:text-xl text-gray-200 leading-relaxed max-w-2xl mx-auto">
            Obtén ayuda, sugiere fuentes o reporta problemas
          </div>
        </div>
      </section>

      {/* Content Section */}
      <section className="max-w-5xl mx-auto px-4 md:px-6 py-12 md:py-16">
        {/* Suggest Sources Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 md:p-8 mb-12 md:mb-16">
          <h2 className="text-2xl md:text-3xl font-semibold text-gray-900 mb-4">
            Sugerir una Fuente
          </h2>
          <p className="text-base md:text-lg text-gray-600 leading-relaxed mb-6">
            Siempre estamos buscando expandir nuestra cobertura con fuentes de alta calidad. Si conoces una publicación, blog, 
            o sitio de noticias que regularmente publique contenido relevante en nuestras cuatro áreas de enfoque, nos encantaría saberlo.
          </p>
          <div className="bg-blue-50 border-l-4 border-blue-600 rounded p-4 mb-6">
            <p className="text-base md:text-lg text-gray-800 leading-relaxed m-0 mb-2">
              <strong>Lo que buscamos:</strong>
            </p>
            <ul className="text-base md:text-lg text-gray-800 leading-relaxed m-0 pl-6 list-disc">
              <li>Horario de publicación regular (al menos semanal)</li>
              <li>Feed RSS o contenido estructurado disponible</li>
              <li>Relevancia para IA, ecommerce, lujo, bienes de consumo o joyería</li>
              <li>Contenido de alta calidad y original</li>
            </ul>
          </div>
          <p className="text-base md:text-lg text-gray-600 leading-relaxed">
            Para sugerir fuentes, por favor contáctanos con el nombre de la publicación, URL y feed RSS (si está disponible).
          </p>
        </div>

        {/* Report Issues Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 md:p-8 mb-12 md:mb-16">
          <h2 className="text-2xl md:text-3xl font-semibold text-gray-900 mb-4">
            Reportar Problemas
          </h2>
          <p className="text-base md:text-lg text-gray-600 leading-relaxed mb-6">
            ¿Encontraste un enlace roto, categorización incorrecta u otro problema? Agradecemos tu ayuda para mantener el resumen 
            preciso y útil.
          </p>
          <div className="bg-amber-50 border-l-4 border-amber-400 rounded p-4 mb-6">
            <p className="text-base md:text-lg text-amber-900 leading-relaxed m-0 mb-2">
              <strong>Problemas comunes para reportar:</strong>
            </p>
            <ul className="text-base md:text-lg text-amber-900 leading-relaxed m-0 pl-6 list-disc">
              <li>Enlaces de artículos rotos o incorrectos</li>
              <li>Artículos en la categoría incorrecta</li>
              <li>Resúmenes de IA faltantes o incorrectos</li>
              <li>Artículos duplicados</li>
              <li>Errores técnicos o problemas de visualización</li>
            </ul>
          </div>
          <p className="text-base md:text-lg text-gray-600 leading-relaxed">
            Para reportar problemas, por favor contáctanos con tanto detalle como sea posible, como el título del artículo, etiqueta de semana y una descripción 
            del problema.
          </p>
        </div>

        {/* Contact Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 md:p-8 mb-12 md:mb-16">
          <h2 className="text-2xl md:text-3xl font-semibold text-gray-900 mb-4">
            Contacto
          </h2>
          <p style={{
            fontSize: '1.05rem',
            color: '#5c6880',
            lineHeight: 1.7,
            marginBottom: '1.5rem',
          }}>
            Para consultas generales, preguntas o comentarios, por favor contáctanos. Nos esforzamos por responder a todas 
            las consultas en unos pocos días hábiles.
          </p>
        </div>

        {/* Navigation */}
        <div style={{
          textAlign: 'center',
          marginTop: '2.5rem',
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '1rem',
            flexWrap: 'wrap',
            marginBottom: '1.5rem',
          }}>
            <Link href="/es/about" style={{
              fontWeight: 500,
              color: '#20678c',
              background: '#f4f7fa',
              borderRadius: 3,
              padding: '0.5rem 1.2rem',
              textDecoration: 'none',
              fontSize: '1rem',
              border: '1px solid #e7ecf0',
            }}>
              Acerca de
            </Link>
          </div>
          <Link href="/es" style={{
            fontWeight: 500,
            color: '#06244c',
            background: '#fed236',
            borderRadius: 3,
            padding: '0.65rem 1.6rem',
            textDecoration: 'none',
            display: 'inline-block',
            transition: 'background 0.19s, color 0.16s',
            fontSize: '1.12rem',
            boxShadow: '0 1px 2px rgba(0,0,0,0.07)'
          }}>
            Volver al Inicio
          </Link>
        </div>
      </section>
    </main>
  );
}


