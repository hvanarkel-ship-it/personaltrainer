#!/usr/bin/env bash
# Deploy Open Wearables to Railway
# Run this from YOUR OWN terminal (not the Claude Code sandbox)
# Prerequisites: railway CLI installed (npm i -g @railway/cli), logged in (railway login)

set -e

RAILWAY_TOKEN="38209b99-b110-4d71-a6dd-82d56ff74748"
export RAILWAY_TOKEN

echo "==> Creating Railway project: open-wearables"
railway init --name "open-wearables"

echo "==> Adding PostgreSQL"
railway add --plugin postgresql

echo "==> Adding Redis"
railway add --plugin redis

echo "==> Linking GitHub repo: the-momentum/open-wearables (backend)"
railway service create --name "backend"
railway variables set \
  ENVIRONMENT=production \
  SECRET_KEY=e0cdf1df4b50e4338dff0daa2cf05820386bc61b2bf34e4f9b949a8dd3d3a37c \
  ADMIN_EMAIL=admin@personaltrainerandcoach.app \
  ADMIN_PASSWORD=AnNiiihIrgzt_bSiqPRQ_w \
  SYNC_INTERVAL_SECONDS=300 \
  HISTORICAL_SYNC_ON_CONNECT=true \
  CORS_ORIGINS='["https://personaltrainerandcoach.netlify.app","http://localhost:8888"]' \
  SENTRY_ENABLED=false

echo ""
echo "==> Done scaffolding. Next steps:"
echo "    1. In Railway dashboard, link the 'backend' and 'worker' services to:"
echo "       GitHub repo: the-momentum/open-wearables"
echo "       Backend root dir:  ./backend    (start: uvicorn app.main:app --host 0.0.0.0 --port 8000)"
echo "       Worker  root dir:  ./backend    (start: celery -A app.celery_app worker --loglevel=info)"
echo "       Beat    root dir:  ./backend    (start: celery -A app.celery_app beat --loglevel=info)"
echo "    2. Railway auto-fills DB_* and REDIS_* from the plugins — wire them in Variables tab:"
echo "       DB_HOST     = \${{Postgres.PGHOST}}"
echo "       DB_PORT     = \${{Postgres.PGPORT}}"
echo "       DB_NAME     = \${{Postgres.PGDATABASE}}"
echo "       DB_USER     = \${{Postgres.PGUSER}}"
echo "       DB_PASSWORD = \${{Postgres.PGPASSWORD}}"
echo "       REDIS_HOST  = \${{Redis.REDISHOST}}"
echo "       REDIS_PORT  = \${{Redis.REDISPORT}}"
echo "    3. Copy the backend's public URL, then set in your Netlify dashboard:"
echo "       OPENWEARABLES_API_URL = https://<your-backend>.up.railway.app"
echo "       OPENWEARABLES_API_KEY = (from OW admin portal → Credentials)"
