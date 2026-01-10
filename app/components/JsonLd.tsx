/**
 * Server component that renders JSON-LD structured data
 * for SEO and GEO (Google's Entity Optimization)
 */
export default function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}


