# Critical Tasks - Sahary Cloud Platform

---

## ⚠️ MVP PIVOT — March 2026

**New direction: Shared Web Hosting (not VPS/VM).**

The platform is pivoting to focus on **shared web hosting** as the MVP product. Docker-based VM management is being deferred. The core value proposition is: affordable, solar-powered shared hosting with a clean control panel.

**What this means for open tasks:**
- Tasks marked `🚫 POST-MVP` are deferred — do not work on them until core hosting is shipped.
- Tasks marked `✅ KEEP` remain relevant for the shared hosting MVP.
- See [`docs/mvp.md`](./mvp.md) for the definitive MVP feature list and roadmap.

---

## 🎯 Priority 0: Shared Hosting Core (MVP — BUILD THESE FIRST)

### 0.0 Backend TypeScript Staged Migration
**Status:** ⚠️ In Progress — Phase 2 Started (2026-03-15)
**Priority:** HIGH (Engineering Enablement)

**Phase 1 Completed:**
- ✅ Added backend TypeScript toolchain and `tsconfig.json`
- ✅ Added scripts: `typecheck`, `typecheck:watch`, `build:ts`, `dev:ts`, `start:ts`
- ✅ Kept runtime unchanged (`node src/index.js`) to avoid delivery risk
- ✅ Added migration roadmap in `backend/TYPESCRIPT_MIGRATION_PLAN.md`
- ✅ Added docs-level migration plan in [`docs/BACKEND_TYPESCRIPT_MIGRATION_PLAN.md`](./BACKEND_TYPESCRIPT_MIGRATION_PLAN.md)

**Phase 2 Progress:**
- ✅ Added backend OpenAPI export script (`backend`: `npm run openapi:export`)
- ✅ Added frontend generated type pipeline (`frontend`: `npm run api:types:generate`)
- ✅ Added contract drift gate command (`frontend`: `npm run api:types:check`)
- ✅ Anchored frontend request DTOs to generated OpenAPI schema types
- [ ] Wire `npm run api:types:check` into CI workflow file

**Commit:** `chore(backend): add TypeScript staged migration scaffolding`

### 0.1 Hosting Account Model & Provisioning
**Status:** ✅ Completed — 2026-03-11
**Priority:** CRITICAL

**What Was Done:**
- ✅ Added `HostingPlan` model to Prisma schema (name, diskGB, bandwidthGB, maxDomains, maxDatabases, maxFtpAccounts, monthlyPrice, Stripe fields)
- ✅ Added `HostingAccount` model to Prisma schema (userId, planId, domain, diskQuota, bandwidthQuota, diskUsed, bandwidthUsed, status, ftpUser/Password, dbName/User/Password, SSL fields)
- ✅ Seeded default plans: `Starter` (1 GB / $3/mo), `Pro` (10 GB / $8/mo), `Business` (30 GB / $18/mo)
- ✅ Created `hostingService.js` with account provisioning logic (credential generation, domain validation)
- ✅ Created `hostingController.js` with full HTTP layer and input validation
- ✅ Created `src/routes/hosting.js` and registered at `/api/v1/hosting`
- ✅ Created migration `20260311000000_add_hosting_models` (apply when DB is up)
- ⚠️ Migration SQL is written — run `npx prisma migrate dev` once the DB is running

**Endpoints:**
- `GET  /api/v1/hosting/plans` — public, list plans
- `POST /api/v1/hosting/accounts` — provision account (auth required) `{ planId, domain }`
- `GET  /api/v1/hosting/accounts/me` — get current user's account (auth required)
- `DELETE /api/v1/hosting/accounts/:id` — terminate account (auth required)

**Commit:** `feat(hosting): add hosting account model and provisioning API`

---

### 0.2 Domain & Subdomain Management
**Status:** ✅ Completed — 2026-03-12
**Priority:** CRITICAL

**What Was Done:**
- ✅ Auto-assign `<emailprefix>.sahary.cloud` subdomain on hosting account creation (domain param now optional in `createAccount`)
- ✅ Added `_uniqueSubdomain` helper to handle collisions (appends numeric suffix: `john2.sahary.cloud`)
- ✅ Backend: `POST /api/v1/hosting/domains` — add custom domain (stores + generates DNS TXT `verifyToken`)
- ✅ Backend: `GET /api/v1/hosting/domains` — list user's custom domains
- ✅ Backend: `DELETE /api/v1/hosting/domains/:id` — remove custom domain
- ✅ Backend: `POST /api/v1/hosting/domains/:id/verify` — DNS TXT ownership verification (Node `dns.promises.resolveTxt`)
- ✅ Frontend: Domain management page at `/dashboard/hosting` with:
  - Assigned subdomain display
  - Add custom domain form
  - Per-domain DNS TXT + A-record pointing instructions (copyable)
  - Verify / remove buttons
- ✅ Added hosting API methods to `apiClient` (`getHostingAccount`, `createHostingAccount`, `getHostingDomains`, `addHostingDomain`, `verifyHostingDomain`, `removeHostingDomain`, `terminateHostingAccount`)

**Endpoints:**
- `GET  /api/v1/hosting/domains` — list custom domains (auth required)
- `POST /api/v1/hosting/domains` — add domain `{ domain }` (auth required)
- `POST /api/v1/hosting/domains/:id/verify` — trigger DNS TXT check (auth required)
- `DELETE /api/v1/hosting/domains/:id` — remove domain (auth required)

**Commit:** `feat(hosting): add domain and subdomain management`

---

### 0.3 Nginx Virtual Host Management
**Status:** ✅ Completed — 2026-03-15
**Priority:** CRITICAL

**What Was Done:**
- ✅ Added `backend/src/services/vhostService.js`:
  - Generates Nginx vhost config with `server_name` including primary subdomain + verified custom domains
  - Writes config to `sites-available` and ensures symlink in `sites-enabled`
  - Runs `nginx -t` then reload command, with structured error logging
- ✅ Integrated vhost sync into account lifecycle in `hostingService.js`:
  - On account creation: create vhost for primary subdomain
  - On domain add/remove: reconcile vhost config and reload Nginx
  - On domain verification: re-sync to include verified custom domain in `server_name`
  - On account termination: remove vhost config and reload Nginx before status transition
- ✅ Added rollback safety around provisioning/domain mutations when vhost sync fails
- ✅ Added environment controls in `env.validation.js` + `.env.example`:
  - `HOSTING_NGINX_ENABLED`
  - `HOSTING_NGINX_SITES_AVAILABLE`
  - `HOSTING_NGINX_SITES_ENABLED`
  - `HOSTING_NGINX_TEST_COMMAND`
  - `HOSTING_NGINX_RELOAD_COMMAND`
  - `HOSTING_WWW_BASE`
  - `HOSTING_BASE_DOMAIN`

**Operational Note:**
- Vhost operations are feature-flagged. Set `HOSTING_NGINX_ENABLED=true` on server environments where Nginx paths/permissions are available.

**Commit:** `feat(hosting): add Nginx virtual host provisioning service`

---

### 0.4 SSL Auto-Provisioning (Let's Encrypt)
**Status:** ❌ Not Started
**Priority:** HIGH

**Tasks:**
- [ ] Install `acme-client` or wrap `certbot` CLI in a Node service
- [ ] On domain verification success: run `certbot --nginx -d <domain>` (or acme HTTP-01 challenge)
- [ ] Store cert expiry date in `HostingAccount` model
- [ ] Add cron job: renew certs expiring within 30 days
- [ ] Update Nginx vhost to use SSL after cert issued

**Commit:** `feat(hosting): add Let's Encrypt SSL auto-provisioning`

---

### 0.5 File Manager (Web-based)
**Status:** ❌ Not Started
**Priority:** HIGH

**Tasks:**
- [ ] Backend: `GET /api/hosting/files?path=` — list directory
- [ ] Backend: `POST /api/hosting/files/upload` — upload file (multipart, scoped to user's document root)
- [ ] Backend: `DELETE /api/hosting/files` — delete file/folder
- [ ] Backend: `POST /api/hosting/files/rename` — rename/move file
- [ ] Frontend: File manager page at `/dashboard/hosting/files` — tree view, upload, delete, rename
- [ ] Enforce path restriction: all file operations limited to `/var/www/<account>/public_html`

**Commit:** `feat(hosting): add web-based file manager with sandboxed file operations`

---

### 0.6 Database Provisioning (MySQL)
**Status:** ❌ Not Started
**Priority:** HIGH

**Tasks:**
- [ ] Add MySQL service to `docker-compose.dev.yml`
- [ ] Backend service: `mysqlProvisionService.js` — `CREATE DATABASE`, `CREATE USER`, `GRANT` per account
- [ ] On account creation: auto-provision one database + user with random password
- [ ] Backend: `GET /api/hosting/databases` — list user's databases + credentials
- [ ] Backend: `POST /api/hosting/databases` — create additional database (within plan limits)
- [ ] Backend: `DELETE /api/hosting/databases/:id` — remove database
- [ ] Show credentials (read-only display) in frontend control panel

**Commit:** `feat(hosting): add MySQL database auto-provisioning per hosting account`

---

### 0.7 FTP Account Provisioning
**Status:** ❌ Not Started
**Priority:** MEDIUM

**Tasks:**
- [ ] Add vsftpd or Pure-FTPd to server setup (or use SFTP via SSH key injection)
- [ ] On account creation: create OS/FTP user scoped to `/var/www/<account>/public_html`
- [ ] Store hashed FTP credentials in `HostingAccount`
- [ ] Backend: `POST /api/hosting/ftp/reset-password` — reset FTP password
- [ ] Show FTP credentials in frontend control panel

**Commit:** `feat(hosting): add FTP account provisioning with sandboxed access`

---

### 0.8 Control Panel Frontend (User Hosting Dashboard)
**Status:** ❌ Not Started
**Priority:** CRITICAL

**Tasks:**
- [ ] Page: `/dashboard/hosting` — hosting account overview (plan, usage bars for disk/bandwidth, status)
- [ ] Page: `/dashboard/hosting/domains` — domain list, add/remove, DNS instructions, SSL status badge
- [ ] Page: `/dashboard/hosting/files` — file manager (task 0.5)
- [ ] Page: `/dashboard/hosting/databases` — database list + credentials
- [ ] Page: `/dashboard/hosting/ftp` — FTP credentials + reset password
- [ ] Replace VM-centric dashboard links with hosting-centric ones

**Commit:** `feat(frontend): add hosting control panel pages`

---

### 0.9 Subscription Plans & Upgrade/Downgrade
**Status:** ⚠️ Partial (billing models exist, hosting plans do not)
**Priority:** HIGH

**Tasks:**
- [ ] Connect `HostingPlan` to Stripe Products/Prices
- [ ] Page: `/pricing` — public plans page (Starter / Pro / Business)
- [ ] Page: `/dashboard/subscription` — current plan, usage vs limits, upgrade/downgrade button
- [ ] On plan change: update disk/bandwidth quota in `HostingAccount`
- [ ] Block operations when quota is exceeded (upload, new DB, etc.)

**Commit:** `feat(billing): connect hosting plans to Stripe subscriptions`

---

### 0.10 Usage Metering for Hosting
**Status:** ❌ Not Started
**Priority:** HIGH

**Tasks:**
- [ ] Daily cron job: scan `/var/www/<account>` for disk usage (`du -sb`) → store in `UsageRecord`
- [ ] Daily cron job: read Nginx access logs or byte counters for bandwidth per account
- [ ] Backend: `GET /api/hosting/usage` — return current cycle disk + bandwidth usage
- [ ] Frontend: show usage bars in control panel (used / quota)

**Commit:** `feat(hosting): add disk and bandwidth usage metering`

---

## 🚨 Priority 1: Critical Production Blockers

### 1.1 Database Migration to PostgreSQL
**Status:** ✅ COMPLETED  
**Priority:** CRITICAL  
**Completed:** 2026-01-21

**What Was Done:**
- ✅ Updated `backend/prisma/schema.prisma` to use PostgreSQL
- ✅ Updated `backend/.env` with PostgreSQL connection string
- ✅ Created migration guides (MIGRATION_GUIDE.md, MIGRATION_READY.md)
- ✅ Started PostgreSQL and Redis containers
- ✅ Generated Prisma Client for PostgreSQL
- ✅ Successfully ran migration: `20260121152817_init_postgresql`
- ✅ All database tables created in PostgreSQL
- ✅ Database verified and working

**Commit:** ✅ `feat(db): migrate from SQLite to PostgreSQL for production` (74ae099)

---

### 1.2 Redis Production Setup
**Status:** ✅ Completed  
**Priority:** CRITICAL  
**Estimated Time:** 0 hours

**Current State:**
- ✅ Redis service configured in docker-compose.dev.yml
- ✅ RedisService implemented with full functionality
- ✅ Retry logic and error handling implemented
- ✅ Health check in `/health` endpoint shows Redis status
- ✅ Session storage with Redis (connect-redis) configured
- ✅ Graceful degradation when Redis is unavailable

**Notes:** Redis is fully integrated and working. Server starts even if Redis is unavailable.

**Commit:** ✅ Already implemented

---

### 1.3 Docker Host Configuration
**Status:** ✅ COMPLETED  
**Priority:** CRITICAL  
**Completed:** 2026-02-10

**What Was Done:**
- ✅ Configure Docker socket access securely (TLS support for remote daemons)
- ✅ Add Docker network for VM isolation (`ensureNetwork` with configurable subnet)
- ✅ Implement VM resource limits (CPU, RAM, disk) validation against host capacity
- ✅ Add Docker health monitoring (startup check + `/health` endpoint)
- ✅ Graceful degradation when Docker is unavailable (503 guard in controller)
- ✅ Integrated into server startup lifecycle alongside Redis

**Commit:** ✅ `feat(docker): configure secure Docker host for VM management` (d6f4cfa)

---

### 1.4 Environment Variables Validation
**Status:** ✅ COMPLETED  
**Priority:** HIGH  
**Completed:** 2026-02-10

**What Was Done:**
- ✅ .env and .env.example files exist
- ✅ Basic environment variables are used throughout the app
- ✅ Created `backend/src/config/env.validation.js` with Joi schema (45+ vars, 14 categories)
- ✅ Validates all required env vars on startup with clear error messages
- ✅ Color-coded terminal output for missing/invalid variables
- ✅ Updated .env.example with Docker TLS, VM network, and feature flag variables
- ✅ Environment summary printer in debug/development mode

**Commit:** ✅ `feat(config): add environment variable validation on startup` (8e7d9dd)

---

### 1.5 Error Handling & Logging
**Status:** ✅ COMPLETED  
**Priority:** MEDIUM  
**Completed:** 2026-02-22

**What Was Done:**
- ✅ Winston logger implemented with daily rotation
- ✅ Error handling middleware in place
- ✅ Request logging middleware active
- ✅ Log files: combined, error, and http logs
- ✅ Unhandled rejection and exception handlers
- ✅ **Correlation IDs** added to every request (`X-Correlation-Id` header)
- ✅ Every log line now carries `correlationId` for full request tracing
- ⏭️ Sentry integration — deferred (optional/production-only)

**Commit:** ✅ `feat(monitoring): add correlation ID to every request` (19f6442)

---

## 🔥 Priority 2: Security Hardening

### 2.1 JWT Token Security
**Status:** ✅ Implemented  
**Priority:** MEDIUM  
**Estimated Time:** 1 hour

**Current State:**
- ✅ JWT authentication implemented
- ✅ Access and refresh tokens configured
- ✅ Token expiration set (30d access, 7d refresh)
- ✅ Session management with Redis
- ⚠️ Token rotation could be enhanced
- ❌ No device fingerprinting

**Tasks:**
- [ ] Implement advanced token rotation mechanism (optional)
- [ ] Add device fingerprinting (optional)
- [ ] Test token security edge cases

**Commit:** `security(auth): enhance token rotation and add device fingerprinting`

---

### 2.2 API Rate Limiting Enhancement
**Status:** ✅ Implemented  
**Priority:** LOW  
**Estimated Time:** 0.5 hours

**Current State:**
- ✅ express-rate-limit configured (100 req/15min)
- ✅ Rate limiting active on /api/ routes
- ✅ DDoS protection middleware for production
- ✅ Connection limit middleware
- ⚠️ Could add Redis-based distributed limiting
- ❌ No per-user rate limits

**Tasks:**
- [ ] Implement Redis-based distributed rate limiting (optional for scaling)
- [ ] Add per-user rate limits (optional)
- [ ] Create rate limit bypass for admins (optional)

**Commit:** `security(api): enhance rate limiting with Redis and per-user limits`

---

### 2.3 Input Validation Hardening
**Status:** ✅ Well Implemented  
**Priority:** LOW  
**Estimated Time:** 1 hour

**Current State:**
- ✅ express-validator used throughout
- ✅ Sanitization middleware (XSS, NoSQL injection)
- ✅ Input validation on all routes
- ✅ Zod schemas available
- ✅ Helmet security headers
- ⚠️ File upload validation could be enhanced

**Tasks:**
- [ ] Add comprehensive file upload validation (if file uploads are needed)
- [ ] Add more validation tests
- [ ] Add validation error logging

**Commit:** `security(validation): enhance file upload validation and logging`

---

### 2.4 HTTPS & SSL Configuration
**Status:** ❌ Not Started  
**Priority:** HIGH — ✅ KEEP (MVP)
**Estimated Time:** 2 hours

**Tasks:**
- [ ] Force HTTPS in production (reverse proxy / Nginx)
- [ ] Configure HSTS headers via Helmet
- [ ] SSL for the API domain (separate from per-hosting-account SSL in task 0.4)
- [ ] Test SSL configuration

**Commit:** `security(ssl): add HTTPS configuration and HSTS headers`

---

## 🧪 Priority 3: Testing Infrastructure

### 3.1 Frontend Unit Tests
**Status:** ❌ Not Started  
**Priority:** 🚫 POST-MVP  
**Estimated Time:** 4 hours

> Deferred until core hosting features are shipped.

**Commit:** `test(frontend): add unit tests for core functionality`

---

### 3.2 Frontend Integration Tests
**Status:** ❌ Not Started  
**Priority:** 🚫 POST-MVP  
**Estimated Time:** 3 hours

> Deferred. After MVP is live, replace VM flows with hosting flows.

**Commit:** `test(frontend): add integration tests for user flows`

---

### 3.3 Backend Integration Tests Enhancement
**Status:** ⚠️ Partial  
**Priority:** 🚫 POST-MVP  
**Estimated Time:** 2 hours

> Deferred. Rewrite scope to cover hosting provisioning flows once built.

**Commit:** `test(backend): enhance integration tests and increase coverage`

---

### 3.4 E2E Testing
**Status:** ❌ Not Started  
**Priority:** 🚫 POST-MVP  

> Deferred until hosting provisioning is complete.

**Commit:** `test(e2e): add end-to-end tests for critical user journeys`

---

## 🚀 Priority 4: Production Deployment

### 4.1 CI/CD Pipeline
**Status:** ❌ Not Started  
**Priority:** HIGH  
**Estimated Time:** 3 hours

**Tasks:**
- [ ] Create GitHub Actions workflow
- [ ] Add automated testing on PR
- [ ] Add automated deployment to staging
- [ ] Add production deployment with approval
- [ ] Add rollback mechanism

**Commit:** `ci: add GitHub Actions pipeline for testing and deployment`

---

### 4.2 Docker Production Images
**Status:** ❌ Not Started  
**Priority:** HIGH  
**Estimated Time:** 2 hours

**Tasks:**
- [ ] Create optimized Dockerfile for backend
- [ ] Create optimized Dockerfile for frontend
- [ ] Add multi-stage builds
- [ ] Configure image scanning for vulnerabilities
- [ ] Push images to container registry

**Commit:** `build(docker): create production-optimized Docker images`

---

### 4.3 Database Backup & Recovery
**Status:** ❌ Not Started  
**Priority:** CRITICAL  
**Estimated Time:** 2 hours

**Tasks:**
- [ ] Implement automated database backups
- [ ] Add backup to S3 or similar storage
- [ ] Create restore procedure documentation
- [ ] Test backup and restore process
- [ ] Add backup monitoring and alerts

**Commit:** `feat(backup): implement automated database backup and recovery`

---

### 4.4 Monitoring & Alerting
**Status:** ❌ Not Started  
**Priority:** 🚫 POST-MVP  

> Prometheus + Grafana are overkill for MVP. The existing `/health` endpoint is sufficient. Revisit after launch.

**Commit:** `feat(monitoring): add Prometheus metrics and Grafana dashboards`

---

### 4.5 Load Balancing & Scaling
**Status:** ❌ Not Started  
**Priority:** 🚫 POST-MVP  

> Not needed until traffic justifies it. Single-node deployment is fine for MVP.

**Commit:** `feat(scaling): add load balancing and horizontal scaling support`

---

## 🔧 Priority 5: Critical Features

### 5.1 Email Service Integration
**Status:** ✅ Implemented  
**Priority:** LOW  
**Estimated Time:** 0.5 hours

**Current State:**
- ✅ EmailService class fully implemented
- ✅ Nodemailer configured with SMTP
- ✅ Email templates for verification and password reset
- ✅ Graceful fallback for development (logs instead of sending)
- ❌ No email queue system
- ❌ No delivery tracking

**Tasks:**
- [ ] Configure production SMTP service (SendGrid/AWS SES)
- [ ] Implement email queue with retry logic (optional)
- [ ] Add email delivery tracking (optional)
- [ ] Add invoice email templates

**Commit:** `feat(email): add email queue and delivery tracking`

---

### 5.2 Payment Gateway Integration
**Status:** ✅ Implemented  
**Priority:** MEDIUM  
**Estimated Time:** 2 hours

**Current State:**
- ✅ Stripe integration configured
- ✅ Payment service implemented
- ✅ Billing routes and controllers
- ✅ Invoice model in database
- ✅ Payment model in database
- ⚠️ Webhook handlers may need completion
- ❌ No invoice PDF generation

**Tasks:**
- [ ] Complete and test Stripe webhook handlers
- [ ] Add payment method management UI
- [ ] Implement subscription billing logic
- [ ] Add invoice PDF generation
- [ ] Test payment flows thoroughly

**Commit:** `feat(payment): complete Stripe webhooks and add invoice PDF generation`

---

### 5.3 VM Console (WebSocket)
**Status:** ✅ COMPLETED (code preserved, feature deferred for VPS product)  
**Priority:** 🚫 NOT FOR SHARED HOSTING MVP  
**Completed:** 2026-03-11

**What Was Done:**
- ✅ Installed `socket.io` in backend, `socket.io-client` + `@xterm/xterm` + `@xterm/addon-fit` in frontend
- ✅ Created `backend/src/socket/terminal.js` — JWT-authenticated PTY handler via Docker exec (TTY mode)
- ✅ Created `backend/src/socket/index.js` — Socket.io server init on `/terminal` namespace
- ✅ Updated `backend/src/index.js` to use `http.createServer` + `initSocket`
- ✅ Created `frontend/hooks/useVmTerminal.ts` — xterm.js + socket.io-client lifecycle hook
- ✅ Created `frontend/components/vm/VmTerminal.tsx` — dark terminal panel with toolbar (Connect/Disconnect/Clear)
- ✅ Added **Console** tab to the VM detail page (`app/vms/[id]/page.tsx`) via dynamic import (no SSR)
- ✅ Ownership check: backend verifies `VM.userId === socket.user.id` before opening exec session
- ✅ TypeScript check passes with 0 errors; all JS files pass `node --check`

**Commit:** `feat(vm): add WebSocket-based VM console terminal with xterm.js`

---

### 5.4 Real-time Notifications
**Status:** ❌ Not Started  
**Priority:** 🚫 POST-MVP  

> Polling or simple toast notifications are sufficient for MVP. WebSocket push is a nice-to-have.

**Commit:** `feat(notifications): add real-time notification system with WebSocket`

---

### 5.5 Solar API Integration
**Status:** ✅ Implemented with Mock Data — 🚫 Real Integration POST-MVP  
**Priority:** LOW (keep mock data for now)  

> The solar display is a key differentiator and looks great with mock data. Real hardware integration deferred until MVP is live and hardware is available. Do not spend time on this now.

**Commit:** `feat(solar): integrate real solar monitoring API with data validation`

---

## 📊 Priority 6: Performance Optimization

### 6.1 Database Query Optimization
**Status:** ✅ COMPLETED  
**Priority:** MEDIUM  
**Completed:** 2026-02-22

**What Was Done:**
- ✅ Added 28 `@@index` directives across 12 Prisma models
- ✅ Compound indexes for common query patterns: `(userId, status)`, `(userId, timestamp)`, `(resource, resourceId)`
- ✅ Single indexes on all foreign keys and frequently filtered fields
- ✅ Timestamp indexes for time-range queries and pagination
- ✅ Migration applied: `20260222205624_add_performance_indexes`
- ⏭️ Query performance monitoring — deferred (needs traffic data)

**Commit:** ✅ `perf(db): add performance indexes across all models` (3277915)

---

### 6.2 API Response Caching
**Status:** ✅ Implemented  
**Priority:** LOW  
**Estimated Time:** 0.5 hours

**Current State:**
- ✅ Redis caching service fully implemented
- ✅ Cache helper methods available
- ✅ Frontend uses cache with TTL (api.ts)
- ✅ Cache invalidation on mutations
- ✅ Stale-while-revalidate strategy
- ⚠️ Could add more cache metrics

**Tasks:**
- [ ] Add cache hit/miss metrics
- [ ] Add cache monitoring dashboard
- [ ] Fine-tune cache TTL per endpoint

**Commit:** `perf(api): add cache metrics and monitoring`

---

### 6.3 Frontend Performance
**Status:** ✅ COMPLETED  
**Priority:** LOW  
**Completed:** 2026-03-04

**What Was Done:**
- ✅ Next.js 14 with App Router (optimized by default)
- ✅ Dynamic imports for heavy components (SolarChart)
- ✅ Client-side caching implemented
- ✅ Lazy loading with loading states
- ✅ Optimized animations and transitions
- ✅ **Web Vitals monitoring** — CLS, INP, FCP, LCP, TTFB collected on every page
- ✅ Color-coded console output in dev (✅/⚠️/❌)
- ✅ Metrics sent via `sendBeacon` to `/api/vitals` edge route
- ⏭️ Service worker — deferred (optional)
- ⏭️ CDN / bundle analysis — deferred (production concern)

**Commit:** ✅ `perf(frontend): add Web Vitals monitoring` (394a160)

---

### 6.4 Asset Optimization
**Status:** ❌ Not Started  
**Priority:** LOW  
**Estimated Time:** 1 hour

**Tasks:**
- [ ] Compress and optimize images
- [ ] Add WebP format support
- [ ] Minify CSS and JS
- [ ] Configure asset caching headers
- [ ] Add lazy loading for images

**Commit:** `perf(assets): optimize images and add lazy loading`

---

## 🌍 Priority 7: Internationalization

### 7.1 i18n Setup
**Status:** ❌ Not Started  
**Priority:** MEDIUM  
**Estimated Time:** 3 hours

**Tasks:**
- [ ] Install and configure next-i18next
- [ ] Create translation files (en, ar)
- [ ] Add language switcher component
- [ ] Translate all UI strings
- [ ] Add RTL support for Arabic

**Commit:** `feat(i18n): add internationalization support for English and Arabic`

---

### 7.2 Backend Localization
**Status:** ❌ Not Started  
**Priority:** LOW  
**Estimated Time:** 2 hours

**Tasks:**
- [ ] Add i18n to error messages
- [ ] Localize email templates
- [ ] Add locale-based date formatting
- [ ] Localize invoice generation
- [ ] Test all locales

**Commit:** `feat(i18n): add backend localization for errors and emails`

---

## 📚 Priority 8: Documentation

### 8.1 API Documentation
**Status:** ✅ COMPLETED  
**Priority:** MEDIUM  
**Completed:** 2026-02-22

**What Was Done:**
- ✅ Installed `swagger-jsdoc` + `swagger-ui-express`
- ✅ Created `src/config/swagger.js` with full OpenAPI 3.0 spec
- ✅ Component schemas: User, VirtualMachine, Invoice, SolarData, auth DTOs, Error, Pagination
- ✅ `@swagger` JSDoc annotations on auth routes (register, login, refresh, logout, profile)
- ✅ `@swagger` JSDoc annotations on VM routes (create, list, start, stop)
- ✅ UI served at **`/api-docs`** (dev only), raw JSON at `/api-docs.json`
- ✅ Bearer JWT auth scheme pre-configured in UI

**Commit:** ✅ `docs(api): add Swagger/OpenAPI 3.0 documentation` (35c09b3)

---

### 8.2 Deployment Guide
**Status:** ✅ COMPLETED  
**Priority:** HIGH  
**Completed:** 2026-03-04

**What Was Done:**
- ✅ Created `docs/DEPLOYMENT_GUIDE.md`
- ✅ Infrastructure requirements table (CPU, RAM, disk, ports)
- ✅ Server setup (Node.js, Docker, nginx, certbot)
- ✅ Full environment variables section for production
- ✅ Database setup and migration commands
- ✅ PM2 and systemd service options for running backend
- ✅ nginx reverse proxy config for API + frontend
- ✅ SSL/HTTPS with Certbot auto-renewal
- ✅ Health checks, log file locations, PM2 monitoring
- ✅ Database backup (manual + automated cron) and restore
- ✅ Troubleshooting table for common errors

**Commit:** See next commit

---

### 8.3 Developer Guide
**Status:** ✅ COMPLETED  
**Priority:** MEDIUM  
**Completed:** 2026-03-04

**What Was Done:**
- ✅ Created `docs/DEVELOPER_GUIDE.md`
- ✅ Prerequisites and local setup (5-step quickstart)
- ✅ Full project structure map with annotations
- ✅ All npm scripts documented for backend and frontend
- ✅ Code architecture: request lifecycle, service layer pattern
- ✅ API conventions: response shape, status codes, Swagger UI link
- ✅ Database workflow: schema changes, indexes, Prisma Studio
- ✅ New feature checklist (backend + frontend)
- ✅ Coding standards for JS and TypeScript
- ✅ Testing guidelines with example test
- ✅ Contribution workflow with PR checklist

**Commit:** See next commit

---

## 🎯 MVP Execution Snapshot (Shared Hosting)

**Last updated:** 2026-03-15

### ✅ Completed For MVP
- Shared hosting data model + provisioning API foundation (task 0.1)
- Domain and subdomain management with DNS TXT verification (task 0.2)
- Auth, sessions, Redis, validation, and logging foundations
- PostgreSQL migration completed and operational
- Billing primitives already present (payments/invoices) and ready to be connected to hosting plans
- Solar dashboard support available with mock data (acceptable for MVP launch)

### 🚧 Current MVP Blockers (Build Next)
- 0.4 SSL issuance/renewal automation
- 0.5 File manager APIs + UI (sandboxed)
- 0.6 MySQL provisioning service and APIs
- 0.8 Hosting control panel pages (overview/domains/files/databases/ftp)
- 0.9 Stripe-hosting plan linkage + plan change flows
- 0.10 Disk/bandwidth metering + quota enforcement
- 2.4 Platform HTTPS hardening (API/domain-level)

### ⏭️ Explicitly Deferred Until After MVP
- VM/VPS-specific flows (console, VM-centric UX)
- Real-time WebSocket notifications
- Full frontend unit/integration/E2E test expansion
- Prometheus/Grafana, load balancing, i18n expansion
- CI/CD hardening and advanced deployment automation

### 📊 Progress View
- MVP Core (Priority 0): 3/10 complete
- Critical Production Foundations (Priority 1): 5/5 complete
- Security MVP Must-Haves: HTTPS/SSL hardening pending
- Overall MVP Readiness: Foundation complete, hosting runtime features in progress

---

## 📅 Recommended Sprint Plan (Pivot-Aligned)

### Sprint A (Week 1): Hosting Runtime Foundation
- Validate task 0.3 in staging (Nginx enabled, config write + reload paths verified)
- Implement task 0.6 (`mysqlProvisionService.js`) and provision DB on account creation
- Add/update integration tests for account creation + domain add/remove side effects

### Sprint B (Week 2): Secure Hosting Delivery
- Implement task 0.4 SSL automation + renewal job
- Implement task 2.4 platform HTTPS/HSTS hardening
- Add operational runbook notes for SSL failure/retry paths

### Sprint C (Week 3): User Control Panel MVP
- Implement task 0.5 file manager backend and `/dashboard/hosting/files`
- Implement task 0.8 overview/domains/databases/ftp pages and remove VM-first nav emphasis
- Validate path sandboxing and permission boundaries

### Sprint D (Week 4): Billing + Usage Enforcement
- Implement task 0.9 hosting subscription flow with Stripe webhook-driven state changes
- Implement task 0.10 usage metering (disk/bandwidth) and quota enforcement
- Finalize launch checklist against `docs/mvp.md` definition of done

---

## 🎉 Integration Status (As of Pivot)

### Backend
- Core API stack is stable (auth, validation, logging, Redis, PostgreSQL)
- Shared hosting base endpoints exist (`/api/v1/hosting/plans`, account + domains)
- Remaining work is infrastructure orchestration (Nginx, SSL, MySQL, metering)

### Frontend
- App shell, auth flows, and API client integration are stable
- Shared hosting domain UI exists at `/dashboard/hosting`
- Remaining work is full hosting control panel surface (files, databases, ftp, usage/subscription UX)

### Product Readiness
- Platform foundation is production-oriented
- MVP launch now depends on completing the shared-hosting runtime pipeline end-to-end

---

**Last Updated:** 2026-03-15  
**Status:** Shared Hosting MVP Execution Mode (Foundation Complete, Runtime Features In Progress)  
**Next Review:** After Sprint A completion (vhost + MySQL provisioning)  
**Priority Focus:** 0.4 SSL, 0.5 file manager, 0.6 MySQL, 0.8 control panel, 0.9 billing, 0.10 metering
