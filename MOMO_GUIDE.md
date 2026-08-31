# MTN MoMo Setup Guide — Madar Hub

Customers can pay for a package directly with MTN MoMo, from the public pricing
page (madarorbit.com/pricing.html) and from inside the member portal. The
checkout and status endpoints live in this CRM app (`src/app/api/public/momo/*`
and `src/app/api/internal/momo/*`) even though the customer never sees the CRM UI.

## How MoMo differs from Pesapal

Pesapal is a hosted redirect: the customer leaves the site, pays, and comes back
to a callback URL. MoMo has no redirect at all. `requestToPay` pushes a PIN
prompt to the customer's handset and returns `202 Accepted` immediately — the
outcome is only learned by **polling**. So:

- the page stays open on a "Check your phone" screen and polls the status route
- a customer who approves and then closes the tab is caught by the reconcile
  cron (step 6), not by a webhook
- `202 Accepted` means *the prompt was delivered*, never *the money arrived*

## About the merchant code (00743)

**The Collections API has no merchant-code field.** `*182*8*00743#` and the API
are two front doors to the same MADAR HUB LTD account. Where the money lands is
decided entirely by which merchant account MTN provisions your API credentials
against — nothing in the request body selects it.

That means when you apply for production access you must tell MTN Rwanda:
*"provision Collections API against merchant code 00743, MADAR HUB LTD."* The
API user and key they then issue collect into that account automatically.

The code still appears in two places in the product, both deliberate:

- the WhatsApp payment template staff send (`src/lib/constants.ts`)
- the manual fallback shown when the API call fails, so a customer always has a
  way to pay (`assets/checkout.js`, `madar-membership/src/lib/site.ts`)

Change it in those places if the merchant code ever changes.

## 1. Get the subscription key

Sign in at [momodeveloper.mtn.com](https://momodeveloper.mtn.com), subscribe to
the **Collections** product, and copy the **Primary key**. That is
`MOMO_SUBSCRIPTION_KEY`.

## 2. Set the environment variables

In `.env` (local) or the server's environment (production):

```env
MOMO_BASE_URL="https://sandbox.momodeveloper.mtn.com"
MOMO_TARGET_ENVIRONMENT="sandbox"
MOMO_SUBSCRIPTION_KEY="your_collections_primary_key"
MOMO_API_USER=""      # filled in by step 3
MOMO_API_KEY=""       # filled in by step 3
MOMO_PROVIDER_CALLBACK_HOST="madarorbit.com"
```

For production, `MOMO_BASE_URL` becomes `https://proxy.momoapi.mtn.com` and
`MOMO_TARGET_ENVIRONMENT` becomes `mtnrwanda`.

Note the currency is derived from the target environment, not configured: MTN's
sandbox rejects everything except `EUR`, production takes `RWF`. Deriving it
means a half-finished switch cannot send sandbox currency to the live API.

Restart the app (`pm2 restart madar-crm`) after changing `.env`.

## 3. Create the sandbox API user and key (one-time, sandbox only)

The API user and key cannot be created from the portal UI. Run the helper once:

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
  https://madarorbit.com/crm/api/momo/provision-sandbox
```

It returns `{ "apiUser": "...", "apiKey": "..." }`. Copy those into
`MOMO_API_USER` and `MOMO_API_KEY`, then restart the app.

The route refuses to run unless `MOMO_BASE_URL` points at the sandbox host — in
production MTN issues these to you directly and this endpoint does not exist.

## 4. Test in the sandbox

MTN's sandbox resolves the outcome from the payer's number rather than a real
handset, so no phone is involved:

- any normal-looking MSISDN (e.g. `250788123456`) → `SUCCESSFUL`
- the reserved failure numbers documented in the MoMo Collections sandbox docs →
  `FAILED` with the matching reason

Walk the whole flow from madarorbit.com/pricing.html: pick a package, choose
MTN MoMo, submit, and watch the "Check your phone" screen resolve. Then confirm
in the CRM that a Lead and a Payment (method `MoMo Pay`) were created.

## 5. Go live

1. Apply to MTN Rwanda for production Collections access, quoting merchant code
   `00743` / MADAR HUB LTD (see the merchant-code section above).
2. Swap in the production `MOMO_BASE_URL`, `MOMO_TARGET_ENVIRONMENT`,
   `MOMO_SUBSCRIPTION_KEY`, `MOMO_API_USER` and `MOMO_API_KEY`.
3. Restart the app and make one small real payment end to end before announcing it.

## 6. Install the reconcile cron

The sweep is what rescues a payment whose customer closed the tab. Install it in
the root crontab:

```
*/5 * * * * /bin/bash /var/www/madar-crm/scripts/momo-reconcile-cron.sh >> /var/log/madar-crm-reconcile.log 2>&1
```

It runs more often than the Pesapal sweep because MoMo prompts settle or expire
in minutes rather than hours. Tunable with `MOMO_RECONCILE_MIN_AGE_MINUTES`
(default 5) and `MOMO_ABANDON_AFTER_HOURS` (default 2).

## Pricing

MoMo carries no payment surcharge, so the customer is charged the VAT-inclusive
sale price — a 100,000 RWF package is billed at 118,000, against 121,540 on
Pesapal. Both figures come from `src/lib/pricing.ts`
(`momoCheckoutAmounts` / `checkoutAmounts`); the CRM books `amount` (the sale
price) either way, so revenue reporting does not change with the channel.

## Where things live

| Piece | Path |
| --- | --- |
| MoMo API client | `src/lib/momo.ts` |
| Fulfilment (shared with Pesapal) | `src/lib/online-fulfillment.ts` |
| MoMo fulfilment | `src/lib/momo-fulfillment.ts` |
| Public checkout / status | `src/app/api/public/momo/{checkout,status}` |
| Portal checkout / status | `src/app/api/internal/momo/{checkout,status}` |
| Reconcile sweep | `src/app/api/cron/momo-reconcile` |
| Sandbox provisioning | `src/app/api/momo/provision-sandbox` |
| Public site UI | `assets/checkout.js` |
| Portal UI | `madar-membership/src/components/package-picker.tsx` |
