/**
 * Publish the week's vertical Short to YouTube (@luxury-intel) and record it
 * for the site.
 *
 *   npx tsx video-short/src/upload.ts [--week=2026-W42] [--private] [--force] [--no-email]
 *   npx tsx video-short/src/upload.ts --sync      # re-check videos not yet public
 *
 * Upload: the vertical MP4 from run.ts goes up as a Short (requested public;
 * YouTube forces it to private until the API project passes its audit). Then:
 *  - public/video/shorts/<week>.jpg: our own ~30 KB poster frame, so the site
 *    never loads anything from YouTube before the reader presses play;
 *  - data/weeks/<week>/video.json: id, title, story, and `public`, which the
 *    site requires before it shows the video (a private video won't embed);
 *  - an email to the owner (SEO_ALERT_EMAIL) with the link and status.
 * Idempotent: a week whose video.json already has a YouTube id is skipped
 * unless --force, so a re-run never uploads a duplicate.
 *
 * --sync: for every video.json with public=false, ask YouTube again and flip
 * it when the video has gone public (after the audit, or by hand in Studio).
 */
import { promises as fs, createReadStream } from 'fs';
import path from 'path';
import { google, type youtube_v3 } from 'googleapis';
import { loadEnv } from '../../lib/env';
import { weekLabelToSlug } from '../../lib/utils/weekSlug';
import { getEmailConfig, deliverEmail } from '../../seo/shared/email';
import { run } from './voice';

const SITE = 'https://luxury-intel.com';
const CHANNEL = 'https://www.youtube.com/@luxury-intel';

type VideoRecord = {
  week: string; youtubeId: string | null; title: string; durationS: number; poster: string;
  story: { title: string; url: string; source: string }; uploadedAt: string | null; public: boolean;
};

function youtube(): youtube_v3.Youtube {
  const { YOUTUBE_CLIENT_ID: id, YOUTUBE_CLIENT_SECRET: secret, YOUTUBE_REFRESH_TOKEN: token } = process.env;
  if (!id || !secret || !token) throw new Error('YOUTUBE_CLIENT_ID / _SECRET / _REFRESH_TOKEN missing. Run scripts/youtubeAuth.ts.');
  const auth = new google.auth.OAuth2(id, secret);
  auth.setCredentials({ refresh_token: token });
  return google.youtube({ version: 'v3', auth });
}

/**
 * Public = YouTube says so AND its public oEmbed endpoint serves the video
 * (it refuses private ones). The second check is what an anonymous embed sees.
 */
async function checkPublic(yt: youtube_v3.Youtube, id: string): Promise<{ public: boolean; status: string }> {
  const res = await yt.videos.list({ part: ['status'], id: [id] });
  const st = res.data.items?.[0]?.status;
  const status = st ? `${st.privacyStatus}/${st.uploadStatus}${st.rejectionReason ? `/${st.rejectionReason}` : ''}` : 'not found';
  if (st?.privacyStatus !== 'public') return { public: false, status };
  const o = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/shorts/${id}`)}`);
  return { public: o.ok, status: `${status}, oembed ${o.status}` };
}

async function latestWeek() {
  const files = (await fs.readdir(path.join('data', 'digests'))).filter(f => /^\d{4}-W\d{2}\.json$/.test(f)).sort();
  return files[files.length - 1].replace('.json', '');
}

async function readRecord(week: string): Promise<VideoRecord | null> {
  try { return JSON.parse(await fs.readFile(path.join('data', 'weeks', week, 'video.json'), 'utf8')); } catch { return null; }
}

async function writeRecord(r: VideoRecord) {
  await fs.writeFile(path.join('data', 'weeks', r.week, 'video.json'), JSON.stringify(r, null, 2) + '\n');
}

async function email(subject: string, lines: string[]) {
  if (process.argv.includes('--no-email')) return;
  const cfg = getEmailConfig();
  if (!cfg.ok) { console.log(`[upload] email skipped: ${cfg.message}`); return; }
  const text = lines.join('\n');
  const html = lines.map(l => `<p>${l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/(https:\/\/\S+)/g, '<a href="$1">$1</a>')}</p>`).join('');
  const r = await deliverEmail({ subject, text, html }, cfg.config);
  console.log(r.delivered ? `[upload] emailed owner (${r.id})` : `[upload] email failed: ${r.error}`);
}

async function sync(yt: youtube_v3.Youtube) {
  const weeks = (await fs.readdir(path.join('data', 'weeks'))).filter(w => /^\d{4}-W\d{2}$/.test(w)).sort();
  for (const week of weeks) {
    const r = await readRecord(week);
    if (!r?.youtubeId || r.public) continue;
    const c = await checkPublic(yt, r.youtubeId);
    console.log(`[sync] ${week} ${r.youtubeId}: ${c.status}`);
    if (c.public) { await writeRecord({ ...r, public: true }); console.log(`[sync] ${week} is now public; the site will show it`); }
  }
}

async function main() {
  loadEnv();
  const yt = youtube();
  if (process.argv.includes('--sync')) return sync(yt);

  const week = process.argv.find(a => a.startsWith('--week='))?.split('=')[1] ?? (await latestWeek());
  const existing = await readRecord(week);
  if (existing?.youtubeId && !process.argv.includes('--force')) {
    console.log(`[upload] ${week} already uploaded (${existing.youtubeId}); skipping. --force to upload again.`);
    return;
  }

  const dir = path.join('data', 'weeks', week, 'video-short');
  const meta = JSON.parse(await fs.readFile(path.join(dir, 'meta.json'), 'utf8'));
  const file = meta.outputs?.vertical?.file;
  if (!file) throw new Error(`[upload] ${week}: no vertical render in meta.json. Run run.ts --formats=vertical first.`);
  const timeline = JSON.parse(await fs.readFile(path.join(dir, 'timeline.json'), 'utf8'));

  // Poster: 1.5 s into the first story scene (scene 0 is the fixed intro card).
  const posterAt = (timeline.scenes[1]?.start ?? 2) + 1.5;
  const poster = `/video/shorts/${week}.jpg`;
  await fs.mkdir(path.join('public', 'video', 'shorts'), { recursive: true });
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-ss', posterAt.toFixed(2), '-i', file, '-frames:v', '1', '-vf', 'scale=540:-1', '-q:v', '5', path.join('public', poster)]);

  const digestUrl = `${SITE}/digest/${weekLabelToSlug(week)}`;
  const title = String(meta.title).slice(0, 100);
  const description = [
    `${title}`,
    '',
    `Our 60-second take on "${meta.story.title}" (${meta.story.source}):`,
    meta.story.url,
    '',
    `This week's full Luxury Intelligence digest: ${digestUrl}`,
    'Weekly intelligence on luxury, jewellery, ecommerce and AI.',
    '',
    '#Shorts #luxury #retail #ecommerce',
  ].join('\n');

  const privacyStatus = process.argv.includes('--private') ? 'private' : 'public';
  console.log(`[upload] ${week}: uploading ${file} as ${privacyStatus} (${meta.outputs.vertical.sizeMB} MB)`);
  const res = await yt.videos.insert({
    part: ['snippet', 'status'],
    notifySubscribers: true,
    requestBody: {
      snippet: {
        title, description, categoryId: '25', // News & Politics
        tags: ['luxury', 'retail', 'ecommerce', 'jewellery', 'AI', 'Luxury Intelligence'],
        defaultLanguage: 'en', defaultAudioLanguage: 'en',
      },
      // The voice is synthetic (TTS): YouTube asks for that to be disclosed.
      status: { privacyStatus, selfDeclaredMadeForKids: false, containsSyntheticMedia: true },
    },
    media: { body: createReadStream(file) },
  });
  const id = res.data.id;
  if (!id) throw new Error('[upload] YouTube returned no video id');
  console.log(`[upload] uploaded: https://www.youtube.com/shorts/${id}`);

  // Processing takes a moment; give "public" up to ~3 minutes to show.
  let check = await checkPublic(yt, id);
  for (let i = 0; i < 9 && !check.public && privacyStatus === 'public' && !check.status.startsWith('private'); i++) {
    await new Promise(r => setTimeout(r, 20_000));
    check = await checkPublic(yt, id);
  }
  console.log(`[upload] status: ${check.status} -> site ${check.public ? 'shows it' : 'keeps it hidden until public'}`);

  const record: VideoRecord = {
    week, youtubeId: id, title, durationS: Math.round(meta.durationS), poster,
    story: meta.story, uploadedAt: new Date().toISOString(), public: check.public,
  };
  await writeRecord(record);
  console.log(`[upload] wrote data/weeks/${week}/video.json and public${poster}`);

  await email(
    check.public ? `Weekly Short live: ${title}` : `Weekly Short uploaded (private): ${title}`,
    [
      `${week}: "${title}"`,
      `YouTube: https://www.youtube.com/shorts/${id}`,
      `Status: ${check.status}.`,
      check.public
        ? `It is public and will appear on ${digestUrl} after this deploy.`
        : `It is private, so the site keeps it hidden. Until YouTube approves the API audit this is expected. To publish by hand: YouTube Studio > Content > this video > Visibility > Public. The next weekly run (or the "Weekly Short" workflow with sync) then puts it on the site.`,
      `Story: ${meta.story.title} (${meta.story.source}) ${meta.story.url}`,
      `Logos shown: ${(meta.logosUsed ?? []).join(', ') || 'none'}`,
      `Channel: ${CHANNEL}`,
    ],
  );
}

main().catch(err => { console.error(err); process.exit(1); });
