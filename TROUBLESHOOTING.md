# Troubleshooting

Last update: 2026-02-07

## 1) Metrics collector fails to login in emulator runs

Symptoms:

- `npm run metrics:phase6:collect` fails with login timeout.

Checks:

- Emulators are running on `127.0.0.1` ports `8080/9099/9199/5001`.
- Seed user exists (`alice@vinctus.local`).
- Onboarding flag is set (`vinctus_onboarding_complete=true`).

Fix:

```powershell
$env:FIREBASE_PROJECT_ID='vinctus-dev'
$env:VITE_FIREBASE_PROJECT_ID='vinctus-dev'
$env:GCLOUD_PROJECT='vinctus-dev'
npm run seed
npm run metrics:phase6:seed
$env:METRICS_OUT='docs/phase6/reports/phase6-metrics-before.json'
npm run metrics:phase6:collect
```

## 2) Chat reads are unexpectedly high

Symptoms:

- `chat_open` flow reads spike in metrics report.

Likely causes:

- Oversized realtime scope (too many direct conversation docs).
- Duplicate subscriptions after navigation.
- Missing cleanup on route leave.

Checks:

- Verify `listenersActiveAfterRoundTrip == 0` in `phase6-metrics-after.json`.
- Run `npm run guardrails` (raw `onSnapshot` check).
- Confirm direct conversation and membership limits stay at 50.

## 3) Firestore persistence warnings

Symptoms:

- Console warning about IndexedDB persistence not available.

Cause:

- Browser/private mode/device constraints prevent persistent local cache.

Behavior:

- App falls back to memory cache automatically.

Action:

- No immediate fix required unless offline persistence is a hard requirement.

## 4) Release gate fails (`metrics:phase6:gate`)

Symptoms:

- `npm run metrics:phase6:gate` returns non-zero.

Fix:

1. Regenerate before/after files with same seed dataset.
2. Re-run compare report.
3. Inspect failing threshold from script output.
4. Do not approve release until all checks pass.

## 5) Missing composite index error in console

Symptoms:

- Query fails with "The query requires an index".

Fix:

```bash
firebase deploy --only firestore:indexes
```

Then verify contracts in `docs/firestore-indexes.md`.

## 6) `npm run validate` fails

Fix path:

1. Run `npm run typecheck`.
2. Run `npm run lint`.
3. Run `npm run test:coverage`.
4. Run `npm run build`.

Address the first failing stage before re-running full validate.
