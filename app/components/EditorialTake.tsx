/**
 * EditorialTake — weekly neutral AI explainer (The Week in Context).
 *
 * Renders the `editorialTake` field from the digest JSON.
 * Content is AI-generated but can be manually overridden (editorialTakeOverride flag).
 * Visually styled as a newspaper editorial block.
 */

type EditorialTakeProps = {
  text: string;
  /** Whether this take was manually written/edited by the curator */
  isOverride?: boolean;
};

export function EditorialTake({ text, isOverride = false }: EditorialTakeProps) {
  return (
    <div className="my-6 sm:my-8 md:my-10">
      <div
        className="border-t-2 border-[var(--color-accent)] pt-6 md:pt-8"
        style={{ borderTopWidth: '2px' }}
      >
        {/* Label row */}
        <div className="flex items-center justify-between mb-4 md:mb-5">
          <p className="font-mono text-[11px] tracking-[0.3em] uppercase text-[var(--color-accent)]">
            The Week in Context
          </p>
          {isOverride && (
            <span className="font-mono text-[10px] tracking-[0.15em] uppercase text-[var(--color-text-secondary)] opacity-60">
              edited
            </span>
          )}
        </div>

        {/* Editorial prose */}
        <blockquote className="font-serif text-[1.05rem] md:text-[1.15rem] leading-relaxed text-[var(--color-text-primary)] mb-4 md:mb-5 not-italic">
          {text}
        </blockquote>

        {/* Attribution */}
        <span className="font-mono text-[11px] tracking-[0.2em] uppercase text-[var(--color-text-secondary)]">
          Written by AI from this week&apos;s selected sources.
        </span>
      </div>
    </div>
  );
}
