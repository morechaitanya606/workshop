# Instructions for AI coding agents (Codex, Jules, Cursor, Claude Code, ...)

This repository is a live website (https://www.onlyworkshops.com). Follow
[RELEASE_WORKFLOW.md](RELEASE_WORKFLOW.md). The non-negotiable parts:

- **Work on the `developer` branch** (or a short-lived branch cut from it). Before editing,
  check the current branch; if it is `main`, `production` or `testing`, switch:
  `git switch developer && git pull`.
- **Never commit or push to `testing`, `production` or `main` directly.** Changes reach them
  only by pull request, one step at a time: `developer -> testing -> production -> main`.
  `main` is what Vercel serves to customers.
- Before proposing a promotion, run from `app/`: `npm run typecheck`, `npm run lint`,
  `npm test`, `npm run db:validate`. CI runs the same plus a production build.
- **Do not apply database migrations** (`supabase db push`) or change Supabase, Vercel or
  Razorpay settings unless the user asks in so many words: there is one live database and
  previews share it.
- Previews use live services (see "Careful: previews share live services" in
  RELEASE_WORKFLOW.md): never use real customers' data or complete real payments there.

Project layout: the Next.js app lives in `app/` (see `app/DEPLOYMENT.md`); Supabase
migrations and auth email templates are in `app/supabase/`.

Writing migrations: the RLS helpers live in the `private` schema (not exposed by the API), so
policies and functions must call `(select private.user_has_role('admin'))` and
`private.client_owned_by_current_user(client_id)`, never `public.` versions. Extensions
(`vector`, `pg_trgm`) live in `extensions`: a function using their types or operators needs
`set search_path = public, extensions`. Keep one permissive policy per table, role and action
(combine conditions with `or`) so the Supabase advisor stays clean.
