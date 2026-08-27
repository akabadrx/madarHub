# Madar Hub Membership Portal

The member-facing account area at `madarorbit.com/membership`. Members log in to
check their subscription status, see when the next payment is due, and review
their payment history.

## How it fits with the rest of the site

Three separate things share the `madarorbit.com` domain, split by path in
`deploy/Caddyfile`:

| Path | App | Port |
| --- | --- | --- |
| `/` | Static marketing site (plain HTML, served by nginx) | 8080 |
| `/crm/*` | Staff CRM (Next.js) | 3200 |
| `/membership/*` | This app (Next.js) | 3201 |

`/membership/*` is also served on `www.madarorbit.com` rather than redirected.
Redirecting it would turn a form submission into a cross-origin redirect and
drop the request body — the same failure the Pesapal checkout hit previously.

## Looking like the same website

There is no second copy of the design. `src/app/layout.tsx` links the marketing
site's own stylesheet:

```
<link rel="stylesheet" href="{SITE_ORIGIN}/assets/styles.css" />
```

and `SiteHeader` / `SiteFooter` reproduce the static site's header and footer
markup so those styles apply directly. Brand changes on the static site reach
the portal as soon as the site is redeployed.

`src/app/globals.css` only adds layout the static site does not have (the auth
card, the dashboard panels). It must never redefine anything the site
stylesheet already sets, or the two will drift apart.

In development, set `NEXT_PUBLIC_SITE_ORIGIN=https://madarorbit.com` so the
pages pull the live stylesheet and logos. Leave it **empty** in production,
where both are on one domain.

## Database

This app shares the CRM's Postgres database but lives in its **own schema**,
`membership`, set by `?schema=membership` on `DATABASE_URL`.

That is not cosmetic. Prisma records applied migrations in a `_prisma_migrations`
table inside whichever schema it is pointed at. The CRM uses `public`. If this
app also used `public`, each project's `prisma migrate deploy` would find
migrations it does not own and refuse to run — breaking not just this app's
deploys but the CRM's too. A separate schema gives each app its own tables and
its own migration history, in one database.

It owns only the tables in `prisma/schema.prisma`: `MembershipUser`,
`OAuthAccount`, `PasswordResetToken` and `OAuthState`.

The CRM's tables are deliberately **not** modelled here. They are read through
parameterised raw queries in `src/lib/crm.ts`, qualified as `public."Lead"` and
so on, because `public` is not on this app's search path. `prisma migrate` run
from this project can never alter or drop anything the CRM owns.

> Migrations for CRM tables belong in `MADAR HUB CRM/madar-crm` only.

## Accounts

Signup asks for a phone number and matches it against the CRM's `Lead` records
using the same normalisation the CRM uses (`0783662543` → `250783662543`). A
match links the account to that member, so their real status and payment
history appear immediately. No match still creates the account — the person just
has no membership on it yet, and staff can link it later.

Google sign-in has no phone number in the profile, so those accounts start
unlinked and are matched once a phone is added.

## Auth

- Sessions are signed `<userId>.<expiry>.<hmac>` cookies. The signature covers
  the user id as well as the expiry, so an id cannot be swapped.
- `MEMBER_AUTH_SECRET` must differ from the CRM's `CRM_AUTH_SECRET`. A staff
  session then can never validate as a member session.
- The cookie is scoped to `/membership`, so it is never sent to `/crm`.
- "Keep me logged in" sets a 30-day cookie; unchecked gives a 12-hour session
  cookie that the browser drops when it closes.
- Passwords use scrypt from `node:crypto` — memory-hard, built in, no native
  build step on the VPS.
- `src/proxy.ts` puts the public/protected decision in code rather than in the
  matcher regex, and defaults to requiring a session, so a route nobody
  remembered to list is protected rather than exposed.

## Setup

```bash
npm install
cp .env.example .env      # then fill it in
npx prisma migrate dev --name init_membership
npm run dev               # http://localhost:3201/membership/login
```

Generate the session secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

### Google sign-in (optional)

The Google button is hidden entirely until `GOOGLE_CLIENT_ID` and
`GOOGLE_CLIENT_SECRET` are set, so the portal runs fine without it. In the
Google Cloud console, create an OAuth 2.0 Web client and add this authorised
redirect URI:

```
https://madarorbit.com/membership/api/auth/google/callback
```

### Password reset email

Without `RESEND_API_KEY` the reset link is logged to the server console instead
of being emailed, so the flow can be exercised in development without a key and
without pretending an email was sent.

## Deploy

Mirrors the CRM's flow: a `git subtree` branch holding just this folder, pulled
on the VPS into `/var/www/madar-membership` and run under PM2 on port 3201.

### First time, from the monorepo root (local)

```bash
git add . && git commit -m "Add membership portal"
git subtree push --prefix=madar-membership origin membership-deploy
```

### First time, on the VPS

```bash
psql "$DATABASE_URL" -c 'CREATE SCHEMA IF NOT EXISTS membership;'
git clone -b membership-deploy <repo-url> /var/www/madar-membership
cd /var/www/madar-membership
cp .env.example .env   # then fill it in — see the notes inside
npm ci
npx prisma generate
npx prisma migrate deploy
npm run build
cp .env .next/standalone/.env        # standalone reads its own .env
pm2 start ecosystem.config.js && pm2 save
```

Then reload Caddy so `/membership` routes to port 3201.

### Later deploys

```bash
cd /var/www/madar-membership && git pull --ff-only origin membership-deploy
npm ci && npx prisma generate && npx prisma migrate deploy && npm run build
cp .env .next/standalone/.env
pm2 restart madar-membership
```

`.env` is gitignored and is maintained by hand on the VPS, the same way the
CRM's is — `git pull` never overwrites it.

### Migrations

The initial migration is already committed at
`prisma/migrations/20260828120000_init_membership/`. It creates the `membership`
schema and the four tables above, and `npx prisma migrate deploy` applies it —
there is nothing to generate before the first deploy.

Never run `migrate dev` against the production database; it can reset data. For
later schema changes, run `migrate dev` against a local Postgres and commit the
generated folder, or produce the SQL without connecting:

```bash
npx prisma migrate diff --from-schema-datasource prisma/schema.prisma \
  --to-schema-datamodel prisma/schema.prisma --script
```
