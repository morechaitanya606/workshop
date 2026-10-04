# Claude Code instructions

This site is live. Branch flow: `developer -> testing -> production -> main` (main = live,
deployed by Vercel). Full rules: @RELEASE_WORKFLOW.md

- Code only on `developer`. If the current branch is `main`, `production` or `testing`, run
  `git switch developer && git pull` before editing.
- Never commit or push to `testing`, `production` or `main` directly; promote by pull request,
  one step at a time, only after CI is green and the change is checked on that branch's preview.
- Do not run `supabase db push` or change Supabase/Vercel/Razorpay settings unless the user
  explicitly asks: there is one live database, shared by every preview.

@AGENTS.md
