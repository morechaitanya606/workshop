# Launch Setup Checklist

## 1. Environment Variables (`app/.env.local`)

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...

# For local test checkout without card UI
STRIPE_AUTOCONFIRM_TEST=true
# Optional override
# STRIPE_TEST_PAYMENT_METHOD=pm_card_visa
```

## 2. Apply Supabase SQL Migration

Run this in the Supabase SQL editor:

- `app/supabase/migrations/20260306_launch_hardening.sql`

This creates:

- `profiles` with `role` (`user` or `admin`)
- `workshops`
- `booking_holds`
- `bookings`
- functions:
  - `create_booking_hold(...)`
  - `confirm_booking_from_hold(...)`

## 3. Grant Admin Access

After a user signs up, set that user as admin:

```sql
update public.profiles
set role = 'admin'
where id = 'USER_UUID_HERE';
```

## 4. Stripe Webhook

Create webhook endpoint:

- `POST https://<your-domain>/api/payments/stripe/webhook`

Events:

- `payment_intent.succeeded`
- `payment_intent.payment_failed`

## 5. Run Checks

```bash
npm run lint
npx tsc --noEmit --pretty false
npm run build
```
