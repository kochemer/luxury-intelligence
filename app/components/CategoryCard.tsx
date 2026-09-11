import Link from 'next/link';

type CategoryCardProps = {
  title: string;
  description: string;
  articleCount: number;
  color: string;
  href: string;
};

export default function CategoryCard({
  title,
  description,
  articleCount,
  color,
  href,
}: CategoryCardProps) {
  return (
    <Link
      href={href}
      className="group relative block bg-[var(--color-surface)] border border-gray-100 rounded-sm p-5 hover:shadow-lg hover:-translate-y-px hover:border-[var(--color-accent)] transition-all duration-200 text-left focus-visible:outline-none overflow-hidden"
      style={{ borderTopWidth: '4px', borderTopColor: color }}
      aria-label={`${title}, ${articleCount} articles this week`}
    >
      {/* Hover gradient tint */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
        style={{ background: `linear-gradient(to bottom, ${color}14, transparent)` }}
        aria-hidden="true"
      />

      {/* A span, not a heading. These cards are a navigation grid whose labels
          duplicate the <h2> section headings further down the page, so tagging
          them as h3 created an h1 → h3 hierarchy skip on every page (40 of
          them) and emitted each category name twice as a heading. Styling is
          unchanged; only the document outline is. */}
      <span className="relative block font-serif text-card-title font-bold text-[var(--color-text-primary)] bg-gradient-to-r from-current to-current bg-[length:0_2px] bg-left-bottom bg-no-repeat group-hover:bg-[length:100%_2px] transition-all duration-300">
        {title}
      </span>
      <p className="relative text-body text-[var(--color-text-secondary)] mt-1 leading-snug">
        {description}
      </p>
      <div className="relative flex items-center justify-between mt-2">
        <p className="text-meta text-[var(--color-text-secondary)] opacity-80">
          {articleCount} article{articleCount !== 1 ? 's' : ''} this week
        </p>
        <span
          className="opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300 text-sm"
          style={{ color }}
          aria-hidden="true"
        >
          →
        </span>
      </div>
    </Link>
  );
}
