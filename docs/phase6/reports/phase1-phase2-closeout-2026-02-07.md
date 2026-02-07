# Phase 1 + Phase 2 Closeout - 2026-02-07

Branch: `hardening/prod-readiness`

## Phase 1 (AI chat hardening)

Implemented:

- Authentication is now mandatory for all `POST /api/chat` requests.
- `idToken` in request body was removed from the client (`Authorization: Bearer <token>` only).
- Strict payload validation added:
  - allowed body keys: `message`, `history`
  - message/history limits and schema checks
  - oversized payload protection (`413`).
- Rate limiting added per user and per IP (minute + daily limits, configurable by env).
- Upstream timeout handling added with `AbortController`.
- Sanitized upstream/logging behavior for model failures.
- Dedicated API tests added (`npm run test:api`).

Files:

- `api/chat.ts`
- `api/lib/rateLimit.ts`
- `api/chat.test.ts`
- `src/shared/lib/aiChat.ts`
- `vitest.api.config.ts`
- `package.json`
- `.github/workflows/ci.yml`
- `.env.example`

## Phase 2 (runtime dependency risk)

Implemented:

- Updated `functions` lockfile via `npm audit fix`.
- Re-verified runtime security audit for functions.

File:

- `functions/package-lock.json`

## Validation summary

- `npm run validate` -> PASS
- `npm run test:api` -> PASS
- `npm run functions:build` -> PASS
- `npm audit --omit=dev` (root) -> PASS (`0 vulnerabilities`)
- `npm audit --omit=dev` (`functions/`) -> PASS (`0 vulnerabilities`)
