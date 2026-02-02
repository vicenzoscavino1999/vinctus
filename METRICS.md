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
  - Method: TBD (dev logs + Firebase emulator logs)
- Open chat:
  - Reads/calls: TBD
  - Method: TBD (dev logs + Firebase emulator logs)
- Create post:
  - Reads/calls: TBD
  - Method: TBD (dev logs + Firebase emulator logs)
