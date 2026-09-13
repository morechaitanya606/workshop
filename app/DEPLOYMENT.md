# Deployment Checklist

## Before Vercel deploy

Run this from `app/`:

```bash
npm run preflight
```

That runs:

```bash
npm run typecheck
npm run lint
npm run build
```

## Serverless region

`vercel.json` pins `regions: ["sin1"]`. That must track the Supabase project's region: the
database is in `ap-northeast-1` (Tokyo), and `bom1` (Mumbai) added roughly 120 ms to every
query -- which checkout pays several times over, because it makes sequential round trips.
`sin1` is the closest Vercel region to Tokyo.

The better long-term fix is to move the database to `ap-south-1` and set this back to
`bom1`, putting both next to the users rather than next to each other.

This note lives here rather than in `vercel.json` because that file's schema declares
`additionalProperties: false`. A `_regionNote` key in it is not an inert comment -- Vercel
rejects the configuration and the deployment fails before it builds. JSON has no comments;
put the reasoning in Markdown.

## Required production environment variables

These must be set in Vercel before promoting live:

- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GROQ_API_KEY`
- `HUGGINGFACE_API_KEY`
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`

## Strongly recommended production environment variables

These are not hard-required for build success, but they matter for a stable live deployment:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `RESEND_API_KEY`
- `CAREERS_INBOX_EMAIL`
- `CRON_SECRET`

## Launch-critical routes to verify

After deployment, check these URLs in the Vercel preview or production domain:

- `/`
- `/explore`
- `/workshop/summer-family-retreat`
- `/robots.txt`
- `/sitemap.xml`
- `/chatbot/embed`

## Expected production behavior

- Public canonical URLs must use the live domain, never `localhost`
- `/workshop/summer-family-retreat` should use the dedicated OG image
- `/robots.txt` should disallow auth, booking, admin, dashboard, host, profile, and join utility routes
- `/sitemap.xml` should include `/workshop/summer-family-retreat`
- `/chatbot/embed` should stay embeddable
- Security headers should be present on normal pages

## Special event asset check

The retreat page now uses:

- `public/special-pages/summer-family-retreat/background.webp`
- `public/images/summer-family-retreat-og.jpg`

The original 57MB background PNG was removed and should not be restored.
