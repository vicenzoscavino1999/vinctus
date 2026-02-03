# Metrics baseline (Phase 0)

All metrics must include a capture method so they can be repeated later.

## Cost baseline (Firebase)

- Capture date: 2026-02-01 (console snapshot)
- Firestore:
  - Monthly cost: S/. 0.00
  - Reads/writes (console):
    - Reads: 2.0K (last 7 days: 2026-01-25 to 2026-02-01)
    - Writes: 147 (last 7 days)
    - Deletes: 0 (last 7 days)
    - Reads: 2.2K (last 24h)
    - Writes: 165 (last 24h)
  - Method: Firebase Console > Usage (Firestore). Note: dashboard updates are delayed.
- Functions:
  - Monthly cost: S/. 0.00
  - Invocations: 43
  - Method: Firebase Console > Usage (Functions).
- Storage (Cloud Storage):
  - Monthly cost: S/. 0.00
  - Stored: 19.8 MB
  - Egress: 923.2 KB (month-to-date)
  - Method: Firebase Console > Usage (Storage).
- Hosting (if used):
  - Monthly cost: S/. 0.00
  - Downloads: 0 B (peak 27.8 MB in last 7 days)
  - Storage: 272.8 MB (2.7% quota)
  - Method: Firebase Console > Hosting usage.
- Auth:
  - Monthly cost: S/. 0.00
  - MAU: 1
  - Method: Firebase Console > Authentication.

## Latency baseline (perceived)

- Login:
  - Time: TBD
  - Method: TBD (measure 3 runs; average)
- Feed open:
  - Time: TBD
  - Method: TBD (measure 3 runs; average)
- Chat open:
  - Time: TBD
  - Method: TBD (measure 3 runs; average)

## Bundle size baseline

- Build output (report link/file): TBD
- Total size: TBD
- Method: TBD (`npm run build` + analyzer report)

## Test coverage baseline

- Unit/integration coverage: TBD
- E2E coverage: TBD
- Method: TBD (Vitest coverage + Playwright report)

## Per-action reads/calls (dev logs)

- Open feed:
  - Reads/calls: TBD
  - Method:
    1. Run app in dev mode (`npm run dev:local`)
    2. In browser console: `window.vinctusMetrics.reset()`
    3. Navigate to `/feed`, wait for full render
    4. In console: `window.vinctusMetrics.snapshot().flows.feed`
    5. Save JSON with `window.vinctusMetrics.download('metrics-feed.json')`
- Open chat:
  - Reads/calls: TBD
  - Method:
    1. In browser console: `window.vinctusMetrics.reset()`
    2. Navigate to `/messages`, open 1 conversation
    3. In console: `window.vinctusMetrics.snapshot().flows.chat`
    4. Verify listener cleanup by leaving chat and checking `window.vinctusMetrics.snapshot().totals.listenersActive === 0`
    5. Save JSON with `window.vinctusMetrics.download('metrics-chat.json')`
- Create post:
  - Reads/calls: TBD
  - Method:
    1. In browser console: `window.vinctusMetrics.reset()`
    2. Navigate to `/feed`, create a post
    3. In console: `window.vinctusMetrics.logSummary()`
    4. Save JSON with `window.vinctusMetrics.download('metrics-create-post.json')`

## Phase 4 instrumentation (DEV only)

- Enabled in development (`npm run dev` / `npm run dev:local`) and can be forced with `VITE_ENABLE_DEV_METRICS=true`.
- Global helper available in browser console:
  - `window.vinctusMetrics.snapshot()`
  - `window.vinctusMetrics.reset()`
  - `window.vinctusMetrics.setFlow('feed' | 'chat' | 'login' | 'app')`
  - `window.vinctusMetrics.logSummary()`
  - `window.vinctusMetrics.download('metrics.json')`
- What it tracks:
  - Firestore reads/writes (SDK wrapper level)
  - Active listeners and peak listener count
  - App calls for auth flow (login/register/phone/signout)
  - Per-flow counters (`feed`, `chat`, `login`, `app`)
