# دليل البدء السريع / Quick Start — Sahary Cloud

> **العربية:** شغّل Postgres و Redis، انسخ `backend/.env.example` إلى `backend/.env`،
> ثم `npx prisma migrate dev` و `npm run prisma:seed:dev`، وبعدها `npm run dev` في
> `backend/` و `frontend/`. اللوحة على `http://localhost:3001` والـ API على
> `http://localhost:3000`. التفاصيل الكاملة بالإنجليزية أدناه.

Local development setup for the **shared-hosting MVP**. Production deployment lives in [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md).

## Port conventions

| Service | Port | Notes |
|---|---|---|
| Backend API | `3000` | `PORT` in `backend/.env` |
| Frontend (Next.js) | `3001` | `next dev -p 3001` (fixed in `package.json`) |
| PostgreSQL | `5432` | platform database |
| Redis | `6379` | sessions / cache / JWT blacklist |
| MySQL | `3306` | customer databases — optional locally |

> Running several worktrees at once? Pick a different `PORT` / frontend port per worktree and point `CORS_ORIGIN` + `NEXT_PUBLIC_API_URL` at them so sessions don't collide.

## 1. Prerequisites

- Node.js 20 LTS, npm
- PostgreSQL 14+ and Redis 6+ reachable on localhost
- Docker Desktop (optional — `backend/docker-compose.dev.yml` runs Postgres + Redis for you)
- Stripe CLI (optional — only for webhook testing)

### Windows notes

- Everything below works in **PowerShell, cmd, or Git Bash** — no WSL required for app code.
- `npm run db:start` needs Docker Desktop; otherwise point `DATABASE_URL`/`REDIS_URL` at your own Postgres/Redis installs.
- nginx / pure-ftpd / certbot are **Linux-only** — hosting provisioning stays disabled locally (see §4); you don't need them to develop the panel, billing, or file manager.
- `docker-compose.dev.yml` maps Docker's named pipe on Windows (`//./pipe/docker_engine`) — set `DOCKER_HOST=npipe:////./pipe/docker_engine` if you ever run `ENABLE_VPS=true` locally. Otherwise leave it off.

## 2. Backend

```bash
cd backend
npm install
cp .env.example .env          # Windows: copy .env.example .env

# Postgres + Redis via Docker (skip if you have your own)
npm run db:start              # docker-compose -f docker-compose.dev.yml up -d

# Schema + seed
npx prisma migrate dev
npm run prisma:seed           # core only: system settings + Starter/Pro/Business plans
# …or for a populated dev environment:
npm run prisma:seed:dev       # adds demo user + VM plans + solar samples (dev only!)

npm run dev                   # tsx watch → http://localhost:3000
```

Seed notes:

- `prisma:seed` is **production-safe**: settings + hosting plans, idempotent, no credentials printed.
- Create a local admin by running it once with env vars (password ≥ 12 chars):
  ```bash
  # bash
  SEED_ADMIN_EMAIL=admin@local.dev SEED_ADMIN_PASSWORD='change-me-1234' npm run prisma:seed
  ```
  ```powershell
  # PowerShell
  $env:SEED_ADMIN_EMAIL='admin@local.dev'; $env:SEED_ADMIN_PASSWORD='change-me-1234'; npm run prisma:seed
  ```
- `prisma:seed:dev` additionally creates the demo user `demo@saharycloud.com / demo123` — **development only, never in production**.

## 3. Frontend

```bash
cd frontend
npm install
npm run dev                   # → http://localhost:3001
```

`frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:3000/api/v1
NEXT_PUBLIC_APP_URL=http://localhost:3001
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
NEXT_PUBLIC_ENABLE_VPS=false
```

Verify: `http://localhost:3001/test-api` and `http://localhost:3000/health`.

## 4. Hosting features locally

The provisioning drivers (nginx vhosts, MySQL, pure-ftpd, certbot) are Linux/host infra — locally they stay disabled and `/health` reports each as `"disabled"`. To exercise the **panel flows** (plan picker → account → file manager) without paying through Stripe, add to `backend/.env`:

```env
HOSTING_ALLOW_UNPAID_ACCOUNTS=true
```

This lets you create a hosting account without a paid Checkout. It is a dev/test escape hatch — env validation **refuses to boot in production** with it enabled.

If you do have MySQL/nginx/ftp available (Linux dev box or VM), flip the matching `HOSTING_*_ENABLED` flags and fill the required companion vars — validation will tell you what's missing (e.g. `HOSTING_MYSQL_ENABLED=true` requires `HOSTING_MYSQL_ADMIN_URL`).

## 5. Stripe (billing flows)

```env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...     # from stripe listen output (below)
```

Forward webhooks to the API with the Stripe CLI:

```bash
stripe listen --forward-to localhost:3000/api/v1/payments/webhook
```

Copy the `whsec_…` it prints into `STRIPE_WEBHOOK_SECRET` and restart the API. Required events (the CLI forwards all by default): `checkout.session.completed`, `customer.subscription.*`, `invoice.paid`/`invoice.payment_failed`, `payment_intent.*`, `charge.refunded`.

After changing plan prices in the seed (or creating new plans), push them to Stripe:

```bash
npm run stripe:sync-plans
```

## 6. Useful commands

```bash
# backend
npm run dev            # tsx watch
npm run typecheck      # tsc --noEmit
npm test               # jest
npm run lint           # eslint src/
npm run prisma:studio  # DB browser

# frontend
npm run dev            # next dev -p 3001
npm run lint
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| `P1001: Can't reach database` | `npm run db:start`, or fix `DATABASE_URL` |
| Redis connection refused | start Redis / `npm run db:start` |
| Boot aborts listing `HOSTING_*` | env validation — read the named key, fill the required companion var or disable the feature flag |
| `/api/v1/vms` → 404 | expected — `ENABLE_VPS=false` (VPS/VM product is out of MVP scope) |
| CORS error in browser | `CORS_ORIGIN` must equal the frontend origin (`http://localhost:3001`) |
| Webhook signature error | `STRIPE_WEBHOOK_SECRET` must match `stripe listen` output |
| Port already in use | another dev server/worktree holds 3000/3001 — use a different `PORT` (see conventions) |

---

For production deployment on Ubuntu 22.04/24.04 see [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md). Product scope: [mvp.md](./mvp.md).
