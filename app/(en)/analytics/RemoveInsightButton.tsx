'use client';

import { removeInsight } from './actions';

/** The × on an insight tile. Asks first: removing is permanent from the page's point of view. */
export default function RemoveInsightButton({ id }: { id: number }) {
  return (
    <form
      action={removeInsight}
      onSubmit={e => {
        if (!window.confirm('Remove this insight? It will not come back.')) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        title="Remove this insight"
        aria-label="Remove this insight"
        className="inline-flex items-center justify-center w-8 h-8 md:w-7 md:h-7 text-lg leading-none rounded-[2px] border border-[var(--color-border)] text-[var(--color-text-primary)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] cursor-pointer"
      >
        ×
      </button>
    </form>
  );
}
