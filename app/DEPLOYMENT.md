# Deployment Checklist

## Release flow

`developer` → `testing` → `production` → `main`. Vercel deploys `main` to
www.onlyworkshops.com; every other branch gets a preview. Changes move up one step at a time
by pull request; see [RELEASE_WORKFLOW.md](../RELEASE_WORKFLOW.md).

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
- `MAILJET_API_KEY` and `MAILJET_SECRET_KEY` (primary mail provider; validate the sending domain
  in Mailjet first -- SPF and DKIM -- or sends are rejected)
- `RESEND_API_KEY` (optional fallback, used automatically if Mailjet is rate-limited or down;
  at least one of the two providers is required in production)
- `EMAIL_PROVIDER` (`mailjet` or `resend`; optional, picks which one is tried first)
- `EMAIL_FROM` (optional; defaults to `Only Workshops <reachout@onlyworkshops.com>`, which must be a validated sender in Mailjet)
- `CAREERS_INBOX_EMAIL`
- `CRON_SECRET`
- `NEXT_PUBLIC_MEDIA_BASE_URL` (optional; leave unset. The hero videos are committed under
  `public/videos` and served from Vercel's CDN. Set it only to move them to a Cloudflare R2
  public bucket -- see `public/videos/README.md`)
- `NEXT_PUBLIC_GA_MEASUREMENT_ID` (optional; Google Analytics 4, see below)

## Google Analytics 4 (optional)

Nothing is sent to Google until `NEXT_PUBLIC_GA_MEASUREMENT_ID` is set. Do steps 2-4 before
step 5:

1. In Google Analytics, create a GA4 property with a web data stream for
   `https://www.onlyworkshops.com` and copy its measurement id (`G-` followed by capitals and
   digits). A `UA-` or `GTM-` id is a different product: it fails the build, or, where
   `SKIP_ENV_VALIDATION` is set, simply leaves analytics off.
2. In that data stream, open Enhanced measurement > Page views > advanced settings and turn off
   "Page changes based on browser history events". The site sends its own page views, without
   query strings; left on, GA4 counts every client-side navigation a second time, with the full
   address.
3. In that data stream, open "Redact data", turn on URL query parameter redaction and list
   `workshop, guests, hold, holdExpiresAt, coupon, redirect, next, code, error, notice`. Page
   views already leave query strings out; this catches GA4's other automatic events (scrolls,
   outbound clicks and so on) in case one reads the address bar itself. Booking, login and
   OAuth URLs carry these parameters, and PostHog strips them too (`src/lib/analytics.ts`).
4. Add Google Analytics to the privacy policy: the cookie banner already says analytics only
   runs if the visitor accepts.
5. In Vercel > Settings > Environment Variables, add the id for **Production** only, so preview
   visits are not counted, and redeploy (`NEXT_PUBLIC_` values are inlined at build time).

How it behaves: the root layout loads a small loader with `next/script` `lazyOnload`, which
runs in idle time after the page has loaded, so it does not delay the main image or the first
taps. gtag.js is fetched only for visitors who accepted cookies (or when they accept); declining
switches it off. Ad storage and ad personalisation are always denied. The loader sends one
`page_view` per path, on load and on each client-side navigation, with `page_location` and
`page_referrer` cut to origin + path (the same rule as PostHog), and sets that bare address for
GA4's later events. A change of query string alone (Explore filters) is not a new page view.

## Media

- The four hero renditions are committed in `public/videos` and deploy with the site; no
  upload step. After re-encoding one, replace the file there (a new cut should get a new file
  name, since browsers cache the old one).
- Convert any new JPG/PNG/HEIC under `public/` with `node scripts/convert-images-to-webp.mjs`
  (`--dry-run` to preview). User uploads are converted to WebP by `/api/upload` automatically.

## Auth emails

Confirm-signup, reset-password and the other auth emails are sent by Supabase, which needs
custom SMTP, the redirect allow-list and the templates set in its dashboard. Email
confirmation is on, so without working SMTP new users cannot log in. The full checklist is in
`supabase/templates/README.md`; every email link lands on `/auth/confirm`.

## Launch-critical routes to verify

After deployment, check these URLs in the Vercel preview or production domain:

- `/`
- `/explore`
- `/workshop/summer-family-retreat`
- `/robots.txt`
- `/sitemap.xml`
- `/llms.txt`
- `/chatbot/embed`

## Expected production behavior

- Public canonical URLs must use the live domain, never `localhost`
- `/workshop/summer-family-retreat` should use the dedicated OG image
- `/robots.txt` should disallow auth, booking, admin, dashboard, host, profile, and join utility routes
- `/sitemap.xml` should include `/workshop/summer-family-retreat`
- `/llms.txt` should list the key pages, the indexable Pune activity pages and the upcoming
  workshops with absolute live-domain URLs (it is regenerated in the background, like the Pune
  hub, so new workshops show up without a deploy)
- `/chatbot/embed` should stay embeddable
- Security headers should be present on normal pages, and no `X-Powered-By` header
- Files under `/images`, `/videos`, `/uploads` and `/special-pages` should be served with
  `Cache-Control: public, max-age=86400, stale-while-revalidate=604800`

## Special event asset check

The retreat page now uses:

- `public/special-pages/summer-family-retreat/background.webp`
- `public/images/summer-family-retreat-og.jpg`

The original 57MB background PNG was removed and should not be restored.
