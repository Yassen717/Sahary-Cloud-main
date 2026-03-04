# Sahary Cloud — Production Deployment Guide

> **Last Updated:** 2026-03-04  
> **Stack:** Node.js 20 · Next.js 14 · PostgreSQL 15 · Redis 7 · Docker

---

## Table of Contents

1. [Infrastructure Requirements](#1-infrastructure-requirements)
2. [Server Setup](#2-server-setup)
3. [Environment Variables](#3-environment-variables)
4. [Database Setup](#4-database-setup)
5. [Running the Backend](#5-running-the-backend)
6. [Running the Frontend](#6-running-the-frontend)
7. [Reverse Proxy (nginx)](#7-reverse-proxy-nginx)
8. [SSL / HTTPS](#8-ssl--https)
9. [Health Checks & Monitoring](#9-health-checks--monitoring)
10. [Backup & Recovery](#10-backup--recovery)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. Infrastructure Requirements

| Component | Minimum | Recommended |
|---|---|---|
| CPU | 2 cores | 4+ cores |
| RAM | 4 GB | 8+ GB |
| Disk | 40 GB SSD | 100+ GB SSD |
| OS | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS |
| Docker | 24+ | Latest stable |
| Node.js | 20 LTS | 20 LTS |

**Required open ports:**

| Port | Service |
|---|---|
| 22 | SSH |
| 80 | HTTP (redirect to HTTPS) |
| 443 | HTTPS |
| 3000 | Backend API (internal only) |
| 3001 | Frontend (internal only) |
| 5432 | PostgreSQL (internal only) |
| 6379 | Redis (internal only) |

---

## 2. Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install Docker
sudo apt install -y docker.io docker-compose-v2
sudo usermod -aG docker $USER   # allow running docker without sudo
newgrp docker

# Install nginx
sudo apt install -y nginx certbot python3-certbot-nginx

# Clone the repository
git clone https://github.com/your-org/sahary-cloud.git /srv/sahary-cloud
cd /srv/sahary-cloud
```

---

## 3. Environment Variables

### Backend (`backend/.env`)

Copy the example file and fill in every value:

```bash
cp backend/.env.example backend/.env
nano backend/.env
```

**Critical values to set for production:**

```env
NODE_ENV=production
PORT=3000

# PostgreSQL — use a strong password
DATABASE_URL="postgresql://sahary_user:STRONG_PASSWORD@localhost:5432/sahary_cloud"

# Redis
REDIS_URL="redis://localhost:6379"
REDIS_PASSWORD="STRONG_REDIS_PASSWORD"

# Secrets — generate with: openssl rand -hex 64
JWT_SECRET="<64-byte-hex>"
JWT_REFRESH_SECRET="<64-byte-hex>"
SESSION_SECRET="<64-byte-hex>"

# Stripe (use live keys in production)
STRIPE_SECRET_KEY="sk_live_..."
STRIPE_PUBLISHABLE_KEY="pk_live_..."
STRIPE_WEBHOOK_SECRET="whsec_..."

# CORS — your actual frontend domain
CORS_ORIGIN="https://saharycloud.com"
FRONTEND_URL="https://saharycloud.com"
BACKEND_URL="https://api.saharycloud.com"

# Feature flags
ENABLE_SOLAR_MONITORING=true
ENABLE_PAYMENTS=true
ENABLE_EMAIL_NOTIFICATIONS=true
```

### Frontend (`frontend/.env.local`)

```bash
cp frontend/.env.local.example frontend/.env.local  # or create manually
```

```env
NEXT_PUBLIC_API_URL=https://api.saharycloud.com/api/v1
NEXT_PUBLIC_APP_URL=https://saharycloud.com
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
```

---

## 4. Database Setup

### Start PostgreSQL and Redis via Docker

```bash
cd backend
sudo docker compose -f docker-compose.dev.yml up -d postgres redis
```

### Run migrations

```bash
cd backend
npm install
npx prisma migrate deploy    # apply all migrations (no prompt)
npx prisma generate
```

### (Optional) Seed initial data

```bash
node prisma/seed.js
```

---

## 5. Running the Backend

### Option A — Direct (with PM2)

```bash
# Install PM2 globally
npm install -g pm2

cd backend
npm install --omit=dev

# Start with PM2
pm2 start src/index.js --name sahary-backend --instances 2 --exec-mode cluster

# Auto-restart on server reboot
pm2 startup
pm2 save
```

### Option B — systemd service

Create `/etc/systemd/system/sahary-backend.service`:

```ini
[Unit]
Description=Sahary Cloud Backend
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/srv/sahary-cloud/backend
ExecStart=/usr/bin/node src/index.js
Restart=on-failure
EnvironmentFile=/srv/sahary-cloud/backend/.env

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now sahary-backend
```

---

## 6. Running the Frontend

```bash
cd frontend
npm install --omit=dev
npm run build          # outputs to .next/
npm run start          # runs production server on port 3001
```

With PM2:

```bash
pm2 start npm --name sahary-frontend -- run start
pm2 save
```

---

## 7. Reverse Proxy (nginx)

Create `/etc/nginx/sites-available/saharycloud`:

```nginx
# Backend API
server {
    listen 80;
    server_name api.saharycloud.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}

# Frontend
server {
    listen 80;
    server_name saharycloud.com www.saharycloud.com;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/saharycloud /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

---

## 8. SSL / HTTPS

```bash
# Automatically configures nginx for HTTPS + auto-renewal
sudo certbot --nginx -d saharycloud.com -d www.saharycloud.com -d api.saharycloud.com

# Test auto-renewal
sudo certbot renew --dry-run
```

Certbot adds a cron job for auto-renewal at `/etc/cron.d/certbot`.

---

## 9. Health Checks & Monitoring

### Backend health endpoint

```bash
curl https://api.saharycloud.com/health
```

Expected response:

```json
{
  "status": "OK",
  "database": { "status": "healthy" },
  "redis": "connected",
  "docker": { "status": "healthy" }
}
```

### API documentation (dev only)

```
http://localhost:3000/api-docs
```

### PM2 monitoring

```bash
pm2 status          # process list
pm2 logs            # live logs
pm2 monit           # CPU/RAM dashboard
```

### Log files (Winston)

```
backend/logs/combined.log   — all logs
backend/logs/error.log      — errors only
backend/logs/http.log       — HTTP request log
```

---

## 10. Backup & Recovery

### Database backup

```bash
# Manual backup
sudo docker exec sahary-postgres pg_dump -U sahary_user sahary_cloud \
  | gzip > /backups/sahary_cloud_$(date +%Y%m%d_%H%M%S).sql.gz

# Automated daily backup (add to crontab)
0 2 * * * docker exec sahary-postgres pg_dump -U sahary_user sahary_cloud \
  | gzip > /backups/db_$(date +\%Y\%m\%d).sql.gz
```

### Database restore

```bash
gunzip < /backups/db_20260304.sql.gz \
  | sudo docker exec -i sahary-postgres psql -U sahary_user sahary_cloud
```

### Redis backup

Redis AOF persistence is enabled in the compose file — data is persisted to the `redis_data` Docker volume automatically.

---

## 11. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `connect EACCES /var/run/docker.sock` | User not in `docker` group | `sudo usermod -aG docker $USER && newgrp docker` |
| `P1001: Can't reach database` | PostgreSQL container stopped | `sudo docker compose up -d postgres` |
| `CORS error` in browser | `CORS_ORIGIN` mismatch | Update `CORS_ORIGIN` in `backend/.env` |
| `JWT_SECRET` warning on startup | Weak or missing secret | Generate with `openssl rand -hex 64` |
| Port 3000 already in use | Stale process | `lsof -i :3000` then `kill -9 <PID>` |
| Redis connection refused | Redis container stopped | `sudo docker compose up -d redis` |
| Prisma migration failed | Schema drift | `npx prisma migrate deploy` |

---

> For local development setup, see [DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md).  
> For integration details, see [INTEGRATION_STATUS.md](./INTEGRATION_STATUS.md).
