# Backend TypeScript Migration Plan

## Objective

Move the backend from JavaScript to TypeScript in stages without breaking the current runtime, API contracts, or delivery of the shared-hosting MVP.

The frontend is already TypeScript-first, so the backend should become the typed source of truth for request/response contracts and business logic.

## Current State

- Backend runtime is still JavaScript entrypoint based.
- TypeScript toolchain already exists in `backend/tsconfig.json` and `backend/package.json`.
- `allowJs` is enabled, so the repo can migrate incrementally.
- OpenAPI export and frontend type generation are already wired.
- Phase 1 now includes real TS implementations for the shared config, env validation, logger, and validation registry modules.
- Phase 2 has started with a typed `authService.ts` implementation and auth-specific type definitions.
- Phase 2 now also includes a typed `vmService.ts` implementation and VM-specific type definitions.
- Phase 2 now also includes a completed typed `billingService.ts` implementation and billing-specific type definitions.
- Phase 2 now also includes a completed typed `billingController.ts` implementation for billing HTTP handlers.
- Phase 2 now also includes a completed typed `billing.ts` route module for billing endpoints.
- Phase 2 now also includes a completed typed `paymentService.ts` wrapper for payment operations.

## Migration Principles

- Keep the app runnable at every stage.
- Convert logic-heavy modules before glue code.
- Type shared contracts before controllers and routes.
- Avoid large cross-cutting rewrites.
- Preserve CommonJS compatibility until the last bootstrap phase.

## Recommended Migration Order

### Phase 1: Shared Types and Foundation

Convert the lowest-risk, highest-reuse code first.

Target areas:

- `backend/src/config/*`
- `backend/src/utils/*`
- `backend/src/validations/*`

What to extract:

- Request and response DTOs.
- Shared enums and role constants.
- Environment validation schema.
- Error classes and response helpers.
- Prisma helper wrappers and logger typings.

Why this comes first:

- These modules are used everywhere.
- They create the type foundation for the rest of the migration.
- They reduce duplication when services and controllers are converted.

### Phase 2: Business Services

Convert the core domain logic next.

Target areas:

- `backend/src/services/authService.js`
- `backend/src/services/vmService.js`
- `backend/src/services/billingService.js`
- `backend/src/services/paymentService.js`
- `backend/src/services/solarService.js`
- `backend/src/services/hostingService.js`
- `backend/src/services/redisService.js`
- `backend/src/services/dockerService.js`
- `backend/src/services/monitoringService.js`
- `backend/src/services/securityMonitorService.js`
- `backend/src/services/sessionService.js`

What to type:

- Service inputs and outputs.
- Database record shapes.
- External dependency wrappers.
- Return contracts for any call used by controllers.

Why this comes first among app logic:

- The services hold the real business rules.
- Type safety here prevents the most expensive runtime bugs.
- Controllers become much simpler after this step.

### Phase 3: Controllers

Convert HTTP controllers after service contracts are stable.

Target areas:

- `backend/src/controllers/authController.js`
- `backend/src/controllers/adminController.js`
- `backend/src/controllers/billingController.js`
- `backend/src/controllers/cacheController.js`
- `backend/src/controllers/dockerController.js`
- `backend/src/controllers/hostingController.js`
- `backend/src/controllers/monitoringController.js`
- `backend/src/controllers/paymentController.js`
- `backend/src/controllers/securityController.js`
- `backend/src/controllers/solarController.js`
- `backend/src/controllers/vmController.js`

What to type:

- `req`, `res`, and `next` usage.
- Route params, query params, and body payloads.
- Response envelopes and error handling paths.

Why this is next:

- Controllers are mostly wiring.
- Once services are typed, controller migration is mechanical.

### Phase 4: Middleware and Cross-Cutting Infrastructure

Convert middleware after controllers so request augmentation and auth contracts are known.

Target areas:

- `backend/src/middlewares/*`
- `backend/src/config/database.js`
- `backend/src/config/auth.js`
- `backend/src/config/swagger.js`
- `backend/src/config/env.validation.js`

What to type:

- Express request augmentation.
- Auth and RBAC middleware return types.
- Rate-limit and CSRF helpers.
- Error handler signatures.

Why this matters:

- Middleware is where request context gets created and transformed.
- Strong types here reduce subtle runtime mismatches.

### Phase 5: Routes

Convert route modules after controllers and middleware are stable.

Target areas:

- `backend/src/routes/auth.js`
- `backend/src/routes/admin.js`
- `backend/src/routes/billing.js`
- `backend/src/routes/cache.js`
- `backend/src/routes/docker.js`
- `backend/src/routes/hosting.js`
- `backend/src/routes/monitoring.js`
- `backend/src/routes/payments.js`
- `backend/src/routes/security.js`
- `backend/src/routes/solar.js`
- `backend/src/routes/vms.js`

What to type:

- Route parameter shapes.
- Middleware ordering assumptions.
- Public vs protected endpoints.

### Phase 6: Jobs and Real-Time Layer

Convert background jobs and sockets once the service layer is typed.

Target areas:

- `backend/src/jobs/*`
- `backend/src/socket/*`

What to type:

- Job scheduler contracts.
- Socket event payloads.
- Startup and shutdown hooks.

### Phase 7: App Bootstrap

Convert the entrypoint last.

Target areas:

- `backend/src/index.js`

What to keep stable until the end:

- Server startup behavior.
- Health check behavior.
- Redis/session initialization.
- Socket initialization.
- Graceful shutdown logic.

## What Should Stay Out of the First Migration Pass

- Prisma migrations and seed scripts.
- One-off maintenance scripts.
- Generated OpenAPI output.
- Test files unless they need small type helpers.

## Suggested TypeScript Boundaries

Create a small shared layer early so later conversion is easier.

Recommended folder additions:

- `backend/src/types/`
- `backend/src/contracts/`
- `backend/src/schemas/`

Candidate shared files:

- Request DTOs for auth, billing, hosting, VM, and solar.
- Response envelopes.
- Express request augmentation types.
- Domain enums for status, roles, and plan tiers.

## Acceptance Criteria

- Backend source code is fully TypeScript.
- Runtime entrypoint uses compiled output.
- `npm run typecheck` passes.
- OpenAPI export still succeeds.
- Frontend generated types still match backend contracts.
- No user-facing API behavior changes unless explicitly planned.

## Safety Gates For Each Phase

- Typecheck before merging.
- Run the relevant test subset for the migrated layer.
- Verify OpenAPI export when request/response shapes change.
- Keep runtime parity with the previous JS implementation.

## Practical First Move

If you want the fastest low-risk start, begin with:

1. `backend/src/config/*`
2. `backend/src/utils/*`
3. `backend/src/validations/*`
4. `backend/src/services/authService.js`
5. `backend/src/services/vmService.js`

That sequence gives the frontend the most value early because it stabilizes the API contract and the most reused business logic.
