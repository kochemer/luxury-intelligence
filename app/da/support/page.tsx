import Link from 'next/link';

export default function SupportPageDA() {
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
            Support og Kontakt
          </h1>
          <div className="text-lg md:text-xl text-gray-200 leading-relaxed max-w-2xl mx-auto">
            Få hjælp, foreslå kilder eller rapporter problemer
          </div>
        </div>
      </section>

      {/* Content Section */}
      <section className="max-w-5xl mx-auto px-4 md:px-6 py-12 md:py-16">
        {/* Suggest Sources Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 md:p-8 mb-12 md:mb-16">
          <h2 className="text-2xl md:text-3xl font-semibold text-gray-900 mb-4">
            Foreslå en Kilde
          </h2>
          <p className="text-base md:text-lg text-gray-600 leading-relaxed mb-6">
            Vi leder altid efter at udvide vores dækning med højkvalitetskilder. Hvis du kender en publikation, blog, 
            eller nyhedssite, der regelmæssigt publicerer relevant indhold i vores fire fokusområder, vil vi gerne høre om det.
          </p>
          <div className="bg-blue-50 border-l-4 border-blue-600 rounded p-4 mb-6">
            <p className="text-base md:text-lg text-gray-800 leading-relaxed m-0 mb-2">
              <strong>Hvad vi leder efter:</strong>
            </p>
            <ul className="text-base md:text-lg text-gray-800 leading-relaxed m-0 pl-6 list-disc">
              <li>Regelmæssigt publiceringsskema (mindst ugentligt)</li>
              <li>RSS-feed eller struktureret indhold tilgængeligt</li>
              <li>Relevans for AI, ecommerce, luksus, forbrugsvarer eller smykker</li>
              <li>Højkvalitets, originalt indhold</li>
            </ul>
          </div>
          <p className="text-base md:text-lg text-gray-600 leading-relaxed">
            For at foreslå kilder, kontakt os venligst med publikationsnavnet, URL og RSS-feed (hvis tilgængelig).
          </p>
        </div>

        {/* Report Issues Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 md:p-8 mb-12 md:mb-16">
          <h2 className="text-2xl md:text-3xl font-semibold text-gray-900 mb-4">
            Rapporter Problemer
          </h2>
          <p className="text-base md:text-lg text-gray-600 leading-relaxed mb-6">
            Fundet et ødelagt link, forkert kategorisering eller andet problem? Vi sætter pris på din hjælp med at holde oversigten 
            præcis og nyttig.
          </p>
          <div className="bg-amber-50 border-l-4 border-amber-400 rounded p-4 mb-6">
            <p className="text-base md:text-lg text-amber-900 leading-relaxed m-0 mb-2">
              <strong>Almindelige problemer at rapportere:</strong>
            </p>
            <ul className="text-base md:text-lg text-amber-900 leading-relaxed m-0 pl-6 list-disc">
              <li>Ødelagte eller forkerte artikel links</li>
              <li>Artikler i forkert kategori</li>
              <li>Manglende eller forkerte AI resuméer</li>
              <li>Duplikerede artikler</li>
              <li>Tekniske fejl eller visningsproblemer</li>
            </ul>
          </div>
          <p className="text-base md:text-lg text-gray-600 leading-relaxed">
            For at rapportere problemer, kontakt os venligst med så meget detalje som muligt, såsom artikel titlen, uge etiket og en beskrivelse 
            af problemet.
          </p>
        </div>

        {/* Contact Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 md:p-8 mb-12 md:mb-16">
          <h2 className="text-2xl md:text-3xl font-semibold text-gray-900 mb-4">
            Kontakt
          </h2>
          <p style={{
            fontSize: '1.05rem',
            color: '#5c6880',
            lineHeight: 1.7,
            marginBottom: '1.5rem',
          }}>
            For generelle henvendelser, spørgsmål eller feedback, kontakt os venligst. Vi sigter mod at svare på alle 
            henvendelser inden for få arbejdsdage.
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
            <Link href="/da/about" style={{
              fontWeight: 500,
              color: '#20678c',
              background: '#f4f7fa',
              borderRadius: 3,
              padding: '0.5rem 1.2rem',
              textDecoration: 'none',
              fontSize: '1rem',
              border: '1px solid #e7ecf0',
            }}>
              Om
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


