# Auth emails (confirm signup, reset password, ...)

Supabase sends these emails; the app only decides where their links land. Every link goes to
`/auth/confirm` (`src/app/api/auth/confirm/route.ts`), which verifies it server-side, signs the
visitor in and sends them on: reset/invite links to `/auth/reset-password`, signup links to the
site, email-change links to `/profile`. A stale link comes back to forgot-password or login
with a fixed "link expired" notice.

The templates here use `token_hash` links, which work in **any** browser or device. Supabase's
default templates (`{{ .ConfirmationURL }}`) only work in the browser that asked for the email,
so a reset requested on a laptop and opened on a phone fails. The app still handles those
default links, but the templates are the fix.

`config.toml` points the **local** stack at these files. Production is configured in the
dashboard, below. Do not `supabase config push` config.toml as-is: its `[auth]` section is
local-dev configuration (`site_url` is localhost) and would overwrite production settings.

## One-time setup in the Supabase dashboard (production)

Project: `xpqtffbawcjytvcvwlgj`.

### 1. Authentication > URL Configuration

- **Site URL:** `https://www.onlyworkshops.com` (`{{ .SiteURL }}` in every template)
- **Redirect URLs** must include:
    - `https://www.onlyworkshops.com/**` (the app builds every email redirect on www, see
      `src/lib/client-url.ts`)
    - `http://localhost:3000/**`
    - `https://*-onlyworkshops-projects.vercel.app/**` for Vercel previews (deployments now
      live under the `onlyworkshops-projects` team, not `morechaitanya606s-projects`)

A redirect that is not on this list silently falls back to the Site URL, so a reset link
would land on the homepage instead of the reset page.

### 2. Authentication > Emails > SMTP Settings

Without custom SMTP, Supabase's built-in sender only delivers to members of your Supabase
team, and only a few emails an hour, so **real users never get confirm or reset emails**.
Email confirmation is ON for this project, so new users cannot log in without one.

The domain's only mailbox is `reachout@onlyworkshops.com` (Hostinger). DNS for
`onlyworkshops.com` (checked 2026-10-04): MX is Hostinger, SPF is
`v=spf1 include:_spf.mail.hostinger.com ~all`, DMARC `p=none`. Only Hostinger may send as the
domain, so **send auth mail through Hostinger's SMTP**: it passes SPF today with no DNS change.

| Field        | Value                                       |
| ------------ | ------------------------------------------- |
| Sender email | `reachout@onlyworkshops.com`                |
| Sender name  | `Only Workshops`                            |
| Host         | `smtp.hostinger.com`                        |
| Port         | `465`                                       |
| Username     | `reachout@onlyworkshops.com`                |
| Password     | the mailbox password (from hPanel > Emails) |

Then **Authentication > Rate Limits**: raise "emails sent per hour" (the built-in sender's
2/hour cap goes away with custom SMTP; 30 is plenty to start). Hostinger also caps how many
emails one mailbox sends per day -- check it in hPanel if signups grow.

**Mailjet** (which the app uses for booking emails) can send as this address only after:
validating `reachout@onlyworkshops.com` as a sender in Mailjet (Account > Senders & Domains),
replacing the SPF record with
`v=spf1 include:_spf.mail.hostinger.com include:spf.mailjet.com ~all` (one SPF record per
domain -- edit it, do not add a second), and adding Mailjet's DKIM TXT record. Until then its
mail from this address fails SPF and tends to land in spam.

### 3. Authentication > Emails > Templates

For each template, set the subject and paste the whole file as the body:

| Dashboard template   | Subject                                   | File                    |
| -------------------- | ----------------------------------------- | ----------------------- |
| Confirm signup       | Confirm your email for Only Workshops     | `confirmation.html`     |
| Reset password       | Reset your Only Workshops password        | `recovery.html`         |
| Magic link           | Your Only Workshops sign-in link          | `magic_link.html`       |
| Invite user          | You're invited to Only Workshops          | `invite.html`           |
| Change email address | Confirm your new email for Only Workshops | `email_change.html`     |
| Reauthentication     | Your Only Workshops verification code     | `reauthentication.html` |

### 4. Check it

1. Sign up with an address you can read: the email arrives from your sender, and its button
   lands you signed in on the site. Opening it on a different device works too.
2. Log in with an unconfirmed account: the login page offers "Resend confirmation email".
3. Forgot password: request a link, open it (any browser), set a new password.
4. Open the same reset link again: it lands on forgot-password with "That link has expired...".
