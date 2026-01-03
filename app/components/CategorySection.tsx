import ArticleCard from './ArticleCard';
import Link from 'next/link';

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
  variant?: 'default' | 'grid';
  id?: string;
};

export default function CategorySection({
  title,
  description,
  count,
  articles,
  rankingLabel,
  variant = 'default',
  id,
}: CategorySectionProps) {
  const isGrid = variant === 'grid';
  
  return (
    <section 
      id={id}
      className={isGrid 
        ? "bg-white rounded-lg border border-gray-100 p-4 md:p-7 scroll-mt-24" 
        : "mb-12 pb-12 border-b border-gray-200 last:border-b-0 last:pb-0 last:mb-0 scroll-mt-24"
      }
    >
      {/* Section Header: Title (left) and Count Badge (right) */}
      <div className="flex items-baseline justify-between mb-5 md:mb-6">
        <h2 className="text-2xl md:text-3xl font-bold text-gray-900 leading-tight">{title}</h2>
        {count > 0 && (
          <span className="px-3 py-1 text-xs font-medium border border-gray-200 bg-gray-50 text-gray-700 rounded-md ml-4 flex-shrink-0">
            {count}
          </span>
        )}
      </div>

      {/* Optional Description */}
      {description && (
        <p className="text-base md:text-lg text-gray-600 mb-4 md:mb-5 leading-relaxed">{description}</p>
      )}

      {/* Articles List */}
      <div className="space-y-4 md:space-y-5">
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
          <div className="bg-gray-50 rounded-lg border border-dashed border-gray-200 text-center py-10 md:py-12 px-4 md:px-6">
            <div className="font-medium text-base md:text-lg text-gray-600 mb-2">
              Coverage light this week
            </div>
            <div className="text-sm md:text-base text-gray-500 mb-4">
              This is a curated weekly selection. Not every category will have articles every week.
            </div>
            {isGrid && (
              <Link 
                href="/feedback" 
                className="text-sm md:text-base text-gray-600 hover:text-gray-800 underline"
              >
                Suggest a source
              </Link>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

