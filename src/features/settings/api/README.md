# Settings API (Phase 6)

This folder is the typed + resilient data-access layer for **user settings**.

Settings live under:

- `users/{uid}.settings.notifications`
- `users/{uid}.settings.privacy`

## Queries

Source: `src/features/settings/api/queries.ts`

- `getUserSettings(uid)`
  - Reads `users/{uid}` (owner-only rules).
  - Normalizes missing fields and applies `DEFAULT_NOTIFICATION_SETTINGS` / `DEFAULT_PRIVACY_SETTINGS`.

## Mutations

Source: `src/features/settings/api/mutations.ts`

- `updateNotificationSettings(uid, settings)`
  - Updates `users/{uid}` with `settings.notifications`.
- `updatePrivacySettings(uid, settings)`
  - Batch update:
    - `users/{uid}` with `settings.privacy`
    - `users_public/{uid}` with `{ accountVisibility, updatedAt }` (used by public profile/search)

## Error model

- Inputs are validated with Zod and throw `AppError` (`VALIDATION_FAILED`).
- Firestore operations use `withTimeout` (5s) and `withRetry` for transient failures.
- Non-validation failures are normalized with `toAppError` (`PERMISSION_DENIED`, `NOT_AUTHENTICATED`, `NETWORK`, `TIMEOUT`, `UNKNOWN`).

## Emulator tests

Integration tests (Firebase Emulator) live at:

- `src/tests/emulators/settings/settings.queries.cases.ts`
- `src/tests/emulators/settings/settings.mutations.cases.ts`

Run:

- `npm run test:emulators`
