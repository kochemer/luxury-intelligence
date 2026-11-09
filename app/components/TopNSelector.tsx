'use client';

import { VALID_N_VALUES, setTopN, useTopN } from '@/hooks/useTopN';

export default function TopNSelector() {
  const currentN = useTopN();
  const handleChange = setTopN;

  return (
    <div className="flex items-center gap-1 md:gap-1">
      <span className="text-xs text-black/45">Show:</span>
      {VALID_N_VALUES.map((n) => (
        <button
          key={n}
          onClick={() => handleChange(n)}
          className={`px-1.5 sm:px-1.5 md:px-1.5 py-1 sm:py-0.5 text-xs rounded transition-colors cursor-pointer flex items-center justify-center ${
            currentN === n
              ? 'font-semibold text-black/70'
              : 'text-black/45 hover:text-black/55'
          }`}
          aria-label={`Show ${n} articles per category`}
          aria-pressed={currentN === n}
        >
          {n}
        </button>
      ))}
      <span className="text-xs text-black/45 hidden sm:inline">per category</span>
    </div>
  );
}
