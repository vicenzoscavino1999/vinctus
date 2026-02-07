# Notifications API

Data-access module for notifications/activity reads.

## Goals

- Validate critical input contracts before querying Firestore.
- Normalize failures with `AppError`.
- Apply `withTimeout` + `withRetry` to read paths.

## Files

- `types.ts`: exported types and query schemas.
- `queries.ts`: read operations for user activity feed.

## Usage

- Consume from `@/features/notifications/api`.
- Keep list sizes bounded via `safeLimit`.

## Tests

- Unit:
  - `npm run test:run -- src/features/notifications/api/queries.test.ts`
