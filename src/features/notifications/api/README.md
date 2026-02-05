# Notifications API (Phase 6)

This folder is the typed + resilient data-access layer for the **notifications / activity** domain.

## Queries

Source: `src/features/notifications/api/queries.ts`

- `getUserActivity(uid, pageSize?, cursor?)`
  - Cursor pagination over `notifications` filtered by `toUid == uid` and ordered by `createdAt desc`.
  - Returns `{ items, lastDoc, hasMore }`.

## Error model

- Inputs are validated with Zod and throw `AppError` (`VALIDATION_FAILED`).
- Firestore operations use `withTimeout` (5s) and `withRetry` for transient failures.
- Non-validation failures are normalized with `toAppError` (`PERMISSION_DENIED`, `NOT_AUTHENTICATED`, `NETWORK`, `TIMEOUT`, `UNKNOWN`).

## Indexes

- `notifications` where `toUid == ...` order by `createdAt desc` (defined in `firestore.indexes.json`).

## Emulator tests

Integration tests (Firebase Emulator) live at:

- `src/tests/emulators/notifications/notifications.queries.cases.ts`

Run:

- `npm run test:emulators`
