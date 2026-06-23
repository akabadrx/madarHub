#!/bin/bash
# Madar CRM deployment script
# Place this file on your VPS inside the madar-crm project folder (e.g. /var/www/madar-crm/scripts/deploy.sh)
# Run it from the project root: bash scripts/deploy.sh

set -e

# -------------------- CONFIGURATION --------------------
# Change these values to match your VPS setup
PM2_APP_NAME="madar-crm"
NODE_VERSION_REQUIRED="20"
# -------------------- END CONFIGURATION --------------------

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log()    { echo -e "${GREEN}[DEPLOY]${NC} $1"; }
info()   { echo -e "${BLUE}[INFO]${NC}   $1"; }
warn()   { echo -e "${YELLOW}[WARN]${NC}  $1"; }
error()  { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# Verify we are in the project root
if [ ! -f "package.json" ]; then
    error "package.json not found. Please run this script from the madar-crm project root."
fi

APP_DIR="$(pwd)"
log "Deploying Madar CRM from: $APP_DIR"

# Check Node.js version
if ! command -v node &> /dev/null; then
    error "Node.js is not installed. Please install Node.js $NODE_VERSION_REQUIRED or later."
fi

NODE_VERSION_CURRENT=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION_CURRENT" -lt "$NODE_VERSION_REQUIRED" ]; then
    error "Node.js version $NODE_VERSION_CURRENT is too old. Please upgrade to Node.js $NODE_VERSION_REQUIRED or later."
fi
info "Node.js version: $(node -v)"

# Optional: pull latest changes if this is a git repository
if [ -d ".git" ]; then
    log "Git repository detected. Pulling latest changes..."
    git pull origin main || warn "Git pull failed, continuing with current code"
else
    info "No .git folder found. Skipping git pull."
fi

# Install dependencies
log "Installing dependencies..."
npm ci

# Generate Prisma client
if [ -f "prisma/schema.prisma" ]; then
    log "Generating Prisma client..."
    npx prisma generate
else
    warn "No prisma/schema.prisma found. Skipping Prisma generation."
fi

# Deploy database migrations (Prisma reads .env automatically)
if [ -f "prisma/schema.prisma" ]; then
    log "Deploying database migrations..."
    npx prisma migrate deploy || warn "Database migration deploy failed"
else
    info "No Prisma schema found. Skipping migrations."
fi

# Build Next.js app (creates .next/standalone output)
log "Building Next.js app..."
npm run build

# Copy static assets into the standalone output (required by Next.js standalone)
log "Copying static assets to standalone output..."
mkdir -p .next/standalone/.next
cp -r .next/static .next/standalone/.next/static
if [ -d "public" ]; then
    cp -r public .next/standalone/public
fi

# Restart the app with PM2 if available, otherwise use nohup
if command -v pm2 &> /dev/null; then
    log "PM2 detected. Restarting process '$PM2_APP_NAME'..."

    if [ -f "ecosystem.config.js" ]; then
        if pm2 describe "$PM2_APP_NAME" > /dev/null 2>&1; then
            pm2 restart ecosystem.config.js
        else
            warn "PM2 process '$PM2_APP_NAME' not found. Starting from ecosystem.config.js..."
            pm2 start ecosystem.config.js
        fi
    else
        if pm2 describe "$PM2_APP_NAME" > /dev/null 2>&1; then
            pm2 restart "$PM2_APP_NAME"
        else
            warn "PM2 process '$PM2_APP_NAME' not found. Starting it now..."
            pm2 start .next/standalone/server.js --name "$PM2_APP_NAME"
        fi
    fi
    pm2 save
else
    warn "PM2 not found. Falling back to nohup."
    warn "For production, install PM2: npm install -g pm2"
    pkill -f "node .next/standalone/server.js" || true
    nohup node .next/standalone/server.js > app.log 2>&1 &
    info "App started in background. PID: $!"
fi

log "Deployment complete!"
info "Your CRM should be available at: https://your-domain.com/crm"
