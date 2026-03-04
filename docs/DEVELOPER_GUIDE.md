# Sahary Cloud — Developer Guide

> **Last Updated:** 2026-03-04  
> **Stack:** Node.js 20 · Next.js 14 · PostgreSQL 15 · Redis 7 · Prisma · TypeScript

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Project Structure](#2-project-structure)
3. [Local Development Setup](#3-local-development-setup)
4. [Environment Variables](#4-environment-variables)
5. [NPM Scripts Reference](#5-npm-scripts-reference)
6. [Code Architecture](#6-code-architecture)
7. [API Conventions](#7-api-conventions)
8. [Database Workflow](#8-database-workflow)
9. [Adding a New Feature](#9-adding-a-new-feature)
10. [Coding Standards](#10-coding-standards)
11. [Testing Guidelines](#11-testing-guidelines)
12. [Contribution Workflow](#12-contribution-workflow)

---

## 1. Prerequisites

Install the following before starting:

| Tool | Version | Install |
|---|---|---|
| Node.js | 20 LTS | [nodejs.org](https://nodejs.org) |
| npm | 10+ | Bundled with Node |
| Docker & Docker Compose v2 | Latest | [docker.com](https://docker.com) |
| Git | 2.40+ | `sudo apt install git` |

Verify:

```bash
node -v    # v20.x.x
npm -v     # 10.x.x
docker compose version   # Docker Compose version v2.x
```

---

## 2. Project Structure

```
sahary-cloud/
├── backend/                  # Node.js / Express API
│   ├── prisma/
│   │   ├── schema.prisma     # Database schema & indexes
│   │   ├── migrations/       # Auto-generated SQL migrations
│   │   └── seed.js           # Seed script for development data
│   ├── src/
│   │   ├── config/
│   │   │   ├── index.js      # Unified config object
│   │   │   ├── env.validation.js  # Joi schema — validates all env vars
│   │   │   ├── database.js   # Prisma client singleton
│   │   │   └── swagger.js    # OpenAPI 3.0 spec
│   │   ├── controllers/      # Request handlers (thin layer)
│   │   ├── middlewares/
│   │   │   ├── auth.js       # JWT authentication
│   │   │   ├── rbac.js       # Role-based access control
│   │   │   ├── correlationId.js  # Request trace IDs
│   │   │   ├── errorHandler.js
│   │   │   └── security.js   # Rate limiting, DDoS, sanitization
│   │   ├── routes/           # Express routers (with @swagger JSDoc)
│   │   ├── services/         # Business logic layer
│   │   │   ├── dockerService.js
│   │   │   ├── redisService.js
│   │   │   ├── emailService.js
│   │   │   └── solarService.js
│   │   ├── utils/
│   │   │   └── logger.js     # Winston logger
│   │   ├── validations/      # Joi/express-validator schemas
│   │   └── index.js          # Express app entry point
│   ├── .env.example          # Template — copy to .env
│   └── docker-compose.dev.yml  # PostgreSQL + Redis for development
│
└── frontend/                 # Next.js 14 App Router
    ├── app/
    │   ├── layout.tsx        # Root layout (fonts, providers, Web Vitals)
    │   ├── api/
    │   │   └── vitals/route.ts   # Edge route — receives Web Vitals
    │   └── [pages]/          # Each folder = a route
    ├── components/
    │   ├── ui/               # shadcn/ui primitives
    │   └── web-vitals-reporter.tsx
    ├── lib/
    │   ├── api.ts            # Typed API client (fetch wrapper)
    │   ├── auth-context.tsx  # Authentication context + hooks
    │   └── error-tracking.ts # Error reporting utilities
    └── .env.local            # Frontend environment variables
```

---

## 3. Local Development Setup

### Step 1 — Clone and install

```bash
git clone https://github.com/your-org/sahary-cloud.git
cd sahary-cloud

# Install backend deps
cd backend && npm install

# Install frontend deps
cd ../frontend && npm install
```

### Step 2 — Configure environment

```bash
cd backend
cp .env.example .env
# Edit .env — the defaults work for local dev out of the box
```

### Step 3 — Start the database and cache

```bash
cd backend
sudo docker compose -f docker-compose.dev.yml up -d postgres redis
```

> **Tip:** Add your user to the `docker` group (`sudo usermod -aG docker $USER`) to avoid `sudo` in future.

### Step 4 — Run database migrations

```bash
cd backend
npx prisma migrate dev     # applies migrations + regenerates client
npx prisma generate        # (only needed if schema changed without migrate)
```

### Step 5 — Seed development data (optional)

```bash
node prisma/seed.js
```

### Step 6 — Start both servers

Open two terminals:

```bash
# Terminal 1 — Backend (http://localhost:3000)
cd backend && npm run dev

# Terminal 2 — Frontend (http://localhost:3001)
cd frontend && npm run dev
```

### Useful local URLs

| URL | Description |
|---|---|
| `http://localhost:3000/health` | Backend health check |
| `http://localhost:3000/api-docs` | Swagger UI (dev only) |
| `http://localhost:3001` | Frontend |
| `http://localhost:3001/test-api` | API connection test page |
| `http://localhost:8080` | pgAdmin (DB browser) |
| `http://localhost:8081` | Redis Commander |

---

## 4. Environment Variables

All backend environment variables are validated on startup by `src/config/env.validation.js` using a Joi schema. The server **will not start** if required variables are missing.

See `backend/.env.example` for the complete annotated list (~45 variables across 14 categories).

**Development-safe defaults** (already in `.env.example`):

```env
NODE_ENV=development
DATABASE_URL="postgresql://sahary_user:sahary_pass@localhost:5432/sahary_cloud"
REDIS_URL="redis://localhost:6379"
JWT_SECRET="dev-secret-change-in-production"
JWT_REFRESH_SECRET="dev-refresh-secret"
CORS_ORIGIN="http://localhost:3001"
```

To see all validated config at startup, set `LOG_LEVEL=debug`.

---

## 5. NPM Scripts Reference

### Backend (`cd backend`)

| Script | Description |
|---|---|
| `npm run dev` | Start with nodemon (auto-reload) |
| `npm start` | Start in production mode |
| `npm test` | Run Jest test suite |
| `npm run db:start` | Start PostgreSQL + Redis containers |
| `npm run db:stop` | Stop database containers |
| `npm run db:logs` | Tail database container logs |
| `npm run prisma:migrate` | Create + apply a new migration |
| `npm run prisma:generate` | Regenerate Prisma client |
| `npm run prisma:studio` | Open Prisma Studio (visual DB browser) |
| `npm run prisma:seed` | Seed database with dev data |
| `npm run prisma:reset` | Drop + recreate DB and re-run migrations |

### Frontend (`cd frontend`)

| Script | Description |
|---|---|
| `npm run dev` | Start dev server on port 3001 |
| `npm run build` | Build production bundle |
| `npm start` | Serve production build |
| `npm run lint` | Run ESLint |

---

## 6. Code Architecture

### Backend — Request lifecycle

```
Request → correlationId → security middleware → rate limit
        → authenticate → RBAC (requirePermission)
        → validate (Joi/express-validator)
        → Controller → Service → Prisma → Database
        → Response
```

### Service layer pattern

All business logic lives in `src/services/`. Controllers stay thin:

```javascript
// ✅ Good — controller delegates to service
async createVM(req, res) {
  const vm = await vmService.create(req.user.id, req.body);
  res.status(201).json({ success: true, data: vm });
}

// ❌ Bad — business logic in controller
async createVM(req, res) {
  const exists = await prisma.virtualMachine.findFirst(...);
  // ... 50 lines of logic
}
```

### Frontend — Data fetching

Use the typed API client in `lib/api.ts` for all backend calls:

```typescript
import { api } from '@/lib/api';

// Inside a component or Server Action
const vms = await api.vms.list();
const vm  = await api.vms.create({ name: 'dev-server', cpu: 2, ram: 2048, storage: 20 });
```

Never `fetch()` the backend directly — the client handles auth headers, error normalization, and caching.

---

## 7. API Conventions

- **Base URL:** `/api/v1`
- **Auth:** Bearer token in `Authorization` header
- **Correlation ID:** Every request should include `X-Correlation-Id` for tracing (auto-generated if absent)

### Standard response shape

```json
// Success
{ "success": true, "data": { ... }, "pagination": { ... } }

// Error
{ "success": false, "message": "Human-readable error", "error": "TECHNICAL_CODE" }
```

### HTTP status codes used

| Code | When |
|---|---|
| 200 | Successful GET / update |
| 201 | Successful POST (resource created) |
| 204 | Successful DELETE or sendBeacon |
| 400 | Validation error |
| 401 | Missing or invalid token |
| 403 | Valid token but insufficient permissions |
| 404 | Resource not found |
| 503 | Dependency unavailable (Docker, Redis) |

### Interactive docs

Run the backend and open **http://localhost:3000/api-docs** to explore and test all endpoints with the built-in Swagger UI. Click **Authorize** and paste your JWT.

---

## 8. Database Workflow

### Making a schema change

1. Edit `prisma/schema.prisma`
2. Run `npx prisma migrate dev --name describe_your_change`
3. The Prisma client is regenerated automatically

### Adding indexes

Add `@@index([field])` to a model in `schema.prisma`:

```prisma
model MyModel {
  id     String @id @default(cuid())
  userId String
  status String

  @@index([userId])
  @@index([userId, status])  // compound index for filtered queries
}
```

### Viewing the database

```bash
npx prisma studio   # opens a browser GUI on http://localhost:5555
```

---

## 9. Adding a New Feature

Use this checklist when adding a new resource (e.g. "Snapshots"):

```
backend/
□ prisma/schema.prisma          — add Snapshot model + indexes
□ npx prisma migrate dev        — generate migration
□ src/validations/              — add snapshot.validation.js
□ src/services/snapshotService.js  — business logic
□ src/controllers/snapshotController.js  — thin handlers
□ src/routes/snapshots.js       — routes + @swagger JSDoc

frontend/
□ lib/api.ts                    — add api.snapshots.* methods
□ app/snapshots/page.tsx        — new page
□ components/SnapshotCard.tsx   — UI component
```

---

## 10. Coding Standards

### Backend (JavaScript)

- **Style:** 2-space indent, single quotes, semicolons
- **Async:** Always `async/await`, never raw `.then()` chains
- **Errors:** Throw `new Error('message')` — the error handler middleware catches it
- **Logging:** Use `logger.info/warn/error()`, never `console.log` in production code
- **Validation:** All route inputs validated with `express-validator` or Joi before reaching the controller

### Frontend (TypeScript)

- **Types:** No `any` — define proper interfaces
- **Components:** Functional only, no class components
- **Client vs Server:** Mark client-only components with `'use client'` at the top
- **Imports:** Use `@/` path alias (e.g. `@/lib/api`, `@/components/ui/button`)
- **Styling:** Tailwind utility classes only — no inline `style={}` props

### Git commit messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(vms):  add snapshot creation
fix(auth):  handle expired refresh token correctly
perf(db):   add index on usage_records.timestamp
docs(api):  document snapshot endpoints
test(vms):  add unit tests for snapshot service
```

---

## 11. Testing Guidelines

### Running tests

```bash
cd backend
npm test                     # run all tests
npm test -- --watch          # watch mode
npm test -- --coverage       # with coverage report
```

### Test structure

```
backend/src/__tests__/
├── unit/
│   ├── services/            # service layer unit tests (mock Prisma)
│   └── utils/               # utility function tests
└── integration/
    └── routes/              # route-level tests (supertest)
```

### Writing a test

```javascript
// src/__tests__/unit/services/vmService.test.js
const { createVM } = require('../../../services/vmService');

jest.mock('../../../config/database', () => ({
  prisma: { virtualMachine: { create: jest.fn() } }
}));

describe('vmService.createVM', () => {
  it('should throw if CPU exceeds limit', async () => {
    await expect(createVM('user-1', { cpu: 999, ram: 512, storage: 10 }))
      .rejects.toThrow('CPU limit exceeded');
  });
});
```

---

## 12. Contribution Workflow

1. **Branch** from `main`:  
   ```bash
   git checkout -b feat/my-feature
   ```

2. **Make changes** following the coding standards above

3. **Test** your changes:
   ```bash
   cd backend && npm test
   cd frontend && npm run lint
   ```

4. **Commit** with a conventional commit message

5. **Push** and open a Pull Request against `main`

6. **PR checklist:**
   - [ ] New/updated tests for changed code
   - [ ] `backend/.env.example` updated if new env vars added
   - [ ] `@swagger` JSDoc added/updated for new/changed routes
   - [ ] `docs/Tasks-2.md` updated if a task is completed

---

> For production deployment, see [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md).  
> For API reference, run the backend and visit `http://localhost:3000/api-docs`.
