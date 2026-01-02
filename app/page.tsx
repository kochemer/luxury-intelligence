import { promises as fs } from 'fs';
import path from 'path';
import { DateTime } from 'luxon';
import Link from 'next/link';
import Image from 'next/image';
import BuildDigestButton from './components/BuildDigestButton';
import { getTopicDisplayName, TopicKey } from '../utils/topicNames';

type Article = {
  id: string;
  title: string;
  url: string;
  source: string;
  published_at: string;
  ingested_at: string;
  aiSummary?: string | null;
};

type WeeklyDigest = {
  weekLabel: string;
  tz: string;
  startISO: string;
  endISO: string;
  builtAtISO?: string;
  builtAtLocal?: string;
  totals: {
    total: number;
    byTopic: {
      AIStrategy: number;
      EcommerceRetail: number;
      LuxuryConsumer: number;
      Jewellery: number;
    };
  };
  topics: {
    AI_and_Strategy: { total: number; top: Article[] };
    Ecommerce_Retail_Tech: { total: number; top: Article[] };
    Luxury_and_Consumer: { total: number; top: Article[] };
    Jewellery_Industry: { total: number; top: Article[] };
  };
};

function getCurrentWeek(): string {
  const now = DateTime.now().setZone('Europe/Copenhagen');
  const year = now.year;
  const weekNumber = now.weekNumber;
  return `${year}-W${weekNumber.toString().padStart(2, '0')}`;
}

function formatDate(isoString: string): string {
  return DateTime.fromISO(isoString).toFormat('yyyy-MM-dd');
}

async function loadDigest(weekLabel: string): Promise<WeeklyDigest | null> {
  try {
    const digestPath = path.join(process.cwd(), 'data', 'digests', `${weekLabel}.json`);
    const raw = await fs.readFile(digestPath, 'utf-8');
    return JSON.parse(raw) as WeeklyDigest;
  } catch (err) {
    console.error(`Failed to load digest for ${weekLabel}:`, err);
    return null;
  }
}

// Category UI meta data (title, short desc, topicKey, N)
const CATEGORY_CARDS: Array<{
  key: TopicKey;
  color: string;
  title: string;
  desc: string;
  countBy: string;
  topInfo: string;
}> = [
  {
    key: 'AI_and_Strategy',
    color: '#25505f',
    title: 'AI & Strategy',
    desc: 'The latest advances and strategies in artificial intelligence and business transformation.',
    countBy: 'AIStrategy',
    topInfo: 'Top 7 articles by relevance',
  },
  {
    key: 'Ecommerce_Retail_Tech',
    color: '#264653',
    title: 'Ecommerce & Retail Tech',
    desc: 'Breakthroughs and trends shaping online commerce, retail, and emerging tech.',
    countBy: 'EcommerceRetail',
    topInfo: 'Top 7 articles by recency',
  },
  {
    key: 'Luxury_and_Consumer',
    color: '#6b2d5c',
    title: 'Luxury & Consumer',
    desc: 'Innovations and changes in luxury and wider consumer products, experiences, and brands.',
    countBy: 'LuxuryConsumer',
    topInfo: 'Top 7 articles by recency',
  },
  {
    key: 'Jewellery_Industry',
    color: '#be8b36',
    title: 'Jewellery Industry',
    desc: 'Key updates and stories across jewellery brands, trade, and supply chain.',
    countBy: 'Jewellery',
    topInfo: 'Top 7 articles by recency',
  },
];

function ArticleCard({ article }: { article: Article }) {
  return (
    <a
      href={article.url}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'block',
        borderRadius: 8,
        border: '1px solid #eee',
        padding: '1rem',
        background: 'white',
        boxShadow: '0 2px 8px 0 rgba(31,41,55,.06)',
        textDecoration: 'none',
        marginBottom: '1.5rem',
        transition: 'box-shadow 0.14s',
        color: 'inherit',
      }}
    >
      <div style={{ marginBottom: '0.45rem', fontWeight: 600, fontSize: '1.08rem', color: '#003d7a', lineHeight: 1.35 }}>
        {article.title}
      </div>
      <div style={{ fontSize: '0.92rem', color: '#666', marginBottom: '0.25rem', display: 'flex', gap: 8 }}>
        <span>{article.source}</span>
        <span style={{ fontWeight: 300, color: '#abb' }}>•</span>
        <span>{formatDate(article.published_at)}</span>
      </div>
      {article.aiSummary && (
        <div style={{
          fontSize: '0.97rem',
          color: '#31353c',
          background: '#f4f7fa',
          borderLeft: '4px solid #3a7b9c',
          borderRadius: 4,
          padding: '0.65rem 1rem 0.65rem 0.75rem',
          marginTop: 8,
          fontStyle: 'italic',
        }}>
          {article.aiSummary
              ?.replace(/^AI-Generated Summary:\s*/i, '')
              .replace(/^AI-generated summary:\s*/i, '')
              .slice(0, 320)}
          {article.aiSummary && article.aiSummary.length > 320 ? '…' : ''}
        </div>
      )}
    </a>
  );
}

export default async function Home() {
  const weekLabel = getCurrentWeek();
  const digest = await loadDigest(weekLabel);

  // HERO section (always present)
  return (
    <main style={{
      maxWidth: '100vw',
      minHeight: '100vh',
      fontFamily: 'system-ui, Arial, sans-serif',
      background: '#f7f9fb',
      margin: 0,
      padding: 0,
    }}>
      {/* HERO */}
      <section style={{
        position: 'relative',
        width: '100%',
        minHeight: 360,
        background: 'linear-gradient(120deg,#2e3741 40%, #637b8b 100%)',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
        borderBottom: '8px solid #eaeaea'
      }}>
        <div style={{
          position: 'absolute',
          zIndex: 0,
          top: 0, left: 0, width: '100%', height: '100%',
        }}>
            <Image
              src="/hero-digest.jpg"
              alt="Weekly Digest Hero"
              priority
              fill
              style={{ objectFit: 'cover', objectPosition: 'center center', filter: 'brightness(0.62) blur(0.2px)' }}
            />
        </div>
        <div style={{
          position: 'relative',
          zIndex: 2,
          color: '#fff',
          width: '100%',
          maxWidth: 900,
          margin: '0 auto',
          padding: '3.8rem 1.5rem 3.5rem 1.5rem',
          textAlign: 'center',
        }}>
          <h1 style={{
            fontSize: '2.7rem',
            fontWeight: 700,
            marginBottom: '1.15rem',
            textShadow: '0 2px 8px rgba(18,30,49,0.20)'
          }}>
            AI Weekly Digest: <span style={{ color: '#fed236'}}>The Week in 4 Key Sectors</span>
          </h1>
          <div style={{
            fontSize: '1.23rem',
            fontWeight: 400,
            color: '#e2ecfa',
            lineHeight: 1.7,
            maxWidth: 600,
            margin: '0 auto'
          }}>
            Essential <span style={{ fontWeight: 600, color: '#fff' }}>AI and industry news</span> handpicked across strategy, ecommerce, luxury, and jewellery.<br/>
            Save hours weekly – get expert-curated coverage, <span style={{ color: '#fed236' }}>AI summaries</span>, and direct source links.
          </div>
          <div style={{marginTop: '1.7rem', display: 'flex', justifyContent: 'center', gap: 14, flexWrap: 'wrap'}}>
            <Link href="/archive" style={{
              fontWeight: 500,
              color: '#06244c',
              background: '#fed236',
              borderRadius: 3,
              padding: '0.65rem 1.6rem',
              textDecoration: 'none',
              transition: 'background 0.19s, color 0.16s',
              fontSize: '1.12rem',
              boxShadow: '0 1px 2px rgba(0,0,0,0.07)'
            }}>Browse Archive</Link>
            <Link href="/about" style={{
              fontWeight: 500,
              color: '#fff',
              background: 'rgba(255,255,255,0.15)',
              borderRadius: 3,
              padding: '0.65rem 1.6rem',
              textDecoration: 'none',
              transition: 'background 0.19s, color 0.16s',
              fontSize: '1.12rem',
              border: '1px solid rgba(255,255,255,0.3)'
            }}>About</Link>
            <Link href="/support" style={{
              fontWeight: 500,
              color: '#fff',
              background: 'rgba(255,255,255,0.15)',
              borderRadius: 3,
              padding: '0.65rem 1.6rem',
              textDecoration: 'none',
              transition: 'background 0.19s, color 0.16s',
              fontSize: '1.12rem',
              border: '1px solid rgba(255,255,255,0.3)'
            }}>Support</Link>
            <BuildDigestButton />
          </div>
        </div>
      </section>

      {/* If digest missing, show clear notice */}
      {!digest ? (
        <section style={{
          maxWidth: 520,
          margin: '3.5rem auto 0 auto',
          padding: '2.5rem 1.5rem',
          background: '#fff1e2',
          borderRadius: 10,
          border: '1.5px dashed #ffdfa9',
          fontSize: '1.1rem',
          color: '#913d00',
          textAlign: 'center',
          boxShadow: '0 2px 12px 0 rgba(200,170,100,0.04)'
        }}>
          <h2 style={{margin: '0 0 1rem 0', fontSize: '1.6rem', fontWeight: 600}}>Digest not built yet</h2>
          <p style={{marginBottom:'1.1rem'}}>No latest digest found for this week.</p>
          <div style={{marginBottom:'1.5rem'}}>
            <span style={{
              background: '#fff4ca',
              color: '#905e19',
              fontFamily: 'monospace',
              padding: '0.28rem 0.46rem',
              borderRadius: '4px',
              fontSize: '1.04rem',
              display:'inline-block'
            }}>npx tsx scripts/buildWeeklyDigest.ts</span>
          </div>
          <BuildDigestButton />
        </section>
      ) : (
      <>
        {/* Weekly Digest Summary / Meta */}
        <section style={{
          background: '#fff',
          borderRadius: 12,
          boxShadow: '0 2px 24px 0 rgba(28,68,90,.06)',
          margin: '-64px auto 0 auto',
          maxWidth: 1050,
          padding: '2.6rem 2rem 1.0rem 2rem',
          position: 'relative'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            marginBottom: 18,
            flexWrap: 'wrap'
          }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '2.0rem', color: '#143c42', marginBottom: 6 }}>
                Week {digest.weekLabel}
              </div>
              <div style={{color:'#788189', fontSize:'1.05rem'}}>
                <span>
                  {formatDate(digest.startISO)} to {formatDate(digest.endISO)} ({digest.tz})
                </span>
              </div>
              {digest.builtAtLocal && (
                <div style={{
                  fontSize: '0.93rem',
                  color: '#b4b9be',
                  marginTop: 2
                }}>
                  Built: {digest.builtAtLocal}
                </div>
              )}
            </div>
            <div style={{
              textAlign: 'right',
              minWidth: 180,
              fontSize: '1.08rem'
            }}>
              <div style={{
                color: '#636a7b',
                marginBottom: 6,
                fontWeight: 400,
              }}>
                Digest total
              </div>
              <div style={{
                fontWeight: 700,
                fontSize: '2.1rem',
                color: '#20678c',
                letterSpacing: '.02em'
              }}>{digest.totals.total}</div>
            </div>
          </div>
        </section>

        {/* CATEGORY CARDS UI */}
        <section style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '2.7rem',
          maxWidth: 1060,
          margin: '3.2rem auto 0 auto',
          alignItems: 'start'
        }}>
          {CATEGORY_CARDS.map(cat => {
            // @ts-ignore
            const topic = digest.topics[cat.key];
            // @ts-ignore
            const totalCat = digest.totals.byTopic[cat.countBy] ?? 0;
            return (
              <div key={cat.key}
                style={{
                  background: '#fff',
                  borderRadius: 13,
                  boxShadow: '0 2px 16px 0 rgba(53,80,130,0.06)',
                  border: `1.7px solid #e7ecf0`,
                  minHeight: 380,
                  padding: '2.2rem 1.7rem 2.1rem 1.7rem',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'flex-start',
                  position: 'relative'
                }}
              >
                <div style={{
                  fontSize: '1.06rem',
                  color: '#687787',
                  fontWeight: 500,
                  marginBottom: 6,
                  letterSpacing: '.01em',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8
                }}>
                  <span style={{
                    display: 'inline-block',
                    width: 13,
                    height: 13,
                    borderRadius: 7,
                    background: cat.color,
                    marginTop: 1
                  }}></span>
                  {cat.title}
                </div>
                <div style={{fontSize: '1.19rem', color: '#233442', fontWeight: 600, marginBottom: 5}}>
                  {getTopicDisplayName(cat.key)}
                </div>
                <div style={{
                  fontSize: '1.02rem',
                  color: '#5c6880',
                  marginBottom: 17
                }}>
                  {cat.desc}
                </div>
                <div style={{
                  marginBottom: 16,
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 13
                }}>
                  <span style={{
                    fontWeight: 600,
                    fontSize: '1.5rem',
                    color: cat.color,
                    letterSpacing: '.01em'
                  }}>
                    {totalCat}
                  </span>
                  <span style={{
                    fontSize: '1rem',
                    color: '#8a99ac',
                    fontWeight: 400,
                  }}>
                    articles this week • {cat.topInfo}
                  </span>
                </div>
                <div>
                  {topic?.top && topic.top.length > 0 ? (
                    <div>
                      {topic.top.slice(0,7).map(article =>
                        <ArticleCard article={article} key={article.id} />
                      )}
                    </div>
                  ) : (
                    <div style={{
                      background: '#f9fafb',
                      borderRadius: 6,
                      border: '1px dashed #d6dfec',
                      color: '#a6acbe',
                      padding: '2.2rem 1.1rem',
                      textAlign: 'center',
                      margin: '1rem auto 0 auto',
                      fontSize: '1.06rem',
                    }}>
                      <div style={{fontWeight:600, fontSize:'1.16rem', color: '#b2b8ca',marginBottom:8}}>No articles this week</div>
                      <div style={{color:'#bfcada'}}>
                        We'll be back with relevant updates and expert news soon.
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </section>
      </>
      )}
    </main>
  );
}
