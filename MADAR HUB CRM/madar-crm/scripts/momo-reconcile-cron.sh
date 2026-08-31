#!/bin/bash
# Trigger the MTN MoMo reconciliation sweep.
#
# A MoMo prompt is only resolved while the customer's browser is polling. If
# they approve on the handset and immediately close the tab, the MomoPayment
# sticks on PENDING and the money never reaches the CRM. This re-checks those
# rows against MTN.
#
# MoMo prompts settle or expire much faster than a Pesapal checkout, so this
# runs more often than the Pesapal sweep. Install in the root crontab (every
# 5 minutes):
#
#   */5 * * * * /bin/bash /var/www/madar-crm/scripts/momo-reconcile-cron.sh >> /var/log/madar-crm-reconcile.log 2>&1
#
# CRON_SECRET and CRM_BASE_URL are read from the app's .env so the secret is
# never duplicated into the crontab.

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR" || { echo "$(date -Is) [momo-reconcile] ERROR: cannot cd to $APP_DIR"; exit 1; }

if [ ! -f .env ]; then
    echo "$(date -Is) [momo-reconcile] ERROR: $APP_DIR/.env not found"
    exit 1
fi

set -a
# shellcheck disable=SC1091
. ./.env
set +a

if [ -z "$CRON_SECRET" ]; then
    echo "$(date -Is) [momo-reconcile] ERROR: CRON_SECRET is not set in .env"
    exit 1
fi

BASE_URL="${CRM_BASE_URL:-https://madarorbit.com/crm}"

# -m 120 caps the run: the route itself batches at 50 rows, each one MoMo round-trip.
RESPONSE=$(curl -sS -m 120 -w '\n%{http_code}' -X POST \
    -H "Authorization: Bearer $CRON_SECRET" \
    "$BASE_URL/api/cron/momo-reconcile" 2>&1)

STATUS=$(printf '%s' "$RESPONSE" | tail -n 1)
BODY=$(printf '%s' "$RESPONSE" | sed '$d')

echo "$(date -Is) [momo-reconcile] HTTP $STATUS $BODY"

[ "$STATUS" = "200" ] || exit 1
