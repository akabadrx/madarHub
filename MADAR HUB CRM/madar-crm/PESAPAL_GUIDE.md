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

## 5. What the customer is charged

A package's `price` in the CRM is the VAT-exclusive sticker price. The amount
Pesapal bills is built from it in two steps, both in
[the checkout route](src/app/api/public/pesapal/checkout/route.ts):

1. **+18% VAT** — the actual sale price.
2. **Grossed up for Pesapal's fees** — Pesapal keeps 3% of the charge and a
   further 1% when settling to the bank. Charging the sale price directly would
   land ~4% short, so the charge is `sale / 0.96`, rounded up.

For a 100,000 RWF package: 118,000 sale price, **122,917 charged**, 118,000
settled. Rounding is always up, so settlement never comes in under target.

Two numbers are stored per payment, and they are not interchangeable:

| Column | Meaning |
| --- | --- |
| `amount` | The VAT-inclusive sale price — what settles to the bank, and what the CRM books as revenue |
| `chargedAmount` | What Pesapal actually billed the customer |

The CRM records revenue at `amount`, so the 4% never inflates the books. The
customer-facing result pages show `chargedAmount`, because that is what left
their account.

If Pesapal's fees change, edit `PESAPAL_FEE_PERCENT` — it is the single source
of truth. Note the fee is disclosed to the customer in the checkout modal
([assets/pesapal-checkout.js](../../assets/pesapal-checkout.js)); keep the two
in step.

## 6. Reconcile abandoned payments (recurring)

Pesapal fires an IPN only when a transaction's status *changes*, and the
browser callback only runs if the customer returns to the site. A customer who
walks away from Pesapal's "Payment Processing" page leaves a `PesapalPayment`
row stuck on `PENDING` with nothing to show for it.

Run the reconciliation sweep on a schedule (every 15 minutes is plenty) to
re-check those rows against Pesapal:

```bash
*/15 * * * * /bin/bash /var/www/madar-crm/scripts/pesapal-reconcile-cron.sh >> /var/log/madar-crm-reconcile.log 2>&1
```

[scripts/pesapal-reconcile-cron.sh](scripts/pesapal-reconcile-cron.sh) reads
`CRON_SECRET` and `CRM_BASE_URL` from `.env`, so the secret never has to be
pasted into the crontab, and it logs the sweep's JSON result on every run.

Rows still `PENDING` past the abandon window are marked `ABANDONED` so they
stop being retried. That status is not final — if Pesapal later reports the
payment as completed, the IPN still fulfills it normally.

Optional tuning in `.env` (both have sensible defaults):

```env
PESAPAL_RECONCILE_MIN_AGE_MINUTES="15"   # settling window before polling a checkout
PESAPAL_ABANDON_AFTER_HOURS="24"         # give up and mark ABANDONED after this
```

## 7. Troubleshooting

- **"Online payment is not configured yet"** — `MADAR_SITE_URL` or
  `NEXT_PUBLIC_APP_URL` is missing.
- **Order submission fails with a missing `PESAPAL_IPN_ID` error** — register
  the IPN URL first (step 3).
- **Payments stay "Pending" in the CRM** — the IPN likely couldn't reach the
  server (firewall / DNS), or `PESAPAL_IPN_ID` doesn't match what's
  registered. Re-run step 3. If the IPN is healthy, the customer probably
  abandoned checkout; the step 6 sweep resolves those.
- **Pesapal shows "Payment Processing" with a blank Payment Method** — no money
  moved. Pesapal only fills that field once a channel is chosen and a charge is
  attempted, so the customer never completed the payment leg (a Mobile Money
  prompt that was never confirmed is the usual cause — note that a Rwandan MoMo
  prompt cannot be actioned from abroad). The customer has *not* been charged
  and can safely retry; suggest card if they are outside Rwanda.
