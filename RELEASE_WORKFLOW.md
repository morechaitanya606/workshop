# Release workflow

The site is live at https://www.onlyworkshops.com. Nothing reaches it without passing through
every branch below, in order. This applies to everyone and every tool (Claude Code, Codex,
Cursor, Jules, a new laptop, a new account).

```
developer  ->  testing  ->  production  ->  main
 (write)       (verify)     (final check)   (LIVE)
```

| Branch       | What it is for                                   | How changes arrive             |
| ------------ | ------------------------------------------------ | ------------------------------ |
| `developer`  | All coding happens here.                         | Commits (directly or from short feature branches) |
| `testing`    | Check the change on its own preview deployment.  | Pull request from `developer`  |
| `production` | Final check of exactly what will go live.        | Pull request from `testing`    |
| `main`       | **Live.** Vercel deploys `main` to the domain.   | Pull request from `production` |

## Rules

1. **Never commit directly to `testing`, `production` or `main`.** The pre-commit hook
   (`.husky/pre-commit`) refuses it. Emergency override, for a human only:
   `ALLOW_PROTECTED_BRANCH_COMMIT=1 git commit ...`
2. **Promote one step at a time**, by pull request, and only when the step below is green:
   CI passes (typecheck, lint, tests, migration parse, build) and the change works on that
   branch's preview.
3. **Hotfixes take the same path**, just quickly. A fix made on `main` would be lost at the
   next release.
4. **After a release, sync `developer`** so the next change starts from what is live:
   ```bash
   git switch developer
   git pull
   git merge --ff-only origin/main
   git push
   ```

## Checking a step

- Every pushed branch gets a Vercel preview, e.g.
  `https://onlyworkshops-git-testing-onlyworkshops-projects.vercel.app`. Previews are behind
  Vercel login: open them while signed in to Vercel.
- CI results are on the pull request and under the repository's Actions tab.

## Careful: previews share live services

All deployments, previews included, use the **same Supabase project** (live users, bookings,
auth emails) and the same Razorpay keys unless the Vercel **Preview** environment variables
point elsewhere. Until they do:

- test with your own accounts, never real customers' data;
- do not complete real payments on a preview;
- for full isolation, create a second Supabase project and set Razorpay **test** keys under
  Vercel > Settings > Environment Variables > Preview.

## Database migrations

There is one database, so a migration takes effect the moment it is applied, whatever branch
the code is on.

- Write migrations that the code currently on `main` also tolerates (add, do not rename or
  drop something live code still uses).
- Apply them (`npm --prefix app run db:push`) when promoting `production` -> `main`, right
  before merging, after checking `npm --prefix app run db:validate`.

## One-time setup (GitHub)

Settings > Branches > Add branch ruleset for `main`, `production` and `testing`:
require a pull request before merging, require the **CI** status check to pass, and block
force pushes. That makes the rules above impossible to skip, not just discouraged.
