import ArticleCard from './ArticleCard';

type Article = {
  id: string;
  title: string;
  url: string;
  source: string;
  published_at?: string;
  date?: string;
  aiSummary?: string | null;
};

type CategorySectionProps = {
  title: string;
  description?: string;
  count: number;
  articles: Article[];
  rankingLabel?: string;
};

export default function CategorySection({
  title,
  description,
  count,
  articles,
  rankingLabel,
}: CategorySectionProps) {
  return (
    <section className="mb-12 pb-12 border-b border-gray-200 last:border-b-0 last:pb-0 last:mb-0">
      {/* Section Header: Title (left) and Count Badge (right) */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
        <span className="px-3 py-1 text-xs font-medium border border-gray-200 bg-gray-50 text-gray-700 rounded-md">
          {count}
        </span>
      </div>

      {/* Optional Description */}
      {description && (
        <p className="text-base text-gray-600 mb-3">{description}</p>
      )}

      {/* Ranking Label Meta Line */}
      {rankingLabel && (
        <p className="text-sm text-gray-500 mb-4">
          Ranking: {rankingLabel}
        </p>
      )}

      {/* Articles List */}
      <div className="space-y-0">
        {articles.length > 0 ? (
          articles.map((article) => (
            <ArticleCard
              key={article.id}
              title={article.title}
              url={article.url}
              source={article.source}
              date={article.date || article.published_at || ''}
              summary={article.aiSummary}
            />
          ))
        ) : (
          <div className="bg-gray-50 rounded-md border border-dashed border-gray-300 text-center py-8 px-4 my-4">
            <div className="font-semibold text-base text-gray-400 mb-2">
              No articles this week
            </div>
            <div className="text-sm text-gray-400">
              We'll be back with relevant updates and expert news soon.
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

