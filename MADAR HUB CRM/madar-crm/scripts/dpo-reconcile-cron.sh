#!/bin/bash
# Trigger the DPO Pay reconciliation sweep.
#
# DPO reports the outcome only to the customer's browser on the way back, so a
# customer who pays and closes the tab leaves a DpoPayment stuck on PENDING.
# This re-verifies those rows with DPO.
#
# Install in the root crontab (every 15 minutes):
#
#   */15 * * * * /bin/bash /var/www/madar-crm/scripts/dpo-reconcile-cron.sh >> /var/log/madar-crm-reconcile.log 2>&1
#
# CRON_SECRET and CRM_BASE_URL are read from the app's .env so the secret is
# never duplicated into the crontab.

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR" || { echo "$(date -Is) [dpo-reconcile] ERROR: cannot cd to $APP_DIR"; exit 1; }

if [ ! -f .env ]; then
    echo "$(date -Is) [dpo-reconcile] ERROR: $APP_DIR/.env not found"
    exit 1
fi

set -a
# shellcheck disable=SC1091
. ./.env
set +a

if [ -z "$CRON_SECRET" ]; then
    echo "$(date -Is) [dpo-reconcile] ERROR: CRON_SECRET is not set in .env"
    exit 1
fi

BASE_URL="${CRM_BASE_URL:-https://madarorbit.com/crm}"

# -m 120 caps the run: the route itself batches at 50 rows, each one DPO round-trip.
RESPONSE=$(curl -sS -m 120 -w '\n%{http_code}' -X POST \
    -H "Authorization: Bearer $CRON_SECRET" \
    "$BASE_URL/api/cron/dpo-reconcile" 2>&1)

STATUS=$(printf '%s' "$RESPONSE" | tail -n 1)
BODY=$(printf '%s' "$RESPONSE" | sed '$d')

echo "$(date -Is) [dpo-reconcile] HTTP $STATUS $BODY"

[ "$STATUS" = "200" ] || exit 1
