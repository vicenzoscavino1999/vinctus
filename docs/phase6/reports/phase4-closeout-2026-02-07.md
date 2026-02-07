# Phase 4 Closeout - 2026-02-07

## Scope

Bundle/performance hardening focused on shipping-size risk and flaky smoke stability.

## Changes implemented

- `vite.config.ts`
  - Replaced generic vendor splitting with explicit `manualChunks` by dependency domain (`firebase-*`, `react-*`, `icons`, `image-compression`, etc.).
  - Removed `splitVendorChunkPlugin()` to avoid monolithic vendor chunking.
- `src/shared/lib/heic2any-loader.ts` (new)
  - Added on-demand CDN loader for `heic2any` so HEIC conversion is loaded only when needed.
- `src/features/posts/components/StoryComposerModal.tsx`
  - Switched HEIC conversion from bundled dynamic import to `loadHeic2Any()` runtime loader.
- `scripts/run-e2e-local-ci.mjs`
  - Smoke mode now includes `functions` emulator to remove known flaky behavior in critical-flow group readiness.
- `scripts/collect-phase4-metrics.mjs`
  - Reworked local server startup to use Vite in-process (`createServer`) for deterministic shutdown inside `firebase emulators:exec`.

## Build impact (before -> after)

Evidence source: `vite build` outputs captured during this phase.

- Largest chunk before: `heic2any-*.js` = `1,352.61 kB` -> removed from bundle output.
- Vendor chunk before: `vendor-*.js` = `991.65 kB` -> replaced by multiple targeted chunks.
- Largest chunk after: `firebase-firestore-*.js` = `460.01 kB` (below 500 kB warning threshold).
- PWA precache before: `8771.19 KiB` -> after: `7457.23 KiB` (`-1313.96 KiB`, `-15.0%`).
- Result: build no longer reports "Some chunks are larger than 500 kB" warning.

## Runtime metrics artifacts

- Baseline (existing): `phase4-metrics.json`
- Current capture: `docs/phase6/reports/phase4-metrics-after-2026-02-07.json`

Note: runtime metrics are highly cache-sensitive because Firestore local persistence is enabled; use them as trend evidence, not hard release gates for this phase.

## Validation run

- `npx vite build` -> PASS
- `npm run lint` -> PASS
- `npm run test:e2e:local-ci` -> PASS
- `npm run test:e2e:local-ci:smoke` -> PASS (2/2 without retry after including functions emulator)

## Open item

- `npm run build` currently fails at typecheck due an unrelated in-progress change in `src/tests/storage-rules/storage.rules.cases.ts` (`UploadTask` vs `Promise` typing in rules tests). This file was not modified in this phase.

## Phase 4 status

- Status: completed
- Gate (bundle/chunk hardening): met
- Gate (critical smoke stability): met
