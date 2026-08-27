#!/bin/bash
# Madar Hub membership portal deployment.
#
# Place on the VPS inside the project folder (/var/www/madar-membership) and run
# from the project root:  bash scripts/deploy.sh
#
# This directory tracks the "membership-deploy" branch, which mirrors just the
# madar-membership subfolder of the monorepo's main branch (kept in sync with
# `git subtree push --prefix=madar-membership origin membership-deploy`, run
# from the monorepo root before deploying).

set -e

PM2_APP_NAME="madar-membership"
NODE_VERSION_REQUIRED="20"

GREEN='\033[0;32m'; BLUE='\033[0;34m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
log()   { echo -e "${GREEN}[DEPLOY]${NC} $1"; }
info()  { echo -e "${BLUE}[INFO]${NC}   $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

[ -f "package.json" ] || error "Run this from the madar-membership project root."
APP_DIR="$(pwd)"
log "Deploying membership portal from: $APP_DIR"

command -v node >/dev/null 2>&1 || error "Node.js is not installed."
NODE_MAJOR=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
[ "$NODE_MAJOR" -ge "$NODE_VERSION_REQUIRED" ] || error "Node $NODE_MAJOR is too old; need $NODE_VERSION_REQUIRED+."
info "Node.js version: $(node -v)"

[ -f ".env" ] || error ".env not found. Copy .env.example and fill it in first."

# The portal must not share a schema with the CRM: Prisma tracks applied
# migrations per schema, and two apps in one schema make each other's
# `migrate deploy` fail. Refuse to continue rather than corrupt both histories.
if ! grep -q 'schema=membership' .env; then
    error "DATABASE_URL in .env must end with ?schema=membership (see README)."
fi

if [ -d ".git" ]; then
    log "Pulling latest changes..."
    git pull --ff-only origin membership-deploy
else
    info "No .git folder found. Skipping git pull."
fi

log "Installing dependencies..."
npm ci

log "Generating Prisma client..."
./node_modules/.bin/prisma generate

log "Applying database migrations..."
./node_modules/.bin/prisma migrate deploy

log "Building..."
npm run build

# next build with output:"standalone" does NOT copy these itself. Without them
# the server starts and returns HTML, but every CSS and JS chunk 404s — the page
# loads unstyled, which is easy to miss because the HTTP status is still 200.
log "Copying static assets into the standalone output..."
mkdir -p .next/standalone/.next
rm -rf .next/standalone/.next/static
cp -r .next/static .next/standalone/.next/static
if [ -d "public" ]; then
    cp -r public .next/standalone/public
fi

# Next does not trace the Prisma query engine into the standalone bundle either.
# It happens to resolve via the project-root node_modules while PM2's cwd points
# there, but that is luck, not design: without this the app throws
# PrismaClientInitializationError ("could not locate the Query Engine") on the
# first database call, which means every login and signup 500s.
if [ -d "node_modules/.prisma/client" ]; then
    log "Copying Prisma query engine into the standalone output..."
    mkdir -p .next/standalone/node_modules/.prisma
    rm -rf .next/standalone/node_modules/.prisma/client
    cp -r node_modules/.prisma/client .next/standalone/node_modules/.prisma/client
else
    warn "node_modules/.prisma/client not found — did prisma generate run?"
fi

# The standalone server loads its own .env from next to server.js, not the
# project root's — copy it every deploy or env var changes go unnoticed.
cp .env .next/standalone/.env

log "Restarting PM2 process..."
if pm2 describe "$PM2_APP_NAME" >/dev/null 2>&1; then
    pm2 restart "$PM2_APP_NAME" --update-env
else
    pm2 start ecosystem.config.js
fi
pm2 save

sleep 2
STATUS=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3201/membership/login || echo "000")
if [ "$STATUS" = "200" ]; then
    log "Deployed. Login page returned 200."
else
    warn "Login page returned $STATUS — check: pm2 logs $PM2_APP_NAME"
fi

# A 200 alone does not prove the deploy is good; the CSS chunk is the part that
# silently breaks, so verify it directly.
CSS_PATH=$(curl -s http://127.0.0.1:3201/membership/login     | grep -o '/membership/_next/static/chunks/[^"]*\.css' | head -1)
if [ -n "$CSS_PATH" ]; then
    # The path already carries the /membership basePath, so use it as-is.
    CSS_STATUS=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:3201${CSS_PATH}" || echo "000")
    if [ "$CSS_STATUS" = "200" ]; then
        log "Stylesheet chunk OK."
    else
        warn "Stylesheet chunk returned $CSS_STATUS — static assets may not have copied."
    fi
else
    warn "Could not find a stylesheet link in the login page to verify."
fi
