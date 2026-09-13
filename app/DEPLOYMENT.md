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

**Currently NOT pinned.** `regions` and per-function `maxDuration`/`memory` are paid-plan
features on Vercel. They were added to `vercel.json` on a branch and every deployment carrying
them failed, so the file is back to the configuration that deploys. Re-add them only after
confirming the plan allows it, and watch the first deployment:

```json
"regions": ["sin1"],
"functions": {
    "src/app/api/cron/emails/route.ts": { "maxDuration": 300 },
    "src/app/api/upload/route.ts": { "maxDuration": 60, "memory": 2048 },
    "src/app/api/bookings/checkout/route.ts": { "maxDuration": 30 },
    "src/app/api/payments/razorpay/webhook/route.ts": { "maxDuration": 30 },
    "src/app/api/chat/route.ts": { "maxDuration": 30 },
    "src/app/api/image-proxy/route.ts": { "maxDuration": 20, "memory": 1024 }
}
```

Without them the cron runs under the default function timeout, so if the reminder job starts
timing out that is the first thing to restore.

A note like this one cannot live in `vercel.json`: its schema declares
`additionalProperties: false`, so an extra key is not an inert comment -- Vercel rejects the
configuration and the deployment fails before it builds. `npm run vercel:validate` checks for
that. JSON has no comments; the reasoning goes in Markdown.

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
