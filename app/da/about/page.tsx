import Link from 'next/link';

export default function AboutPageDA() {
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
            Om Denne Oversigt
          </h1>
          <div className="text-lg md:text-xl text-gray-200 leading-relaxed max-w-2xl mx-auto">
            Forståelse af, hvordan vi kuraterer, scorer og opsummerer ugens vigtigste nyheder
          </div>
        </div>
      </section>

      {/* Content Section */}
      <section className="max-w-5xl mx-auto px-4 md:px-6 py-12 md:py-16">
        {/* Purpose Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 md:p-8 mb-12 md:mb-16">
          <h2 className="text-2xl md:text-3xl font-semibold text-gray-900 mb-4">
            Formål
          </h2>
          <p className="text-base md:text-lg text-gray-600 leading-relaxed mb-4">
            Luxury Intelligence sparer dig timer med læsning ved at kuratere de mest relevante artikler på fire nøglesektorer: 
            <strong className="text-gray-900"> AI og Strategi</strong>, 
            <strong className="text-gray-900"> Ecommerce og Retail Teknologi</strong>, 
            <strong className="text-gray-900"> Luksus og Forbrug</strong>, og 
            <strong className="text-gray-900"> Smykkebranchen</strong>.
          </p>
          <p className="text-base md:text-lg text-gray-600 leading-relaxed">
            Hver uge indtager vi automatisk artikler fra pålidelige kilder, scorer dem for relevans, 
            genererer AI-drevne resuméer og præsenterer de bedste artikler i et let-skanbart format.
          </p>
        </div>

        {/* How It Works Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 md:p-8 mb-12 md:mb-16">
          <h2 className="text-2xl md:text-3xl font-semibold text-gray-900 mb-8">
            Sådan Fungerer Det
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
                  Kilder
                </h3>
                <p className="text-base md:text-lg text-gray-600 leading-relaxed">
                  Vi overvåger RSS-feeds og websider fra pålidelige branchepublikationer, nyhedssites og ekspertblogge. 
                  Artikler indtages automatisk på et regelmæssigt skema.
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
                  Scoring og Rangering
                </h3>
                <p className="text-base md:text-lg text-gray-600 leading-relaxed mb-3">
                  Hver artikel klassificeres i en af fire emnekategorier og scores baseret på <strong className="text-gray-900">relevans</strong> 
                  og <strong className="text-gray-900">kildekvalitet</strong>. De højest scorede artikler vælges til hver ugentlig oversigt.
                </p>
                <p className="text-base md:text-lg text-gray-600 leading-relaxed">
                  Artikler rangeres inden for hver kategori ved at kombinere disse faktorer: <strong className="text-gray-900">relevans</strong> måler, hvor tæt indholdet matcher kategoriens fokus, 
                  og <strong className="text-gray-900">kildekvalitet</strong> afspejler publikationens omdømme og pålidelighed. 
                  De bedste artikler i hver kategori vises i rækkefølge efter deres kombinerede score.
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
                  AI Resuméer
                </h3>
                <p style={{
                  fontSize: '1.05rem',
                  color: '#5c6880',
                  lineHeight: 1.7,
                }}>
                  Udvalgte artikler modtager AI-genererede resuméer, der fanger nøglepunkter og indsigt, hvilket hjælper dig 
                  med hurtigt at forstå artikelens relevans, før du beslutter at læse hele stykket.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Transparency & Disclaimer Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 md:p-8 mb-12 md:mb-16">
          <h2 className="text-2xl md:text-3xl font-semibold text-gray-900 mb-6">
            Gennemsigtighed og Ansvarsfraskrivelse
          </h2>
          <div className="bg-blue-50 border-l-4 border-blue-600 rounded p-4 mb-6">
            <p className="text-base md:text-lg text-gray-800 leading-relaxed italic m-0">
              <strong>AI-Genereret Indhold:</strong> Resuméer genereres ved hjælp af AI og kan indeholde unøjagtigheder eller 
              gå glip af vigtige nuancer. Konsulter altid den originale artikel for komplet information.
            </p>
          </div>
          <p className="text-base md:text-lg text-gray-600 leading-relaxed mb-4">
            <strong className="text-gray-900">Ikke Investerings- eller Forretningsrådgivning:</strong> Denne oversigt er kun til 
            informationsformål. Artikler og resuméer er ikke beregnet som investerings-, juridisk eller forretningsrådgivning.
          </p>
          <p className="text-base md:text-lg text-gray-600 leading-relaxed mb-4">
            <strong className="text-gray-900">Kildevalg:</strong> Kilder vælges baseret på relevans, 
            kvalitet og regelmæssige publiceringsskemaer. Vi sigter mod at inkludere forskellige perspektiver, men kan ikke garantere 
            omfattende dækning af alle relevante publikationer.
          </p>
          <p style={{
            fontSize: '1.05rem',
            color: '#5c6880',
            lineHeight: 1.7,
          }}>
            <strong style={{ color: '#233442' }}>Automatiseret Proces:</strong> Denne oversigt genereres automatisk 
            gennem vores indtagelses-, klassificerings- og opsummeringspipeline. Mens vi overvåger kvaliteten, er processen 
            i høj grad automatiseret og kan lejlighedsvis inkludere artikler, der ikke perfekt matcher deres tildelte kategori.
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
            <Link href="/da/support" style={{
              fontWeight: 500,
              color: '#20678c',
              background: '#f4f7fa',
              borderRadius: 3,
              padding: '0.5rem 1.2rem',
              textDecoration: 'none',
              fontSize: '1rem',
              border: '1px solid #e7ecf0',
            }}>
              Support
            </Link>
          </div>
          <Link href="/da" style={{
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
            Tilbage til Start
          </Link>
        </div>
      </section>
    </main>
  );
}


