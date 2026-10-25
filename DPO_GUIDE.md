# DPO Pay Setup Guide — Madar Hub

Customers can pay for a package through DPO Pay (3G Direct Pay) from the public
pricing page and from inside the member portal. Like Pesapal it is a hosted
page: the customer leaves the site, pays on DPO, and comes back. The checkout,
callback and reconcile routes live in this CRM app (`src/app/api/public/dpo/*`,
`src/app/api/internal/dpo/*`, `src/app/api/cron/dpo-reconcile`).

DPO runs **alongside** Pesapal and MoMo. It adds no surcharge: the customer pays
the VAT-inclusive sale price and Madar Hub absorbs DPO's fee.

## How a DPO payment works

1. `createToken` registers the transaction (amount, `CompanyRef` = our
   merchant reference) and returns a `TransToken`.
2. The customer is sent to `https://secure.3gdirectpay.com/payv2.php?ID=<TransToken>`.
3. DPO sends their browser back to `/crm/api/public/dpo/callback` — with
   `TransactionToken` and `CompanyRef` after paying, or with `cancelled=1` from
   the cancel link.
4. The callback never trusts the redirect: it calls `verifyToken`, and only
   result `000` books a Payment (as `DPO Pay`) against the Lead.
5. A customer who pays and closes the tab is caught by the reconcile cron.

Unpaid tokens expire after 60 minutes (`PTL`), after which DPO reports `903`
and the row is closed as FAILED.

## 1. Set the environment variables

In `.env` (local) or the server's environment (production):

```env
DPO_BASE_URL="https://secure.3gdirectpay.com"
DPO_COMPANY_TOKEN="your_company_token"
DPO_SERVICE_TYPE="your_service_id"
DPO_MODE="test"   # "live" once DPO sends the live credentials
```

Restart the app (`pm2 restart madar-crm`) after changing `.env`.

## 2. Check the credentials

```bash
npm run dpo:check
```

It opens a 100 RWF transaction, verifies it (expect `900 Transaction not paid
yet`), and cancels it. No money moves and nothing is written to the database,
so it is safe against the live account too.

`802 Company is not active` means DPO has not activated the account yet: the
token is recognised but cannot transact. Ask DPO support to activate it.

## 3. Test vs live — why DPO_MODE exists

DPO's test and live credentials talk to **the same host**. Nothing in the URL
or the token says which one you have, so `DPO_MODE` is the switch:

- `DPO_MODE="test"` — the pricing page and the portal **do not show** DPO, and
  the checkout routes refuse with 503.
- `DPO_MODE="live"` — DPO is offered to customers.

Every DpoPayment also records `testMode`, so a row created on the test account
can always be told apart later.

`DPO_ALLOW_TEST_CHECKOUT=true` opens the flow while still in test mode — but
**only ever against a throwaway database**. DPO's test cards complete without
moving money, so fulfilment would book real Payment rows against real Leads,
and the option would be visible to every customer on the pricing page. Never set
it on production; test a live payment with the live credentials and a small
real amount instead.

## 4. Deploy the database change

The `DpoPayment` table comes from migration
`20261025130000_add_dpo_payment`. It only adds a table, so it is safe to apply
while Pesapal is taking payments:

```bash
npx prisma migrate deploy
```

## 5. Install the reconcile cron

```cron
*/15 * * * * /bin/bash /var/www/madar-crm/scripts/dpo-reconcile-cron.sh >> /var/log/madar-crm-reconcile.log 2>&1
```

It re-verifies DpoPayments still PENDING after 15 minutes, and marks rows
unresolved after 24 hours as ABANDONED (a later check can still rescue them).
Tune with `DPO_RECONCILE_MIN_AGE_MINUTES` and `DPO_ABANDON_AFTER_HOURS`.

## 6. Going live

1. Replace `DPO_COMPANY_TOKEN` and `DPO_SERVICE_TYPE` with the live values.
2. Set `DPO_MODE="live"` and restart.
3. Run `npm run dpo:check`.
4. Pay for the cheapest package yourself and confirm the Payment appears on
   the Lead as `DPO Pay`.

## Where the money is booked

A completed DPO payment is booked as payment method `DPO Pay`. DPO settles to
the bank account, so on an invoice it maps to the EBM bank-transfer payment
type, like Pesapal (`src/lib/tax.ts`).

If DPO ever reports a paid amount or currency different from what was charged,
nothing is booked: the row keeps a `failureReason` saying what DPO collected,
for staff to resolve by hand.
