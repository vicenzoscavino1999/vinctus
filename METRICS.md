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

## Phase 4 before/after (2026-02-04 closeout rerun)

- Goal thresholds:
  - Feed reads per open: -30% to -50%
  - Chat reads per open: -30% to -50%
  - Duplicated listeners: 0 (`listenersActiveAfterLeave === 0`)
  - Index warnings on key flows (feed/chat): 0
- Capture method (repeatable):
  1. Set env vars: `FIREBASE_PROJECT_ID=vinctus-dev`, `VITE_FIREBASE_PROJECT_ID=vinctus-dev`, `GCLOUD_PROJECT=vinctus-dev`.
  2. Run emulators **without functions**:
     `npx firebase emulators:exec --project vinctus-dev --only auth,firestore,storage "npm run seed && node scripts/collect-phase4-metrics.mjs"`
  3. Baseline (`phase4-metrics-before.json`): `main` commit `57b22a1`, captured at `2026-02-03T22:33:09.500Z`.
  4. After (`phase4-metrics-after.json`): current branch, captured at `2026-02-04T01:34:24.292Z`.
  5. Compare `flows.feed` / `flows.chat` plus `listenersActiveAfterLeave`.

| Metric                         |     Before |      After |  Delta | Threshold    | Status |
| ------------------------------ | ---------: | ---------: | -----: | ------------ | ------ |
| Feed reads/open                |         20 |          8 | -60.0% | -30% to -50% | PASS   |
| Chat reads/open                |         16 |         11 | -31.3% | -30% to -50% | PASS   |
| Feed listenersActiveAfterLeave |          4 |          0 |     -4 | 0            | PASS   |
| Chat listenersActiveAfterLeave |          4 |          0 |     -4 | 0            | PASS   |
| Index warnings (feed/chat)     | 0 observed | 0 observed |    n/a | 0            | PASS   |

- Notes:
  - Feed reduction is stronger than target range due removing extra per-item count calls.
  - Chat flow now meets the target reduction and listener cleanup target.
  - This rerun clears the remaining Phase 4 metrics gate for feed/chat instrumentation.
