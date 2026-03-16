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

## Phase 3
- Convert low-risk backend modules first:
  - `src/config/*`
  - `src/utils/*`
  - `src/validations/*`
- Keep CommonJS compatibility where needed.

## Phase 4
- Convert services:
  - `src/services/*`
  - `src/jobs/*`
- Add explicit return types for critical business logic functions.

## Phase 5
- Convert controllers and routes:
  - `src/controllers/*`
  - `src/routes/*`
- Type request/response payloads and middleware augmentations.

## Phase 6
- Convert app entrypoint and socket layer:
  - `src/index.*`
  - `src/socket/*`
- Switch production scripts to compiled TypeScript output.

## Definition of Done
- 100% backend source in `.ts`.
- CI runs `npm run typecheck` with zero errors.
- Frontend API client consumes generated types from backend contract.
- Runtime behavior unchanged from pre-migration baselines.
