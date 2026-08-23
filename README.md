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

# Claude-powered lead assistant (optional; mock replies are used when omitted)
ANTHROPIC_API_KEY="sk-ant-..."

# Optional overrides
CLAUDE_MODEL="claude-haiku-4-5-20251001"
# Output ceiling; Haiku 4.5 supports up to 64k. The CRM normally uses far less.
CLAUDE_MAX_TOKENS="8192"
# ANTHROPIC_BASE_URL="https://api.anthropic.com"
```

The Lead Assistant requires `ANTHROPIC_API_KEY`. It intentionally returns a
clear configuration error when Claude is unavailable instead of silently
falling back to generic mock replies.

Generate a signing secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Access is a single shared password protected by a signed, HttpOnly session cookie
(7-day expiry). All pages and server actions require sign-in; the cron notification
routes (`daily-digest`, `payment-reminders`, `pesapal-reconcile`) are exempt because they use their own
`CRON_SECRET` bearer token.

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

## Deploy assistant and package updates

After pulling a release that changes the Prisma schema, apply its production
migrations before restarting the CRM:

```bash
cd /var/www/madar-crm
npm ci
npx prisma migrate deploy
npm run db:generate
npm run build
pm2 restart madar-crm --update-env
```

The assistant migration upserts the ten packages published on the Madar Hub
pricing page and adds structured lead-intelligence fields. It does not delete
leads, payments, visits, notes, or conversation history.

## Lead Assistant workflow

- Paste an initial WhatsApp transcript to extract and review the important lead fields.
- Package recommendations are constrained to active CRM packages and stored by package ID.
- Paste each new customer reply to update the lead and generate the next contextual response.
- The full transcript is sent only for the initial import. Every later turn rewrites a compact rolling summary and sends that memory plus only the newest exchange, keeping long chats fast and inexpensive.
- Customer messages, AI drafts, and messages marked as sent are recorded separately in the lead timeline.
- On an existing lead, use **Mark as sent** after sending an edited reply so the next turn uses the exact wording the customer received.

## Online payments (Pesapal)

The public pricing page can charge customers online via Pesapal; the checkout,
callback, and IPN endpoints are hosted here under `/api/public/pesapal/*` and
are exempt from the password gate (see `src/proxy.ts`). See
[PESAPAL_GUIDE.md](./PESAPAL_GUIDE.md) for credentials, env vars, and IPN
registration.

## Membership payment status and reminders

Monthly members (any lead on a package with `billingType: "monthly"`) get a
derived, always-up-to-date "Next payment date" and payment status computed
from their most recent payment — no separate field to keep in sync:

- **Active** — today is on or before `last payment + 1 month`.
- **Delayed Payment** — up to 7 days past that date (a grace period); the
  member's card/row shows the amount due.
- **Suspended** — more than 7 days past the next payment date.

This shows up as a "Next payment" / "Payment status" column on
[Active Members](src/app/members/page.tsx) and a "Membership payment" card on
each lead's detail page. The logic lives in
[src/lib/membership.ts](src/lib/membership.ts).

To email `contact@madarorbit.com` whenever a monthly member enters the grace
period, trigger `POST /api/notifications/payment-reminders` on a daily
schedule (e.g. a VPS crontab entry, alongside `daily-digest`):

```bash
curl -s -X POST https://madarorbit.com/crm/api/notifications/payment-reminders \
  -H "Authorization: Bearer $CRON_SECRET"
```

It re-sends daily for as long as a member stays in the grace period, mirroring
the follow-up digest's behavior. Add these to `.env`:

```env
RESEND_API_KEY="re_..."
CRON_SECRET="a-long-random-string-shared-with-your-cron-caller"
NOTIFICATION_EMAIL="staff-inbox@example.com"      # daily-digest recipient
PAYMENT_REMINDER_EMAIL="contact@madarorbit.com"    # payment-reminders recipient (defaults to this)
EMAIL_FROM="Madar Hub CRM <onboarding@resend.dev>"
CRM_BASE_URL="https://madarorbit.com/crm"
```

Online Pesapal checkouts need a third, more frequent job. Pesapal only sends an
IPN when a transaction's status *changes*, so a customer who abandons the
payment page leaves a `PesapalPayment` stuck on `PENDING`. Trigger
`POST /api/cron/pesapal-reconcile` every 15 minutes to re-check those against
Pesapal and age out the dead ones:

```bash
*/15 * * * * /bin/bash /var/www/madar-crm/scripts/pesapal-reconcile-cron.sh >> /var/log/madar-crm-reconcile.log 2>&1
```

See [PESAPAL_GUIDE.md](PESAPAL_GUIDE.md) for the full payment setup.

## MVP behavior

- Phone numbers are normalized for `wa.me` links. Local Rwanda numbers beginning with `0` are converted to country code `250`.
- Recording a package payment updates the lead payment total and stage.
- Completing a follow-up clears its reminder date.
- Scheduling a visit from a lead creates visit history and updates the current visit date.
- Message templates support `{{name}}`, which is replaced on the lead profile.

Authentication, staff roles, and official WhatsApp API integration are intentionally outside this MVP.
