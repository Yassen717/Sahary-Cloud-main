# Backend TypeScript Migration Plan (Staged)

## Goal
Migrate backend from JavaScript to TypeScript without blocking feature delivery or breaking runtime.

## Phase 1 (Completed)
- Added TypeScript toolchain and configuration.
- Kept runtime entrypoint unchanged: `src/index.js`.
- Added typecheck/build scripts for incremental adoption.

## Phase 2 (In Progress)
- Added backend OpenAPI export script: `npm run openapi:export`.
- Added frontend generated contract types from backend OpenAPI.
- Added drift-check command: `npm run api:types:check` (frontend).
- Next: wire this command into your CI workflow file when CI is introduced.

## Phase 3 (Completed)
- Converted low-risk backend modules:
  - `src/config/*`
  - `src/utils/*`
  - `src/validations/*`
- Kept CommonJS compatibility where needed (`module.exports`/`export =` parity).

## Phase 4 (Completed)
- Converted services and jobs:
  - `src/services/*`
  - `src/jobs/*`

## Phase 5 (Completed)
- Converted controllers and routes:
  - `src/controllers/*`
  - `src/routes/*`

## Phase 6 (Completed)
- Converted app entrypoint and socket layer:
  - `src/index.ts`
  - `src/socket/*`
- Removed all stale `.js` siblings from `src/` and `tests/` (100% `.ts`).
- `tsconfig` `allowJs: false`; `npm run build:ts` emits `dist/` from `.ts` only.
- `openapi:export` runs under `tsx` (`src/config/swagger.ts` is `.ts`-only).
- ESLint wired for `.ts` via `@typescript-eslint` (`npm run lint` covers `src/**/*.ts`).

## Definition of Done
- 100% backend source in `.ts`. ✅ (src/ and tests/)
- `npm run typecheck` with zero errors. ✅
- Frontend API client consumes generated types from backend contract. ✅ (`api:types:check`)
- Runtime behavior unchanged from pre-migration baselines.
