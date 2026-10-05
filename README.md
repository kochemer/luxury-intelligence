# Luxury Intelligence

Source for [luxury-intel.com](https://luxury-intel.com): a weekly digest of
luxury, jewellery, e-commerce and retail-tech news, with an email, a podcast
and market pages. Next.js 16 on Vercel; the weekly content is built by a
GitHub Actions pipeline every Sunday.

```bash
npm install
npm run dev        # http://localhost:3000
npm test
```

Secrets live in `.env.local` (not committed). Run `npm run digest:preflight`
to see which ones the pipeline needs.

## Where to read next

- **[`CLAUDE.md`](CLAUDE.md)**: commands, architecture and the rules that are
  easy to break. Written for AI agents, and the best overview for humans too.
- **[`docs/README.md`](docs/README.md)**: map of every doc and the rules for
  keeping them current.
- **[`docs/operations.md`](docs/operations.md)**: deploying, CI, re-running a week.

FFmpeg is needed for the podcast and video steps (`winget install Gyan.FFmpeg`
on Windows, `apt-get install ffmpeg` in CI).
