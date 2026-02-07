# Phase 0 Baseline - 2026-02-07

Generated: 2026-02-07 00:48:00 -05:00  
Branch: `hardening/prod-readiness`  
Commit: `52aaea9`

## Scope

This baseline confirms the Phase 0 quality gates before starting production hardening work.

## Results

1. `npm run validate` -> PASS
   - `typecheck`: PASS
   - `lint`: PASS
   - `test:coverage`: PASS (`29` files, `195` tests, global coverage `93.27%` statements)
   - `build`: PASS

2. `npm run test:rules` -> PASS
   - `2` files, `20` tests passed.

3. `npm run metrics:phase6:gate` -> PASS
   - Feed reads reduction: PASS (`-40.0%`)
   - Chat reads reduction: PASS (`-99.4%`)
   - Feed listeners after round-trip: PASS (`0`)
   - Chat listeners after round-trip: PASS (`0`)
   - Feed read/view ratio: PASS (`1`)

4. `VITE_FIREBASE_PROJECT_ID=vinctus-dev; FIREBASE_PROJECT_ID=vinctus-dev; GCLOUD_PROJECT=vinctus-dev; npm run seed; npm run test:e2e:smoke` -> PASS
   - Smoke E2E: `2 passed`.

## Notes

- A direct run of `npm run test:rules:run` failed once due emulator shared state in local machine.  
  The clean isolated run with `npm run test:rules` (via `firebase emulators:exec`) passed and is the official Phase 0 baseline result.
- Smoke E2E was executed with explicit `projectId` alignment (`vinctus-dev`) to avoid local env mismatch.
