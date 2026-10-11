/**
 * The weekly Short on the site (lib/video/weeklyShort.ts, video-short/README.md).
 *
 * The rule that matters: production never shows a Short that isn't public on
 * YouTube. Uploads are private until the API audit passes, and a private video
 * in the embed is a broken black box on the homepage.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { isShowable, type WeeklyShort } from '../lib/video/weeklyShort';
import { buildVideoObjectLd } from '../lib/seo/jsonLd';

const base: WeeklyShort = {
  week: '2026-W42', youtubeId: 'abc123DEF45', title: 'T', durationS: 52, poster: '/video/shorts/2026-W42.jpg',
  story: { title: 'S', url: 'https://example.com/s', source: 'Src' }, uploadedAt: '2026-10-19T07:00:00Z', public: true,
};

test('production shows a Short only when it has an id and is public', () => {
  assert.equal(isShowable(base, 'production'), true);
  assert.equal(isShowable({ ...base, public: false }, 'production'), false);
  assert.equal(isShowable({ ...base, youtubeId: null }, 'production'), false);
});

test('dev shows any record, so layouts can be mocked', () => {
  assert.equal(isShowable({ ...base, public: false, youtubeId: null }, 'development'), true);
});

test('VideoObject has what Google needs for video results', () => {
  const ld = buildVideoObjectLd({
    siteUrl: 'https://luxury-intel.com', pageUrl: 'https://luxury-intel.com/digest/x', youtubeId: 'abc123DEF45',
    name: 'T', description: 'D', posterPath: '/video/shorts/2026-W42.jpg', durationSeconds: 52, uploadedAtISO: base.uploadedAt!,
  });
  assert.equal(ld['@type'], 'VideoObject');
  assert.equal(ld.thumbnailUrl, 'https://luxury-intel.com/video/shorts/2026-W42.jpg');
  assert.equal(ld.uploadDate, '2026-10-19T07:00:00Z');
  assert.equal(ld.duration, 'PT0M52S');
  assert.equal(ld.embedUrl, 'https://www.youtube-nocookie.com/embed/abc123DEF45');
});
