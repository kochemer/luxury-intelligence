import Link from 'next/link';

export default function AboutPageES() {
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
            Acerca de Este Resumen
          </h1>
          <div className="text-lg md:text-xl text-gray-200 leading-relaxed max-w-2xl mx-auto">
            Entendiendo cómo curamos, puntuamos y resumimos las noticias más importantes de la semana
          </div>
        </div>
      </section>

      {/* Content Section */}
      <section className="max-w-5xl mx-auto px-4 md:px-6 py-12 md:py-16">
        {/* Purpose Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 md:p-8 mb-12 md:mb-16">
          <h2 className="text-2xl md:text-3xl font-semibold text-gray-900 mb-4">
            Propósito
          </h2>
          <p className="text-base md:text-lg text-gray-600 leading-relaxed mb-4">
            Luxury Intelligence te ahorra horas de lectura curando los artículos más relevantes en cuatro sectores clave: 
            <strong className="text-gray-900"> IA y Estrategia</strong>, 
            <strong className="text-gray-900"> Ecommerce y Tecnología Retail</strong>, 
            <strong className="text-gray-900"> Lujo y Consumo</strong>, e 
            <strong className="text-gray-900"> Industria de la Joyería</strong>.
          </p>
          <p className="text-base md:text-lg text-gray-600 leading-relaxed">
            Cada semana, ingerimos automáticamente artículos de fuentes confiables, los puntuamos por relevancia, 
            generamos resúmenes con IA y presentamos los mejores artículos en un formato fácil de escanear.
          </p>
        </div>

        {/* How It Works Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 md:p-8 mb-12 md:mb-16">
          <h2 className="text-2xl md:text-3xl font-semibold text-gray-900 mb-8">
            Cómo Funciona
          </h2>
          
          <div style={{ marginBottom: '2rem' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
              marginBottom: '1rem',
            }}>
              <div style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                background: '#20678c',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 600,
                fontSize: '1.2rem',
                flexShrink: 0,
              }}>
                1
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  Fuentes
                </h3>
                <p className="text-base md:text-lg text-gray-600 leading-relaxed">
                  Monitoreamos feeds RSS y páginas web de publicaciones de la industria confiables, sitios de noticias y blogs de expertos. 
                  Los artículos se ingieren automáticamente en un horario regular.
                </p>
              </div>
            </div>
          </div>

          <div style={{ marginBottom: '2rem' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
              marginBottom: '1rem',
            }}>
              <div style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                background: '#20678c',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 600,
                fontSize: '1.2rem',
                flexShrink: 0,
              }}>
                2
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  Puntuación y Clasificación
                </h3>
                <p className="text-base md:text-lg text-gray-600 leading-relaxed mb-3">
                  Cada artículos se clasifica en una de cuatro categorías temáticas y se puntúa según <strong className="text-gray-900">relevancia</strong>, 
                  y <strong className="text-gray-900">calidad de la fuente</strong>. Los artículos con mayor puntuación se seleccionan para cada resumen semanal.
                </p>
                <p className="text-base md:text-lg text-gray-600 leading-relaxed">
                  Los artículos se clasifican dentro de cada categoría combinando estos factores: <strong className="text-gray-900">relevancia</strong> mide qué tan de cerca el contenido coincide con el enfoque de la categoría, 
                  y <strong className="text-gray-900">calidad de la fuente</strong> refleja la reputación y confiabilidad de la publicación. 
                  Los mejores artículos en cada categoría se muestran en orden de su puntuación combinada.
                </p>
              </div>
            </div>
          </div>

          <div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
              marginBottom: '1rem',
            }}>
              <div style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                background: '#20678c',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 600,
                fontSize: '1.2rem',
                flexShrink: 0,
              }}>
                3
              </div>
              <div>
                <h3 style={{
                  fontSize: '1.3rem',
                  fontWeight: 600,
                  color: '#233442',
                  marginBottom: '0.5rem',
                }}>
                  Resúmenes con IA
                </h3>
                <p style={{
                  fontSize: '1.05rem',
                  color: '#5c6880',
                  lineHeight: 1.7,
                }}>
                  Los artículos seleccionados reciben resúmenes generados por IA que capturan puntos clave e ideas, ayudándote 
                  a entender rápidamente la relevancia del artículo antes de decidir leer el artículo completo.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Transparency & Disclaimer Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 md:p-8 mb-12 md:mb-16">
          <h2 className="text-2xl md:text-3xl font-semibold text-gray-900 mb-6">
            Transparencia y Descargo de Responsabilidad
          </h2>
          <div className="bg-blue-50 border-l-4 border-blue-600 rounded p-4 mb-6">
            <p className="text-base md:text-lg text-gray-800 leading-relaxed italic m-0">
              <strong>Contenido Generado por IA:</strong> Los resúmenes se generan usando IA y pueden contener inexactitudes o 
              perder matices importantes. Siempre consulta el artículo original para información completa.
            </p>
          </div>
          <p className="text-base md:text-lg text-gray-600 leading-relaxed mb-4">
            <strong className="text-gray-900">No es Asesoramiento de Inversión o Negocios:</strong> Este resumen es solo para 
            fines informativos. Los artículos y resúmenes no están destinados como asesoramiento de inversión, legal o de negocios.
          </p>
          <p className="text-base md:text-lg text-gray-600 leading-relaxed mb-4">
            <strong className="text-gray-900">Selección de Fuentes:</strong> Las fuentes se seleccionan según relevancia, 
            calidad y horarios de publicación regulares. Buscamos incluir perspectivas diversas pero no podemos garantizar 
            cobertura completa de todas las publicaciones relevantes.
          </p>
          <p style={{
            fontSize: '1.05rem',
            color: '#5c6880',
            lineHeight: 1.7,
          }}>
            <strong style={{ color: '#233442' }}>Proceso Automatizado:</strong> Este resumen se genera automáticamente 
            a través de nuestra tubería de ingesta, clasificación y resumen. Aunque monitoreamos la calidad, el proceso 
            es en gran parte automatizado y ocasionalmente puede incluir artículos que no coinciden perfectamente con su categoría asignada.
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
            <Link href="/es/support" style={{
              fontWeight: 500,
              color: '#20678c',
              background: '#f4f7fa',
              borderRadius: 3,
              padding: '0.5rem 1.2rem',
              textDecoration: 'none',
              fontSize: '1rem',
              border: '1px solid #e7ecf0',
            }}>
              Soporte
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

