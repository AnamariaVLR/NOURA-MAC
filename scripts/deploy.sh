#!/usr/bin/env bash
#
# Deploys the pilot to Vercel production, in the order that cannot go wrong.
#
#   ./scripts/deploy.sh
#
# Everything it needs is in .env. It never prints a secret: values are piped
# into `vercel env add` from a variable, and only the NAME is echoed.
#
# Order matters and is the whole point of having a script:
#
#   1. push environment variables FIRST, because a build with no DATABASE_URL
#      fails at `prisma generate` and wastes a deploy;
#   2. run the migration against the production database BEFORE the deploy, so
#      the new code never meets an old schema;
#   3. seed, which is idempotent (upserts by slug and barcode);
#   4. deploy;
#   5. print the URL.
#
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "No .env. Copy .env.example and fill it in." >&2
  exit 1
fi

# shellcheck disable=SC1091
set -a; . ./.env; set +a

require() {
  local name="$1"
  if [ -z "${!name:-}" ]; then
    echo "Missing $name in .env" >&2
    exit 1
  fi
}

require DATABASE_URL
require ADMIN_PASSWORD

case "$DATABASE_URL" in
  postgresql://*|postgres://*) ;;
  *) echo "DATABASE_URL must be a postgresql:// URL to deploy (it is currently a local file)." >&2; exit 1 ;;
esac

echo "==> 1/5  Environment variables"
push_env() {
  local name="$1" value="${!1:-}"
  if [ -z "$value" ]; then
    echo "    $name — not set locally, skipping"
    return
  fi
  # `vercel env rm` is idempotent-ish: it fails when the variable is absent, and
  # that is fine. `|| true` keeps a first run from dying on a missing variable.
  vercel env rm "$name" production --yes >/dev/null 2>&1 || true
  printf '%s' "$value" | vercel env add "$name" production >/dev/null
  echo "    $name — set (${#value} characters)"
}

push_env DATABASE_URL
push_env ANTHROPIC_API_KEY
push_env ANTHROPIC_MODEL
push_env ADMIN_PASSWORD
push_env RATE_LIMIT_SALT
push_env BLOB_READ_WRITE_TOKEN

echo "==> 2/5  Migration"
npm run db:migrate

echo "==> 3/5  Seed"
npm run db:seed

echo "==> 4/5  Deploy"
vercel --prod --yes

echo "==> 5/5  Done"
vercel inspect --wait 2>/dev/null | grep -i "^  *url" || true
echo
echo "Next: npm run qr -- <the URL above>"
