# Pesapal Setup Guide — Madar Hub

The public pricing page (madarorbit.com/pricing.html) can charge customers online
via Pesapal. The checkout, callback, and IPN endpoints live in this CRM app
(`src/app/api/public/pesapal/*`) even though the customer never sees the CRM UI.

## 1. Get Madar Hub Pesapal credentials

Create (or reuse) a Pesapal merchant account for Madar Hub and generate a
consumer key/secret. Sandbox and live use different base URLs:

- Sandbox: `https://cybqa.pesapal.com/pesapalv3`
- Live: `https://pay.pesapal.com/v3`

## 2. Set environment variables

In `.env` (local) or the server's environment (production):

```env
PESAPAL_CONSUMER_KEY="your_consumer_key"
PESAPAL_CONSUMER_SECRET="your_consumer_secret"
PESAPAL_BASE_URL="https://pay.pesapal.com/v3"   # or the sandbox URL while testing
NEXT_PUBLIC_APP_URL="https://madarorbit.com/crm"
MADAR_SITE_URL="https://madarorbit.com"
```

`NEXT_PUBLIC_APP_URL` is this CRM app's own public base URL (used to build the
Pesapal callback/IPN URLs). `MADAR_SITE_URL` is the public marketing site,
used only to send the customer's browser to a plain result page
(`payment-success.html` / `payment-pending.html` / `payment-failed.html`)
after they finish paying.

Restart the app (`pm2 restart madar-crm` or `pm2 delete madar-crm && pm2 start ecosystem.config.js`)
after changing `.env`.

## 3. Register the IPN URL (one-time)

Pesapal needs to know where to send payment notifications. Once the keys
above are set:

1. Log in to the CRM as usual (the password gate).
2. From a browser or Postman, send a POST request to:
   `https://madarorbit.com/crm/api/pesapal/register-ipn`
   (include the CRM session cookie — easiest is to trigger it from a logged-in
   browser tab via the JS console: `fetch('/crm/api/pesapal/register-ipn', {method:'POST'}).then(r=>r.json()).then(console.log)`)
3. Copy the returned `ipn_id` into `.env`:
   ```env
   PESAPAL_IPN_ID="xxxx-xxxx-xxxx-xxxx"
   ```
4. Restart the app again.

## 4. Add package slugs

The public checkout looks up packages by `slug` (see `prisma/schema.prisma`
and `prisma/seed.ts`), not by name, so prices can be edited in the CRM without
breaking the public buttons. Every package the pricing page can sell needs a
`slug` set on its `Package` row.

## 5. Troubleshooting

- **"Online payment is not configured yet"** — `MADAR_SITE_URL` or
  `NEXT_PUBLIC_APP_URL` is missing.
- **Order submission fails with a missing `PESAPAL_IPN_ID` error** — register
  the IPN URL first (step 3).
- **Payments stay "Pending" in the CRM** — the IPN likely couldn't reach the
  server (firewall / DNS), or `PESAPAL_IPN_ID` doesn't match what's
  registered. Re-run step 3.
