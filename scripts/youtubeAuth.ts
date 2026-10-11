/**
 * One-time YouTube sign-in for the weekly Short uploader.
 *
 *   npx tsx scripts/youtubeAuth.ts            # sign in, save token, set GitHub secrets
 *   npx tsx scripts/youtubeAuth.ts --no-gh    # skip the GitHub secrets
 *
 * Opens Google's consent page in the browser (loopback redirect, Desktop app
 * client), exchanges the code for a refresh token, prints which channel it
 * belongs to, writes YOUTUBE_REFRESH_TOKEN into .env.local in the file's own
 * encoding, and copies YOUTUBE_CLIENT_ID / _SECRET / _REFRESH_TOKEN into the
 * repo's Actions secrets via `gh secret set` (stdin, never on a command line).
 * No secret is printed.
 *
 * Needs YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET in .env.local, from the
 * "uploader" Desktop client in Google Cloud project wired-height-456014-u8.
 * The OAuth app must be "In production": in Testing, refresh tokens expire
 * after 7 days and the weekly upload silently stops.
 */
import http from 'http';
import { promises as fs } from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { google } from 'googleapis';
import { loadEnv, detectEnvEncoding, decodeEnvBuffer, encodeEnvContent } from '../lib/env';

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  // Needed to change a video's privacy after upload.
  'https://www.googleapis.com/auth/youtube',
];

function openBrowser(url: string) {
  const [cmd, args] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', `"${url}"`]]
    : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  spawn(cmd as string, args as string[], { stdio: 'ignore', detached: true, windowsVerbatimArguments: true }).unref();
}

/** Local loopback server that receives Google's redirect with the auth code. */
function startLoopback(): Promise<{ redirectUri: string; code: Promise<string>; server: http.Server }> {
  return new Promise(ready => {
    let gotCode: (c: string) => void, failed: (e: Error) => void;
    const code = new Promise<string>((res, rej) => { gotCode = res; failed = rej; });
    const server = http.createServer((req, res) => {
      const u = new URL(req.url ?? '/', 'http://127.0.0.1');
      const c = u.searchParams.get('code');
      const err = u.searchParams.get('error');
      if (!c && !err) { res.writeHead(404).end(); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(c ? '<h2>Signed in. You can close this tab and go back to the terminal.</h2>' : '<h2>Sign-in failed: ' + err + '</h2>');
      if (c) gotCode(c); else failed(new Error('Google returned: ' + err));
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number };
      ready({ redirectUri: 'http://127.0.0.1:' + port, code, server });
    });
  });
}

async function setEnvLocal(key: string, value: string) {
  const file = path.join(process.cwd(), '.env.local');
  const buf = await fs.readFile(file);
  const enc = detectEnvEncoding(buf);
  let text = decodeEnvBuffer(buf, enc);
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, 'm');
  text = re.test(text) ? text.replace(re, line) : `${text.replace(/\s*$/, '')}${eol}${line}${eol}`;
  await fs.writeFile(file, encodeEnvContent(text, enc));
}

function ghSecret(name: string, value: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn('gh', ['secret', 'set', name], { stdio: ['pipe', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', d => (err += d));
    p.on('close', c => (c === 0 ? resolve() : reject(new Error(`gh secret set ${name} failed: ${err.trim()}`))));
    p.stdin.end(value);
  });
}

async function main() {
  loadEnv();
  const clientId = process.env.YOUTUBE_CLIENT_ID?.trim();
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) throw new Error('YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET missing from .env.local');

  const { redirectUri, code: pending, server } = await startLoopback();
  const oauth = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  const url = oauth.generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: SCOPES });

  console.log('[youtube-auth] Opening Google sign-in in your browser. If it does not open, visit:\n' + url + '\n');
  console.log('[youtube-auth] Pick the Luxury Intel channel, then Advanced → Go to Luxury Intel Uploader (unsafe), tick both permissions, Continue.');
  openBrowser(url);

  const code = await pending;
  server.close();
  const { tokens } = await oauth.getToken(code);
  if (!tokens.refresh_token) throw new Error('No refresh token returned. Remove the app at myaccount.google.com/permissions and run again.');
  const granted = (tokens.scope ?? '').split(' ');
  const missing = SCOPES.filter(s => !granted.includes(s));
  if (missing.length) throw new Error(`Permission not granted: ${missing.join(', ')}. Run again and tick both boxes.`);

  oauth.setCredentials(tokens);
  const yt = google.youtube({ version: 'v3', auth: oauth });
  const me = await yt.channels.list({ part: ['snippet'], mine: true });
  const ch = me.data.items?.[0];
  console.log(`[youtube-auth] Signed in as channel: ${ch?.snippet?.title ?? '(none)'} ${ch?.snippet?.customUrl ?? ''} (id ${ch?.id ?? '?'})`);
  if (!ch) throw new Error('This Google account has no YouTube channel. Run again and choose the Luxury Intel channel.');

  await setEnvLocal('YOUTUBE_REFRESH_TOKEN', tokens.refresh_token);
  console.log('[youtube-auth] Saved YOUTUBE_REFRESH_TOKEN to .env.local');

  if (!process.argv.includes('--no-gh')) {
    await ghSecret('YOUTUBE_CLIENT_ID', clientId);
    await ghSecret('YOUTUBE_CLIENT_SECRET', clientSecret);
    await ghSecret('YOUTUBE_REFRESH_TOKEN', tokens.refresh_token);
    console.log('[youtube-auth] GitHub Actions secrets set: YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN');
  }
}

main().catch(err => { console.error(`[youtube-auth] ${err.message ?? err}`); process.exit(1); });
