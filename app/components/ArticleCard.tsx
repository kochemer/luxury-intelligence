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

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="block rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 mb-6 no-underline text-inherit"
    >
      {/* Title */}
      <div className="mb-2 font-semibold text-base leading-snug text-blue-900">
        {title}
      </div>

      {/* Meta row: Source • Date (only render if source or date exists) */}
      {(source || date) && (
        <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
          {source && <span>{source}</span>}
          {source && date && (
            <span className="text-gray-400 font-light">•</span>
          )}
          {date && <span>{date}</span>}
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
      {!(source || date) && badges && badges.length > 0 && (
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

      {/* Optional summary - clamped to 2 lines */}
      {cleanSummary && (
        <div
          className="text-sm text-gray-800 bg-gray-50 border-l-4 border-blue-600 rounded px-3 py-2.5 mt-2 italic line-clamp-2"
          style={{
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {cleanSummary}
        </div>
      )}
    </a>
  );
}

