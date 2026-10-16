# Sahary Cloud — Production Deployment Guide

> **Stack:** Node.js 20 · Next.js 14 · PostgreSQL 15 · Redis 7 · MySQL 8 · nginx · pure-ftpd · certbot
> **Target OS:** Ubuntu 22.04 LTS or 24.04 LTS
> **Product:** Shared web hosting (static sites) — subdomain + custom domain + SSL + MySQL + FTP + web file manager + usage metering + Stripe subscriptions + admin panel.

The Docker-based VPS/VM product remains in the codebase but is **out of scope for this MVP**. It is disabled by default via `ENABLE_VPS=false`; leave it disabled.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Server Preparation](#2-server-preparation)
3. [Directory Layout & Permissions](#3-directory-layout--permissions)
4. [nginx Configuration](#4-nginx-configuration)
5. [DNS](#5-dns)
6. [TLS Certificates](#6-tls-certificates)
7. [MySQL (Customer Databases)](#7-mysql-customer-databases)
8. [pure-ftpd (Customer FTP)](#8-pure-ftpd-customer-ftp)
9. [Platform Database & Cache](#9-platform-database--cache)
10. [Application Build & Runtime](#10-application-build--runtime)
11. [Environment Variables](#11-environment-variables)
12. [Stripe](#12-stripe)
13. [First-Run Checklist](#13-first-run-checklist)
14. [Health Checks & Monitoring](#14-health-checks--monitoring)
15. [Backups](#15-backups)
16. [Security Hardening](#16-security-hardening)
17. [Troubleshooting](#17-troubleshooting)

---

## 1. Architecture Overview

```
                         ┌──────────────────────── Ubuntu host ────────────────────────┐
 Internet ── :80/:443 ──▶│ nginx                                                        │
                         │  ├─ <user>.<base domain>  → /var/www/<accountId>/public_html │
                         │  ├─ custom domains        → per-account docroots (static)    │
                         │  ├─ /.well-known/acme-challenge/ → /var/www/_acme            │
                         │  ├─ api.<domain>          → 127.0.0.1:3000 (Express API)     │
                         │  └─ <domain>/panel        → 127.0.0.1:3001 (Next.js)         │
                         │                                                              │
   FTP clients ── :21 ──▶│ pure-ftpd (virtual users, PureDB, chroot to docroot)          │
                         │                                                              │
                         │ Node.js API ──▶ PostgreSQL (platform data)                    │
                         │            ──▶ Redis (sessions, cache, JWT blacklist, queues)│
                         │            ──▶ MySQL (per-account customer databases)        │
                         │            ──▶ certbot / pure-pw / nginx (provisioning)      │
                         └──────────────────────────────────────────────────────────────┘
```

- **nginx** terminates TLS and serves customer static sites directly from per-account docroots. It also reverse-proxies the API and the control-panel frontend.
- **The Node API** writes/removes nginx vhost files, runs `nginx -t` and `nginx -s reload`, provisions MySQL databases/users, manages pure-ftpd virtual users via `pure-pw`, and drives certbot for custom-domain certificates.
- **Wildcard TLS** (`*.<base domain>`) covers platform subdomains; custom domains get per-domain certificates via the ACME webroot.
- **Stripe** bills subscriptions; webhooks must reach `POST /api/v1/payments/webhook`.
- **Background jobs** (metering, SSL renewal, reconcile, retention) run inside the API process when `HOSTING_JOBS_ENABLED=true` (default).

## 2. Server Preparation

Minimum: 2 CPU / 4 GB RAM / 60 GB SSD. Recommended: 4 CPU / 8 GB RAM / 100+ GB SSD.

```bash
sudo apt update && sudo apt upgrade -y

# Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Web / hosting stack
sudo apt install -y nginx mysql-server pure-ftpd \
  certbot python3-certbot-nginx ufw

# Platform database + cache
sudo apt install -y postgresql redis-server

# Build tools (node-gyp for native deps) + PM2
sudo apt install -y build-essential
sudo npm install -g pm2
```

### Users

```bash
# Unprivileged user that runs the API and owns customer files
sudo useradd --system --home /var/www --shell /usr/sbin/nologin sahary

# FTP virtual users map to a single system account
sudo groupadd ftpgroup
sudo useradd --system --gid ftpgroup --home /var/www --shell /usr/sbin/nologin ftpuser

# nginx worker group — lets the API hand group-readable/writable files to nginx
sudo usermod -aG www-data sahary
```

### Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'            # 80 + 443
sudo ufw allow 21/tcp                  # FTP control
sudo ufw allow 30000:31000/tcp         # FTP passive range (see §8)
sudo ufw enable
```

API (:3000), frontend (:3001), PostgreSQL (:5432), Redis (:6379), and MySQL (:3306) all bind to localhost only — never expose them.

## 3. Directory Layout & Permissions

```
/var/www/
├── _acme/                        # ACME webroot for custom-domain certs (HOSTING_ACME_WEBROOT)
├── .trash/                       # terminated accounts' data, purged after HOSTING_RETENTION_DAYS
└── <accountId>/
    └── public_html/              # account document root (nginx serves this)
```

The docroot pattern is `HOSTING_WWW_BASE/<accountId>/public_html` — set by `accountDocumentRoot()` in the backend and served by the generated nginx vhost.

```bash
sudo mkdir -p /var/www/_acme /var/www/.trash
sudo chown -R sahary:www-data /var/www
sudo chmod 2775 /var/www           # setgid so account dirs inherit www-data group
sudo chmod 750 /var/www/_acme
sudo chmod 700 /var/www/.trash
```

**Rules**

- Customer files are owned `sahary:www-data`, dirs `2770`, files `640` — nginx reads via the `www-data` group; customers never get OS users.
- FTP virtual users run as `ftpuser:ftpgroup`; keep docroot group `www-data` and add `ftpuser` to it: `sudo usermod -aG www-data ftpuser`, or run FTP uploads as `sahary` via the PureDB uid/gid columns (see §8).
- Run the API with umask `0027` so files it creates (vhost configs, index pages, uploads) are group-readable but never world-readable. With systemd: `UMask=0027` in the unit; with PM2: `umask 0027` in the start wrapper.
- `/var/www/.trash` is only touched by the API's retention job — keep it `700 sahary:sahary`.
- Log directory for per-site traffic (consumed by the metering job):
  `sudo mkdir -p /var/log/nginx/sahary && sudo chown root:adm /var/log/nginx/sahary && sudo chmod 750 /var/log/nginx/sahary`

The API also needs write access to the nginx vhost directories:

```bash
sudo mkdir -p /etc/nginx/sites-staging
sudo chgrp -R www-data /etc/nginx/sites-available /etc/nginx/sites-enabled /etc/nginx/sites-staging
sudo chmod -R g+w /etc/nginx/sites-available /etc/nginx/sites-enabled /etc/nginx/sites-staging
```

…and permission to run `nginx -t` and `nginx -s reload`. Grant a narrow sudoers entry to the `sahary` user (create `/etc/sudoers.d/sahary-nginx`):

```
sahary ALL=(root) NOPASSWD: /usr/sbin/nginx -t, /usr/sbin/nginx -s reload
```

`sudo chmod 440 /etc/sudoers.d/sahary-nginx`

## 4. nginx Configuration

In the `http {}` block of `/etc/nginx/nginx.conf` (or a file in `/etc/nginx/conf.d/`):

```nginx
# Per-site traffic accounting — the hosting meter job parses these logs.
log_format sahary_bytes '$time_iso8601 $bytes_sent';

# Ubuntu's default nginx.conf already includes sites-enabled — keep it.
include /etc/nginx/sites-enabled/*;

# Staging dir: the API drops a candidate vhost here, runs `nginx -t` so the
# candidate is actually parsed, then removes it before enabling the vhost.
include /etc/nginx/sites-staging/*;
```

Access logs for customer sites are written under `HOSTING_NGINX_LOG_DIR` (default `/var/log/nginx/sahary`) using the `sahary_bytes` format — the metering job reads `$bytes_sent` per site for usage metering. Rotate them like normal nginx logs (logrotate already covers `/var/log/nginx`).

The API writes one `<primary-domain>.conf` per hosting account into `sites-available`, symlinks it into `sites-enabled`, runs `nginx -t`, then `nginx -s reload`. A failed test rolls the vhost back — a broken config never stays enabled.

### ACME challenge snippet

Create `/etc/nginx/snippets/acme-challenge.conf`:

```nginx
location /.well-known/acme-challenge/ {
    root /var/www/_acme;
}
```

Platform vhosts include this snippet on `:80` so certbot can validate custom domains over HTTP-01 without touching site files. (`HOSTING_ACME_WEBROOT` points at the same directory.)

## 5. DNS

| Record | Value | Purpose |
|---|---|---|
| `A` — `<base domain>` | server IP | panel apex / bare domain |
| `A` — `*.<base domain>` | server IP | all platform subdomains (`<user>.<base domain>`) |
| `A` — `api.<base domain>` | server IP | API endpoint (or serve API on the apex) |
| `A` — `ftp.<base domain>` | server IP | FTP endpoint (`HOSTING_FTP_PUBLIC_HOST`) |

Customers point their own domains at the server IP; the platform then issues a per-domain certificate (§6).

## 6. TLS Certificates

### Wildcard (platform subdomains)

`*.sahary.cloud`-style certs **require DNS-01 validation**. Issue once with a DNS plugin for your provider, or manually:

```bash
sudo certbot certonly --manual --preferred-challenges dns \
  -d sahary.cloud -d '*.sahary.cloud' \
  --agree-tos -m admin@sahary.cloud
```

Manual DNS-01 certs cannot auto-renew — in production use a certbot DNS plugin (e.g. `python3-certbot-dns-cloudflare`, `python3-certbot-dns-route53`) so `certbot renew` works unattended. Point `HOSTING_WILDCARD_CERT_PATH` / `HOSTING_WILDCARD_KEY_PATH` at the issued files (e.g. `/etc/letsencrypt/live/sahary.cloud/fullchain.pem` and `privkey.pem`) and reference them from the wildcard server block.

### Custom domains (HTTP-01 webroot)

For customer domains the API runs certbot against the webroot:

```bash
sudo certbot certonly --webroot -w /var/www/_acme \
  -d customer.example --agree-tos -m admin@sahary.cloud
```

The API invokes `HOSTING_CERTBOT_BIN` (default `certbot`) with that webroot; live certs land under `HOSTING_LETSENCRYPT_LIVE_DIR` (default `/etc/letsencrypt/live`). Set `HOSTING_LETSENCRYPT_STAGING=true` while testing to avoid rate limits, then flip to `false`.

The API's certbot + nginx operations need sudoers rights beyond §3 — extend `/etc/sudoers.d/sahary-nginx` if your certbot/renew commands must run as root:

```
sahary ALL=(root) NOPASSWD: /usr/sbin/nginx -t, /usr/sbin/nginx -s reload, /usr/bin/certbot certonly, /usr/bin/certbot renew
```

## 7. MySQL (Customer Databases)

Install and secure:

```bash
sudo apt install -y mysql-server
sudo mysql_secure_installation
```

Create a **least-privilege provisioning user** for the API. Account MySQL users and databases are named `sc<accountHash>` / `sc<accountHash>_<label>` (see `hostingNaming.ts`), so every customer object matches the `sc\_%` prefix:

```sql
CREATE USER 'sahary_provision'@'localhost' IDENTIFIED BY 'STRONG_RANDOM_PASSWORD';

-- Create and drop per-account databases (all customer DBs are named sc_%)
GRANT CREATE, DROP, ALTER, INDEX ON `sc\_%`.* TO 'sahary_provision'@'localhost';

-- Let it grant per-account users ALL PRIVILEGES on their own database only
GRANT ALL PRIVILEGES ON `sc\_%`.* TO 'sahary_provision'@'localhost' WITH GRANT OPTION;

-- CREATE USER is global in MySQL and also covers DROP USER
GRANT CREATE USER ON *.* TO 'sahary_provision'@'localhost';

FLUSH PRIVILEGES;
```

This user can only touch `sc_%` databases and create/drop users — it cannot read platform or system data.

Set `HOSTING_MYSQL_ADMIN_URL` to a **mysql:// connection URL** for this account (required when `HOSTING_MYSQL_ENABLED=true`):

```env
HOSTING_MYSQL_ENABLED=true
HOSTING_MYSQL_ADMIN_URL="mysql://sahary_provision:STRONG_RANDOM_PASSWORD@127.0.0.1:3306/mysql"
HOSTING_MYSQL_PUBLIC_HOST="localhost"
HOSTING_MYSQL_PUBLIC_PORT=3306
HOSTING_MYSQL_USER_HOST="%"
```

`HOSTING_MYSQL_USER_HOST` is the host part of created customer users (`'user'@'<HOST>'`). Use `localhost` if customers never connect remotely; `%` matches MySQL shared-hosting convention. Keep `mysql` bound to `127.0.0.1` unless remote DB access is a deliberate product feature.

## 8. pure-ftpd (Customer FTP)

FTP uses **virtual users** — customers get pure-ftpd accounts mapped to one system user (`ftpuser:ftpgroup`), chrooted into their docroot. No OS accounts per customer.

```bash
# PureDB authentication: read virtual users from the passwd file, look them up
# in the compiled PureDB database, and chroot everyone.
sudo ln -s /etc/pure-ftpd/conf/PureDB /etc/pure-ftpd/auth/50puredb 2>/dev/null || true
echo "/etc/pure-ftpd/pureftpd.pdb" | sudo tee /etc/pure-ftpd/conf/PureDB
echo "yes"                     | sudo tee /etc/pure-ftpd/conf/ChrootEveryone
echo "yes"                     | sudo tee /etc/pure-ftpd/conf/NoAnonymous
echo "yes"                     | sudo tee /etc/pure-ftpd/conf/CreateHomeDir
echo "30000 31000"             | sudo tee /etc/pure-ftpd/conf/PassivePortRange
echo "2"                       | sudo tee /etc/pure-ftpd/conf/TLS   # TLS optional→required when certs exist

sudo systemctl restart pure-ftpd
```

### Virtual-user lifecycle (what the API runs via `HOSTING_FTP_PUREPW_BIN`)

```bash
# Provision — uid/gid map to the FTP system user; home = account docroot
pure-pw useradd sc_user1 -u ftpuser -g ftpgroup -d /var/www/<accountId>/public_html
# Rotate password
pure-pw passwd sc_user1
# Suspend / remove
pure-pw usermod sc_user1 -e      # expire account  (-E re-enables)
pure-pw userdel sc_user1

# Rebuild the PureDB after ANY change — the API does this every time
pure-pw mkdb /etc/pure-ftpd/pureftpd.pdb -f /etc/pure-ftpd/pureftpd.passwd
```

`HOSTING_FTP_PASSWD_FILE` and `HOSTING_FTP_PDB_FILE` must point at those two files — env validation fails if `HOSTING_FTP_DRIVER=pureftpd` and either path is empty. Open TCP 21 plus the passive range (30000–31000) in the firewall (§2). With `HOSTING_FTP_DRIVER=none` the FTP features return 503s and `/health` reports `ftp: "disabled"`.

## 9. Platform Database & Cache

PostgreSQL holds users, hosting accounts, plans, invoices, domains, usage. Redis holds sessions, cache, rate-limit counters, and the JWT blacklist.

```bash
sudo -u postgres createuser sahary_user
sudo -u postgres createdb sahary_cloud -O sahary_user
sudo -u postgres psql -c "ALTER USER sahary_user WITH PASSWORD 'STRONG_DB_PASSWORD';"
```

```env
DATABASE_URL="postgresql://sahary_user:STRONG_DB_PASSWORD@127.0.0.1:5432/sahary_cloud"
REDIS_URL="redis://127.0.0.1:6379"
REDIS_PASSWORD=""
```

If you password-protect Redis (`requirepass`), put it in `REDIS_PASSWORD` or the URL. Bind both services to localhost.

## 10. Application Build & Runtime

```bash
sudo mkdir -p /srv/sahary-cloud && sudo chown sahary:sahary /srv/sahary-cloud
sudo -u sahary git clone <repo-url> /srv/sahary-cloud
cd /srv/sahary-cloud

cd backend && npm ci && npm run build:ts     # compiles src/ → dist/
cd ../frontend && npm ci && npm run build    # Next.js production build
```

### Backend — systemd (recommended)

`/etc/systemd/system/sahary-api.service`:

```ini
[Unit]
Description=Sahary Cloud API
After=network.target postgresql.service redis-server.service mysql.service

[Service]
Type=simple
User=sahary
Group=sahary
WorkingDirectory=/srv/sahary-cloud/backend
EnvironmentFile=/srv/sahary-cloud/backend/.env
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
RestartSec=5
UMask=0027

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now sahary-api
```

### Backend — PM2 (alternative)

```bash
# run from a shell with umask 0027
cd /srv/sahary-cloud/backend
pm2 start dist/index.js --name sahary-api
pm2 startup systemd -u sahary --hp /var/www
pm2 save
```

> The compiled entry point is `dist/index.js` — **not** `src/index.js` (the backend is TypeScript; sources no longer run directly).

### Frontend

```ini
# /etc/systemd/system/sahary-web.service — same pattern
ExecStart=/usr/bin/npm --prefix /srv/sahary-cloud/frontend run start
# …or: pm2 start npm --name sahary-web --prefix /srv/sahary-cloud/frontend -- run start
```

### Public vhosts

```nginx
# /etc/nginx/sites-available/sahary-panel
server {
    listen 443 ssl http2;
    server_name sahary.cloud www.sahary.cloud;

    ssl_certificate     /etc/letsencrypt/live/sahary.cloud/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/sahary.cloud/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 443 ssl http2;
    server_name api.sahary.cloud;

    ssl_certificate     /etc/letsencrypt/live/sahary.cloud/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/sahary.cloud/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## 11. Environment Variables

Copy `backend/.env.example` → `backend/.env`. The API validates the file on boot (`env.validation.ts`) and refuses to start on missing/invalid values.

### Core

| Variable | Default | Notes |
|---|---|---|
| `NODE_ENV` | `development` | `production` in prod — enables stricter checks |
| `PORT` / `HOST` | `3000` / `localhost` | bind 127.0.0.1 behind nginx |
| `DATABASE_URL` | — | PostgreSQL platform DB (**required**) |
| `REDIS_URL` / `REDIS_PASSWORD` | `redis://localhost:6379` / empty | |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` / `SESSION_SECRET` | — | generate with `openssl rand -hex 64` |
| `JWT_EXPIRE` / `JWT_REFRESH_EXPIRE` | `30d` / `7d` | |
| `SMTP_HOST/PORT/SECURE/USER/PASS` | — | welcome/reset/invoices mail |
| `FROM_EMAIL` / `FROM_NAME` | `noreply@saharycloud.com` / `Sahary Cloud` | |
| `CORS_ORIGIN` | `http://localhost:3001` | panel origin, e.g. `https://sahary.cloud` |
| `FRONTEND_URL` / `BACKEND_URL` | `http://localhost:3001` / `:3000` | used in links/emails |

### Feature flags

| Variable | Default | Notes |
|---|---|---|
| `ENABLE_VPS` | `false` | Docker/VM product. **Leave `false`** — when off, `/api/v1/vms` + `/api/v1/docker` return 404, the Docker daemon is never contacted, the terminal WebSocket isn't mounted, VM usage/invoice jobs don't run, and `/health` reports `docker: "disabled"`. |
| `ENABLE_SOLAR_MONITORING` | `true` | solar demo data feed (irrelevant on a hosting node — set `false`) |
| `ENABLE_PAYMENTS` | `true` | Stripe billing |
| `ENABLE_EMAIL_NOTIFICATIONS` | `true` | |

### Hosting — `HOSTING_*` (every key the backend reads, defaults in `config/hosting.ts`)

| Variable | Default | Notes |
|---|---|---|
| `HOSTING_BASE_DOMAIN` | `sahary.cloud` | platform subdomains are `<user>.<HOSTING_BASE_DOMAIN>` |
| `HOSTING_WWW_BASE` | `/var/www` | docroots: `<wwwBase>/<accountId>/public_html` |
| `HOSTING_TRASH_DIR` | `${HOSTING_WWW_BASE}/.trash` | purge target for terminated accounts |
| `HOSTING_ALLOW_UNPAID_ACCOUNTS` | `false` | **must be `false` in production** — validation fails otherwise |
| `HOSTING_JOBS_ENABLED` | `true` | metering/SSL/reconcile/retention jobs |
| `HOSTING_RETENTION_DAYS` | `7` | trash purge window |
| `HOSTING_SUSPENDED_RETENTION_DAYS` | `30` | suspended → terminated |
| `HOSTING_PAST_DUE_GRACE_DAYS` | `7` | past-due → suspended |
| `HOSTING_NGINX_ENABLED` | `false` | master switch for vhost provisioning |
| `HOSTING_NGINX_SITES_AVAILABLE` | `/etc/nginx/sites-available` | |
| `HOSTING_NGINX_SITES_ENABLED` | `/etc/nginx/sites-enabled` | |
| `HOSTING_NGINX_STAGING_DIR` | `/etc/nginx/sites-staging` | candidate configs parsed here by `nginx -t` |
| `HOSTING_NGINX_LOG_DIR` | `/var/log/nginx/sahary` | per-site `sahary_bytes` logs for metering |
| `HOSTING_MYSQL_ENABLED` | `false` | **requires `HOSTING_MYSQL_ADMIN_URL` when `true`** |
| `HOSTING_MYSQL_ADMIN_URL` | empty | `mysql://sahary_provision:***@127.0.0.1:3306/mysql` |
| `HOSTING_MYSQL_PUBLIC_HOST` | `localhost` | host shown to customers in the panel |
| `HOSTING_MYSQL_PUBLIC_PORT` | `3306` | |
| `HOSTING_MYSQL_USER_HOST` | `%` | `'user'@'<host>'` of created customer users |
| `HOSTING_FTP_DRIVER` | `none` | `none` or `pureftpd` |
| `HOSTING_FTP_PUBLIC_HOST` | `ftp.<base domain>` | shown in the panel |
| `HOSTING_FTP_PORT` | `21` | |
| `HOSTING_FTP_SYSTEM_USER` / `HOSTING_FTP_SYSTEM_GROUP` | `ftpuser` / `ftpgroup` | uid/gid mapped in `pure-pw useradd` |
| `HOSTING_FTP_PUREPW_BIN` | `pure-pw` | |
| `HOSTING_FTP_PASSWD_FILE` | `/etc/pure-ftpd/pureftpd.passwd` | **required when driver is `pureftpd`** |
| `HOSTING_FTP_PDB_FILE` | `/etc/pure-ftpd/pureftpd.pdb` | **required when driver is `pureftpd`** |
| `HOSTING_SSL_ENABLED` | `false` | **requires `HOSTING_LETSENCRYPT_EMAIL` when `true`** |
| `HOSTING_CERTBOT_BIN` | `certbot` | |
| `HOSTING_ACME_WEBROOT` | `/var/www/_acme` | HTTP-01 webroot for custom domains |
| `HOSTING_LETSENCRYPT_EMAIL` | empty | registration/recovery email |
| `HOSTING_LETSENCRYPT_STAGING` | `false` | `true` while testing — avoids rate limits |
| `HOSTING_LETSENCRYPT_LIVE_DIR` | `/etc/letsencrypt/live` | |
| `HOSTING_WILDCARD_CERT_PATH` / `HOSTING_WILDCARD_KEY_PATH` | empty | `*.` cert for platform subdomains |
| `HOSTING_UPLOAD_MAX_MB` | `50` | file manager upload cap |
| `HOSTING_TEXT_EDIT_MAX_KB` | `1024` | inline text-editor cap |
| `HOSTING_METER_CRON` | `0 * * * *` | hourly usage metering |
| `HOSTING_SSL_CRON` | `*/10 * * * *` | pending-cert issue/renewal poll |
| `HOSTING_RECONCILE_CRON` | `15 */6 * * *` | state reconciliation |
| `HOSTING_RETENTION_CRON` | `30 3 * * *` | nightly retention/purge |

### Stripe

| Variable | Notes |
|---|---|
| `STRIPE_SECRET_KEY` | `sk_live_…` in production |
| `STRIPE_PUBLISHABLE_KEY` | `pk_live_…` |
| `STRIPE_WEBHOOK_SECRET` | from `stripe listen` output or the dashboard webhook |

Frontend (`frontend/.env.local`): `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_ENABLE_VPS=false`.

## 12. Stripe

### Webhook endpoint

```
POST https://api.<base domain>/api/v1/payments/webhook
```

Create a webhook in **Dashboard → Developers → Webhooks** (or `stripe listen` in dev) and subscribe to **exactly** these events:

```
checkout.session.completed
customer.subscription.updated
customer.subscription.deleted
invoice.paid
invoice.payment_failed
payment_intent.succeeded
payment_intent.payment_failed
charge.refunded
```

Copy the signing secret into `STRIPE_WEBHOOK_SECRET`. The route receives the raw body before `express.json()` runs and is excluded from rate limiting — signature verification happens inside `billingService`.

### Dunning / Smart Retries

Enable **Smart Retries** in Dashboard → Settings → Billing → Subscriptions and emails (recover failed payments, retry schedule, failed-payment emails). The `invoice.payment_failed` event drives the platform's `past_due → suspended → terminated` ladder (`HOSTING_PAST_DUE_GRACE_DAYS`, `HOSTING_SUSPENDED_RETENTION_DAYS`); Stripe retries + dunning emails recover cards before suspension.

### Sync plan prices

After seeding plans, push each `HostingPlan` to Stripe products/prices:

```bash
cd backend
npm run stripe:sync-plans
```

(the script writes `stripeProductId`/`stripePriceId` back to each plan — re-run it whenever plan prices change).

## 13. First-Run Checklist

```bash
# 1. Apply migrations
cd /srv/sahary-cloud/backend
npx prisma migrate deploy

# 2. Core seed — settings + hosting plans only, production-safe, idempotent
SEED_ADMIN_EMAIL="admin@sahary.cloud" \
SEED_ADMIN_PASSWORD="$(openssl rand -base64 18)" \
npm run prisma:seed
#    → writes the SUPER_ADMIN login to stdout ONCE — store it in the vault.
#      (omitting SEED_ADMIN_* creates no admin; password must be ≥ 12 chars)

# 3. Push plan prices to Stripe
npm run stripe:sync-plans

# 4. Start services
sudo systemctl enable --now sahary-api sahary-web

# 5. Smoke test
curl -fsS https://api.sahary.cloud/health | jq .
curl -fsS -X POST https://api.sahary.cloud/api/v1/payments/webhook \
  -H 'Stripe-Signature: test' -d '{}' || true   # expect a signature error, not 404
#    register a test user in the panel, subscribe with Stripe test card
#    (or set HOSTING_ALLOW_UNPAID_ACCOUNTS=true ONLY for the smoke test),
#    then verify: vhost file exists, docroot created, /health all "ok".
```

Never run `npm run prisma:seed:dev` (`SEED_DEMO_DATA=true`) in production — it creates demo data with well-known credentials.

## 14. Health Checks & Monitoring

`GET /health` returns overall `OK`/`DEGRADED` and per-subsystem detail:

```json
{
  "status": "DEGRADED",
  "database": "ok",
  "redis": "ok",
  "docker": "disabled",
  "hosting": { "nginx": "ok", "mysql": "ok", "ftp": "disabled", "ssl": "error", "disk": { "freeGB": 42 } }
}
```

- Hosting checks run only for enabled features (`disabled`/`ok`/`error` each).
- The nginx check is `nginx -t`, cached 60s — it never reloads.
- Hosting problems degrade `status` but the endpoint always answers HTTP 200 — monitor the `status` field, not the HTTP code.
- Production responses strip filesystem paths/secrets.

Also monitor: `pm2 status`/`systemctl status`, `backend/logs/*.log` (Winston), nginx error log, `certbot renew --dry-run`, disk free on `/var/www`.

## 15. Backups

```bash
# Platform DB (PostgreSQL)
pg_dump "postgresql://sahary_user:PASS@127.0.0.1:5432/sahary_cloud" | gzip > /backups/pg_$(date +%F).sql.gz

# Customer databases (MySQL) — every sc_% schema
for db in $(mysql -NBe "SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'sc\_%'"); do
  mysqldump --single-transaction "$db" | gzip > "/backups/mysql_${db}_$(date +%F).sql.gz"
done

# Customer files + trash (not yet purged)
rsync -a /var/www/ /backups/www/            # includes /var/www/.trash

# Config
rsync -a /etc/nginx/sites-available /etc/letsencrypt /etc/pure-ftpd /backups/etc/
```

Schedule via cron daily; ship `/backups` off-host (S3/rsync). Restore: `gunzip -c pg_*.sql.gz | psql "$DATABASE_URL"`, `mysqldump` files per-DB, `rsync` files back into `/var/www`.

## 16. Security Hardening

- `sahary` runs unprivileged (`nologin`, no sudo except the nginx/certbot whitelist in §3/§6). Never run the API as root — it would hand root file access to every HTTP bug.
- Keep `HOSTING_ALLOW_UNPAID_ACCOUNTS=false` in prod (env validation enforces this — boot fails if `true`).
- Keep `ENABLE_VPS=false`; enabling it mounts Docker routes and starts VM jobs — not part of this MVP.
- Rotate all secrets before launch (`JWT_*`, `SESSION_SECRET`, DB/Redis/MySQL/Stripe/SMTP). Never reuse dev values.
- Restrict MySQL `sahary_provision` to `sc_%` objects only (§7) and bind MySQL/Postgres/Redis/API to localhost.
- FTP: `ChrootEveryone`, no anonymous login, enable TLS (`echo 2 > conf/TLS`) once certs exist.
- Secrets in `backend/.env` must be `600 sahary:sahary`; never commit it.
- UFW: only 22/80/443/21/30000-31000 open.
- `/health` output is stripped in production; `/api-docs` is dev-only.

## 17. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `/health` → `nginx: "error"` | bad staged vhost or perms | `sudo nginx -t`; check `sites-staging` contents and `www-data` group write on sites dirs |
| `/health` → `mysql: "error"` | `HOSTING_MYSQL_ADMIN_URL` wrong/unreachable | `mysql "$(echo $HOSTING_MYSQL_ADMIN_URL)" -e 'SELECT 1'` |
| `/health` → `ftp: "error"` | pure-ftpd down or PureDB stale | `systemctl status pure-ftpd`; re-run `pure-pw mkdb …` |
| `/health` → `ssl: "error"` | certbot failure / missing email | check `HOSTING_LETSENCRYPT_EMAIL`, run `certbot certificates` |
| `/health` → `status: DEGRADED` (200) | one hosting check failing | normal — degraded ≠ down; inspect `hosting.*` fields |
| Customer site 404s | vhost not enabled or DNS not pointing | `ls /etc/nginx/sites-enabled`, `dig user.sahary.cloud` |
| Vhost write fails | perms on sites dirs | §3 — `www-data` group write + sudoers entry |
| `nginx -s reload` EACCES | missing sudoers line | `/etc/sudoers.d/sahary-nginx` (§3) |
| FTP login rejected | PureDB not rebuilt | `pure-pw mkdb /etc/pure-ftpd/pureftpd.pdb -f /etc/pure-ftpd/pureftpd.passwd` |
| FTP connects, drops on PASV | passive ports blocked | `ufw allow 30000:31000/tcp` |
| Certbot fails on custom domain | DNS not propagated / webroot unreachable | `dig domain`, test `/.well-known/acme-challenge/test` over http |
| Stripe webhook 400 | wrong `STRIPE_WEBHOOK_SECRET` | re-copy signing secret for the endpoint |
| Seed creates no admin | `SEED_ADMIN_*` unset or password < 12 chars | set both vars; rerun `npm run prisma:seed` |
| `/api/v1/vms` → 404 `VPS hosting is not enabled` | expected — `ENABLE_VPS=false` | leave disabled for the hosting MVP |
| Env validation aborts boot | failed conditional rule | read startup error — it names the offending `HOSTING_*` key |

---

> Local development: [QUICK_START.md](./QUICK_START.md). Product scope: [mvp.md](./mvp.md).
