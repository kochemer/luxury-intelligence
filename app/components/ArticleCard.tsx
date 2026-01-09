'use client';

import { formatDisplayDate } from '../../utils/formatDisplayDate';

type ArticleCardProps = {
  title: string;
  url: string;
  source?: string;
  date?: string;
  summary?: string | null;
  badges?: string[];
};

export default function ArticleCard({
  title,
  url,
  source,
  date,
  summary,
  badges,
}: ArticleCardProps) {
  // Clean summary text (remove AI-Generated Summary prefix if present)
  const cleanSummary = summary
    ?.replace(/^AI-Generated Summary:\s*/i, '')
    .replace(/^AI-generated summary:\s*/i, '')
    .trim() || null;

  // Format date for display
  const displayDate = date ? formatDisplayDate(date) : null;

  return (
    <div className="block w-full bg-white pb-4 md:pb-5 border-b border-gray-100 transition-colors hover:border-gray-300">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="block pt-4 md:pt-5 no-underline text-inherit focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
      >
        {/* Title */}
        <div className="mb-1 md:mb-1.5 font-semibold text-base md:text-lg leading-snug text-blue-800">
          {title}
        </div>

        {/* Meta row: Source • Date (only render if source or date exists) */}
        {(source || displayDate) && (
          <div className="flex items-center gap-2 text-sm md:text-base text-gray-600 mb-1.5 md:mb-2">
            {source && <span>{source}</span>}
            {source && displayDate && (
              <span className="text-gray-400 font-light">•</span>
            )}
            {displayDate && <span>{displayDate}</span>}
            {badges && badges.length > 0 && (
              <>
                <span className="text-gray-400 font-light">•</span>
                <div className="flex gap-1.5 flex-wrap">
                  {badges.map((badge, idx) => (
                    <span
                      key={idx}
                      className="px-1.5 py-0.5 text-xs bg-gray-100 text-gray-700 rounded"
                    >
                      {badge}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Badges row (only render if meta row is hidden and badges exist) */}
        {!(source || displayDate) && badges && badges.length > 0 && (
          <div className="flex gap-1.5 flex-wrap mb-1">
            {badges.map((badge, idx) => (
              <span
                key={idx}
                className="px-1.5 py-0.5 text-xs bg-gray-100 text-gray-700 rounded"
              >
                {badge}
              </span>
            ))}
          </div>
        )}
      </a>

      {/* Optional summary - responsive clamp */}
      {cleanSummary && (
        <div className="mt-2 md:mt-2.5">
          <div
            className="text-sm md:text-base text-gray-600 bg-gray-50 border-l-2 border-gray-300 rounded px-3 md:px-4 py-2 md:py-2.5 line-clamp-2 md:line-clamp-3"
            style={{
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            <span className="text-sm md:text-base text-gray-600">AI summary: </span>{cleanSummary}
          </div>
        </div>
      )}
    </div>
  );
}

