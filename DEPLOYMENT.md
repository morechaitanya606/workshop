## Deployment checklist (Supabase + Vercel)

### 0) Set the Vercel Root Directory
This repository deploys from `app/`, not from the repository root.

In Vercel Project Settings -> Build and Deployment:
- Set **Root Directory** to `app`
- Redeploy after saving the setting

The cron config lives in `app/vercel.json` so Vercel validates it against the Next.js app that actually defines `/api/cron/emails`.

### 1) Rotate secrets (recommended)
You already pasted real keys in chat. Rotate at least:
- `SUPABASE_SERVICE_ROLE_KEY`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`

### 2) Apply Supabase migrations to your Supabase project
This repo ships SQL migrations in `app/supabase/migrations/`.

#### Option A (recommended): Supabase CLI
1. Install Supabase CLI: `supabase --version` (install if missing)
2. From the repo root, run:

```bash
cd app
supabase link --project-ref <YOUR_PROJECT_REF>
supabase db push
```

Notes:
- If `supabase db push` can’t detect the folder, run it from `app/` (migrations are under `app/supabase/migrations`).

#### Option B: Dashboard SQL Editor
Apply migrations in timestamp order (oldest → newest) by pasting each file from:
- `app/supabase/migrations/*.sql`

### 3) Create Supabase Storage bucket `uploads`
In Supabase Dashboard:
- **Storage → Buckets → New bucket**
  - Name: `uploads`
  - Public: choose one:
    - **Public bucket**: simplest. Upload API returns `url`.
    - **Private bucket**: safer for user media. Upload API returns `signedUrl` (10 min TTL).

### 4) Configure Vercel environment variables
In Vercel Project Settings → Environment Variables, set:

#### Required (app)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL` (your production URL)

#### Payments (required for checkout)
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`

#### Email (required if you want reminders/feedback emails)
- `RESEND_API_KEY`
- `CRON_SECRET` (random long value)

### 5) Schedule cron (Vercel Cron)
This repo includes `app/vercel.json` which schedules:
- `GET /api/cron/emails` every hour (`0 * * * *`)

To authorize the cron, the endpoint expects:
- Header `Authorization: Bearer ${CRON_SECRET}`

In Vercel Cron Jobs, set the request header accordingly (or ensure the Vercel cron feature injects it).

### 6) Uploads behavior (public vs private)
`POST /api/upload` accepts multipart form-data:
- `file`: File
- `bucket` (optional): defaults to `uploads`
- `access` (optional):
  - `public` (default): returns `url` for public buckets
  - `private` or `signed`: returns `signedUrl` (10 minute TTL)

