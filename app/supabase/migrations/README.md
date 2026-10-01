# Applying migrations

## Before you push anything

```bash
cd app
npm run db:validate
```

Parses every migration with Postgres's own grammar, including plpgsql function bodies. It
needs no database and runs in CI. Syntax only — it cannot tell you whether a unique index
will find duplicates in real data.

## The one rule

**Never apply SQL to the hosted database by hand.** Every change goes in a file here and is
applied with `db push`. The dashboard SQL editor does not write to
`supabase_migrations.schema_migrations`, so a change made there is invisible to the CLI --
and once local and remote disagree, `db push` refuses to run at all, which pushes the next
person back to the SQL editor. That loop is how this project ended up with 30 unrecorded
versions and 9 migrations applied but never recorded (reconciled 2026-09-13).

Filenames are `<14-digit timestamp>_<name>.sql`. The CLI treats the digits before the first
underscore as the version, so an 8-digit `20260306_x.sql` declares version `20260306`, which
can never match a remote row recorded as `20260306185054`. `supabase migration new <name>`
generates a correct one.

## Applying to the hosted project

```bash
cd app
npx supabase login                        # opens a browser; stores a personal access token
npx supabase link --project-ref <ref>     # <ref> is the subdomain of NEXT_PUBLIC_SUPABASE_URL
npm run db:push                           # prompts for the database password
```

`link` writes `supabase/.temp/`, which is gitignored — each person links their own machine.
The service-role key is **not** enough for this: it authenticates against PostgREST, and
`create index` / `create function` / `lock table` are DDL that need a real Postgres connection.

Dry run first, always:

```bash
npx supabase db push --dry-run
```

## 20260912180000_payment_and_hold_uniqueness.sql

Two things about this one are not optional.

**Apply it BEFORE deploying the application change that ships with it.** The hold route no
longer releases the caller's superseded hold; `create_booking_hold` does. An app deployed
against the old function releases nothing, so a user who goes back and retries is blocked by
their own stale hold until it expires — fifteen minutes of being unable to book.

**Apply it during low traffic.** It collapses duplicate active holds down to the newest per
(user, workshop). A hold released while its owner is on the Razorpay screen becomes
`HOLD_NOT_ACTIVE` at confirmation, which the checkout route answers by refunding them
automatically. The money goes back and nothing is lost, but the booking does not happen and
the customer has to start again. Holds live fifteen minutes, so a quiet window is a short one.

It also takes `share row exclusive` on `bookings` and `booking_holds` for the length of the
transaction. Reads are unaffected; writes to those two tables block until it finishes. That is
deliberate — it is what stops a request served by the old code from inserting a conflicting row
between the dedup and the index build.

It will refuse to run if `bookings` already contains two rows sharing a `payment_intent_id`,
and name them. That means one payment produced two bookings, which needs a person to reconcile
before any unique index can exist.

## 202610011001xx\_\* schema/RLS hardening series

Apply in filename order (`db push` does). Each file is idempotent and independent of the
others except where noted. Dry run first.

| File                                                | What it does                                                                                                                                                              | Data-dependent risk                                                                                                                                                                |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `...100100_coupon_integrity`                        | `coupons.applicable_workshop_ids` uuid[] to text[]; discount CHECKs; unique redemption per booking                                                                        | Deletes duplicate `coupon_redemptions` per booking (keeps earliest). CHECKs are skipped with a WARNING if bad rows exist.                                                          |
| `...100200_feedback_moderation_rls`                 | Reviews: select published/own/admin only, no user write policy, moderation-reset trigger, stats count published only                                                      | None. Needs the app change in the feedback upsert (see migration header).                                                                                                          |
| `...100300_workshop_host_guard_and_host_id`         | Host write guard trigger on `workshops`; `host_id` derivation trigger + backfill                                                                                          | Touches `updated_at` of backfilled workshops. Does not backfill `host_earnings`.                                                                                                   |
| `...100400_uploads_bucket_lockdown`                 | `uploads` bucket size/MIME limits; drops user write + anon list policies                                                                                                  | Existing objects are not re-checked.                                                                                                                                               |
| `...100500_intake_tables_lockdown`                  | Waitlist/support direct inserts dropped; profile insert pinned to role user; community host contact columns hidden from API roles; unique waitlist/join-request per email | Deletes duplicate `waitlists` and `community_join_requests` rows (keeps most-progressed, then oldest). `waitlists.workshop_id` NOT NULL skipped with a WARNING if NULL rows exist. |
| `...100600_financial_fk_delete_rules`               | Coupon FKs SET NULL; `bookings.user_id` SET NULL + nullable; earnings/payout FKs RESTRICT                                                                                 | Re-adds FKs (brief SHARE ROW EXCLUSIVE locks).                                                                                                                                     |
| `...100700_email_log_indexes_and_redundant_indexes` | Email log indexes, one `sent` row per (template, reference), drops redundant indexes                                                                                      | Relabels duplicate `sent` rows as `failed` (no deletes).                                                                                                                           |
| `...100800_webhook_events_purge`                    | `purge_old_webhook_events()` (service role only)                                                                                                                          | None until the function is called.                                                                                                                                                 |
| `...100900_drop_unused_seat_and_coupon_functions`   | Drops `decrement_seats`, `increment_coupon_usage`                                                                                                                         | None (no callers).                                                                                                                                                                 |

Apply this series BEFORE `202610011101xx` and later: `...100100` changes the column type that
`confirm_booking_from_hold` reads, and the later `create or replace` of that function clears any
backend's cached plan for the old type.

## Migrations are NOT wrapped in a transaction

Supabase applies each statement of a migration on its own. There is no implicit transaction
around the file, so:

- `lock table` at file scope fails with
  `ERROR: LOCK TABLE can only be used in transaction blocks (SQLSTATE 25P01)`. Put it in a
  `do $ ... $` block together with everything it protects -- a DO body always runs inside a
  transaction, and the lock is released when that body ends.
- A migration that fails halfway leaves the statements before it applied. Prefer idempotent
  statements (`if not exists`, `create or replace`) so a re-run after a fix is safe.

This is easy to get wrong because `supabase db query --file` DOES run the whole file in one
implicit transaction, so a migration can pass there and still fail under `db push`. The
preview-branch check in CI replays every migration from scratch and is the thing that catches
it.

## Verifying afterwards

```sql
-- both indexes present
select indexname from pg_indexes
where tablename in ('bookings', 'booking_holds')
  and indexname in (
    'idx_bookings_payment_intent_id_unique',
    'idx_booking_holds_one_active_per_user_workshop'
  );

-- no user holds the same workshop twice
select user_id, workshop_id, count(*)
from booking_holds where status = 'active'
group by 1, 2 having count(*) > 1;

-- the function releases before it locks the workshop (lock-order check)
select position('set status = ''released''' in prosrc)
     < position('for update' in prosrc) as releases_before_workshop_lock
from pg_proc where proname = 'create_booking_hold';
```

The last one matters: `confirm_booking_from_hold` takes its hold row `for update` and only
then locks the workshop. If `create_booking_hold` ever takes them the other way round, a
confirm and a concurrent hold for the same workshop deadlock — and a deadlock during confirm
lands after the card has been captured.
