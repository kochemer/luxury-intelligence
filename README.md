# AK-Website-v1

First repository for the AK website

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## How to refresh the weekly digest (manual)

1. **Run ingestion**
    ```bash
    npm run ingest
    ```
2. **Build weekly digest**
    ```bash
    npx tsx scripts/buildWeeklyDigest.ts
    ```
3. **Commit & push**
    ```bash
    git add .
    git commit -m "Update articles and weekly digest"
    git push
    ```
4. **Vercel deploys automatically**

## Learn More

To learn more about Next.js, take a look at:

- [Next.js Documentation](https://nextjs.org/docs)
- [Learn Next.js](https://nextjs.org/learn)

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use [Vercel](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme).

See [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
