# Madar Hub CRM

A lightweight CRM for managing Madar Hub WhatsApp leads, visits, follow-ups, packages, and payments.

## Stack

- Next.js 16 App Router and TypeScript
- Tailwind CSS 4
- Prisma ORM and PostgreSQL
- React Hook Form and Zod
- Radix UI primitives, Lucide icons, and Sonner notifications

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env` with a PostgreSQL connection and the sign-in credentials:

```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/madar_crm"

# Auth gate (required — the CRM fails closed if these are unset)
CRM_PASSWORD="choose-a-strong-shared-password"
CRM_AUTH_SECRET="a-long-random-string-used-to-sign-sessions"
```

Generate a signing secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Access is a single shared password protected by a signed, HttpOnly session cookie
(7-day expiry). All pages and server actions require sign-in; the cron digest route
is exempt because it uses its own `CRON_SECRET` bearer token.

3. Create the database schema and generate Prisma Client:

```bash
npx prisma migrate dev --name init
npm run db:generate
```

4. Add the default packages, message templates, and sample leads:

```bash
npm run seed
```

5. Start the CRM:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Useful commands

```bash
npm run typecheck
npm run lint
npm run build
npm run db:studio
```

## Online payments (Pesapal)

The public pricing page can charge customers online via Pesapal; the checkout,
callback, and IPN endpoints are hosted here under `/api/public/pesapal/*` and
are exempt from the password gate (see `src/proxy.ts`). See
[PESAPAL_GUIDE.md](./PESAPAL_GUIDE.md) for credentials, env vars, and IPN
registration.

## MVP behavior

- Phone numbers are normalized for `wa.me` links. Local Rwanda numbers beginning with `0` are converted to country code `250`.
- Recording a package payment updates the lead payment total and stage.
- Completing a follow-up clears its reminder date.
- Scheduling a visit from a lead creates visit history and updates the current visit date.
- Message templates support `{{name}}`, which is replaced on the lead profile.

Authentication, staff roles, and official WhatsApp API integration are intentionally outside this MVP.
