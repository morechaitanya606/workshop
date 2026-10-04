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
