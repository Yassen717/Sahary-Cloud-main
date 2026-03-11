# Sahary Cloud — MVP Definition
**Shared Web Hosting Platform**  
**Target Launch:** Q2 2026

---

## What We Are Building

A **solar-powered shared web hosting platform**. Users sign up, choose a plan, and get a fully provisioned hosting account: a subdomain, file storage, an SSL certificate, a MySQL database, and FTP access — managed through a clean control panel.

The unique angle: every hosting account is transparently powered by solar energy, and the dashboard shows live solar production and CO₂ savings.

**We are NOT building VPS/VM hosting for MVP.** That codebase stays intact and can be productized separately later.

---

## Target User

- Individuals and small businesses that want simple, affordable website hosting.
- Users who care about sustainability and want to host on green energy.
- Arabic-speaking market first, English support included.

---

## MVP Scope — In

| # | Feature | Notes |
|---|---------|-------|
| 1 | **User Auth** | Register, login, email verification, password reset — ✅ already built |
| 2 | **Hosting Plans** | Starter / Pro / Business tiers with disk, bandwidth, DB limits |
| 3 | **Hosting Account Provisioning** | Auto-create vhost, FTP user, MySQL DB on signup/plan purchase |
| 4 | **Subdomain Assignment** | Auto-assign `<username>.sahary.cloud` on account creation |
| 5 | **Custom Domain** | Add a custom domain, verify via DNS TXT record, update vhost |
| 6 | **SSL Certificates** | Auto-provision Let's Encrypt cert per domain; auto-renew |
| 7 | **File Manager** | Web-based: browse, upload, delete, rename — sandboxed to account root |
| 8 | **MySQL Database** | 1 database auto-provisioned; add more within plan limits |
| 9 | **FTP Access** | FTP credentials shown in control panel; password reset |
| 10 | **Control Panel** | Dashboard: usage bars, domain status, SSL badge, quick links |
| 11 | **Subscription Billing** | Stripe monthly subscriptions tied to plans; upgrade/downgrade |
| 12 | **Disk & Bandwidth Metering** | Daily cron to measure usage; enforce quotas |
| 13 | **Solar Energy Widget** | Display solar production + CO₂ saved (mock data is fine for launch) |
| 14 | **Admin Panel** | List accounts, suspend/activate, view usage, manage plans |

---

## MVP Scope — Out (Deferred)

| Feature | Why deferred |
|---------|-------------|
| VPS / Docker VM management | Different product; existing code preserved |
| Email hosting per domain | Operational complexity — use external mail (SendGrid) for now |
| One-click WordPress install | Nice-to-have; do it right after launch |
| PHPMyAdmin web UI | Use Adminer or link to a simple DB tool post-launch |
| Prometheus / Grafana monitoring | Overkill for MVP; `/health` endpoint is enough |
| Real solar hardware API | Keep mock data; integrate when hardware is ready |
| WebSocket real-time notifications | Polling is fine for MVP |
| Multi-language (i18n) | Ship in Arabic + English strings as-is |
| CI/CD pipeline | Set up after first working deployment |
| Automated DB backups | Critical but can be done manually at MVP scale |
| Load balancing / horizontal scaling | Single-node is fine until traffic demands otherwise |
| Frontend unit/E2E tests | Write tests as features stabilize post-MVP |

---

## Data Models Needed

### New Models (to add to Prisma)

```prisma
model HostingPlan {
  id            String   @id @default(cuid())
  name          String   @unique  // "Starter", "Pro", "Business"
  priceMonthly  Decimal
  diskGB        Int
  bandwidthGB   Int
  maxDomains    Int
  maxDatabases  Int
  stripePriceId String?
  isActive      Boolean  @default(true)
  createdAt     DateTime @default(now())
  accounts      HostingAccount[]
  @@map("hosting_plans")
}

model HostingAccount {
  id            String   @id @default(cuid())
  status        String   @default("ACTIVE") // ACTIVE | SUSPENDED | TERMINATED
  documentRoot  String   // /var/www/<accountId>/public_html
  subdomain     String   @unique // <username>.sahary.cloud
  diskUsedMB    Int      @default(0)
  bandwidthUsedGB Float  @default(0)
  ftpUser       String   @unique
  ftpPasswordHash String
  dbName        String?
  dbUser        String?
  dbPasswordHash String?
  sslIssuedAt   DateTime?
  sslExpiresAt  DateTime?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  userId        String   @unique
  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  planId        String
  plan          HostingPlan @relation(fields: [planId], references: [id])
  domains       HostingDomain[]
  @@map("hosting_accounts")
}

model HostingDomain {
  id            String   @id @default(cuid())
  domain        String   @unique
  isVerified    Boolean  @default(false)
  verifyToken   String?
  sslIssuedAt   DateTime?
  sslExpiresAt  DateTime?
  createdAt     DateTime @default(now())
  accountId     String
  account       HostingAccount @relation(fields: [accountId], references: [id], onDelete: Cascade)
  @@map("hosting_domains")
}
```

### Existing Models — Reuse As-Is
- `User` — no changes needed
- `Invoice` / `InvoiceItem` / `Payment` — reuse for subscription billing
- `UsageRecord` — reuse for disk/bandwidth metering (set `vmId = null`)
- `SolarData` — reuse for solar widget

---

## Backend — Services to Build

| Service | File | Responsibility |
|---------|------|---------------|
| `hostingService.js` | `src/services/hostingService.js` | Provision account: create dir, FTP user, DB, vhost, SSL |
| `vhostService.js` | `src/services/vhostService.js` | Write/remove Nginx vhost configs + reload Nginx |
| `sslService.js` | `src/services/sslService.js` | Run certbot / acme-client per domain; track expiry |
| `mysqlProvisionService.js` | `src/services/mysqlProvisionService.js` | CREATE DATABASE/USER/GRANT, DROP |
| `ftpService.js` | `src/services/ftpService.js` | Create/delete OS FTP users, reset passwords |
| `fileManagerService.js` | `src/services/fileManagerService.js` | List/upload/delete/rename files within sandboxed root |
| `hostingMeterJob.js` | `src/jobs/hostingMeterJob.js` | Daily cron: `du` for disk, parse logs for bandwidth |

---

## Backend — API Routes

```
POST   /api/hosting/accounts              — provision account (requires active subscription)
GET    /api/hosting/accounts/me           — get current user's account + plan + usage
DELETE /api/hosting/accounts/:id          — terminate account (admin or user)

GET    /api/hosting/domains               — list domains for account
POST   /api/hosting/domains               — add custom domain
GET    /api/hosting/domains/:id/verify    — initiate TXT verification
DELETE /api/hosting/domains/:id           — remove domain

GET    /api/hosting/files?path=           — list directory contents
POST   /api/hosting/files/upload          — upload file
DELETE /api/hosting/files                 — delete file/dir
POST   /api/hosting/files/rename          — rename/move

GET    /api/hosting/databases             — list databases + credentials
POST   /api/hosting/databases             — create additional database
DELETE /api/hosting/databases/:id         — drop database

GET    /api/hosting/ftp                   — get FTP credentials (password obfuscated)
POST   /api/hosting/ftp/reset-password    — generate and set new FTP password

GET    /api/hosting/plans                 — list available plans (public)
POST   /api/hosting/plans/subscribe       — subscribe to a plan (creates Stripe subscription)
POST   /api/hosting/plans/change          — upgrade or downgrade plan
DELETE /api/hosting/plans/cancel          — cancel subscription
```

---

## Frontend — Pages to Build / Update

| Page | Route | Notes |
|------|-------|-------|
| Pricing | `/pricing` | Public. Show plans, features, solar angle. CTA: Sign up. |
| Hosting Overview | `/dashboard/hosting` | Plan badge, disk/bandwidth usage bars, domain count, SSL status |
| Domain Manager | `/dashboard/hosting/domains` | List, add, DNS instructions modal, SSL badge, verify button |
| File Manager | `/dashboard/hosting/files` | Tree, breadcrumb, upload dropzone, context menu (rename/delete) |
| Databases | `/dashboard/hosting/databases` | List DB credentials (toggle show/hide password), create/delete |
| FTP | `/dashboard/hosting/ftp` | Show host/user/port, reset password button, download FTP config |
| Subscription | `/dashboard/subscription` | Plan details, usage vs limits, upgrade/downgrade, cancel |
| ~~VM pages~~ | ~~`/vms/*`~~ | Hide from nav for now — keep code but de-emphasize in UI |

---

## Prioritized Build Order

> Build in this order. Do not jump ahead.

### Stage 1: Backend Foundation (Week 1)
1. Add `HostingPlan`, `HostingAccount`, `HostingDomain` to Prisma + migrate
2. Seed default plans
3. `vhostService.js` — Nginx vhost generation + reload
4. `mysqlProvisionService.js` — database provisioning
5. `hostingService.js` — orchestrate full account provisioning
6. `POST /api/hosting/accounts` + `GET /api/hosting/accounts/me`

### Stage 2: Domain & SSL (Week 1–2)
7. `POST /api/hosting/domains` + DNS verify flow
8. `sslService.js` — certbot per domain + expiry tracking
9. SSL renewal cron job

### Stage 3: File Manager & FTP (Week 2)
10. `fileManagerService.js` with strict path sandboxing
11. File manager API routes
12. `ftpService.js` — OS user provisioning + password reset

### Stage 4: Frontend Control Panel (Week 2–3)
13. `/pricing` public page
14. `/dashboard/hosting` overview
15. `/dashboard/hosting/domains`
16. `/dashboard/hosting/files`
17. `/dashboard/hosting/databases` + `/dashboard/hosting/ftp`

### Stage 5: Billing & Plans (Week 3)
18. Connect `HostingPlan` to Stripe Products
19. Subscribe/upgrade/downgrade/cancel flows
20. Stripe webhook: activate/suspend account on payment events

### Stage 6: Usage Metering (Week 3–4)
21. `hostingMeterJob.js` — disk + bandwidth cron
22. Quota enforcement middleware
23. Usage bars in frontend

### Stage 7: Admin & Polish (Week 4)
24. Admin panel: list hosting accounts, suspend/activate, view usage
25. Email notifications: account created, SSL expiry warning, quota alert
26. Public landing page update to reflect hosting product

---

## Definition of Done (MVP Ship Criteria)

- [ ] A new user can register, pick a plan, pay, and have a hosting account provisioned automatically
- [ ] User can upload a basic HTML site via file manager and see it live at their subdomain
- [ ] User can add a custom domain, point DNS, and get an SSL cert auto-issued
- [ ] User can see their disk and bandwidth usage vs plan limits
- [ ] Admin can list all accounts, suspend/activate, and see system-wide usage
- [ ] Stripe subscription billing works end-to-end (sign up → pay → provision → renew → cancel)
- [ ] Solar widget displays on the dashboard (mock data acceptable)
- [ ] Basic security: HTTPS enforced, all file operations sandboxed, auth required on all /api/hosting routes

---

*Last updated: 2026-03-11*
