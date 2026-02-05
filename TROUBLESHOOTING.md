# Troubleshooting

## `npm run validate` fails

- Run `npm run typecheck` and `npm run lint` separately to isolate first failing gate.
- Fix only the reported module first, then rerun `npm run validate`.

## Playwright cannot log in

- Ensure emulator data is seeded before E2E:
  - `npm run seed`
- Use the seed credentials:
  - `alice@vinctus.local` / `password123`

## E2E fails with missing emulator services

- Start E2E through emulator wrapper:

```bash
npm run test:e2e:critical
```

- This command starts emulators, seeds data, and executes critical flows.

## Chat tests fail because no conversations exist

- Rerun seed data:

```bash
npm run seed
```

- Verify `conversations/dm_user_a_user_b` exists in Firestore emulator UI.

## Lighthouse scores are below target

- Generate fresh reports:

```bash
npm run lhci:phase6
```

- Open reports in `docs/phase6/reports/lhci` and inspect:
  - render-blocking resources
  - unused JS
  - long tasks

## Firebase deploy fails by missing indexes

- Add required index to `firestore.indexes.json`.
- Document it in `docs/firestore-indexes.md`.
- Redeploy indexes:

```bash
firebase deploy --only firestore:indexes --project vinctus-daf32
```

## Permission denied in emulator tests

- Confirm project/env alignment:
  - `FIREBASE_PROJECT_ID=vinctus-dev`
  - `GCLOUD_PROJECT=vinctus-dev`
  - `VITE_USE_FIREBASE_EMULATOR=true`
- Re-run with clean emulator session using `firebase emulators:exec ...`.
