# Profile API

Data-access module for profile/follow queries and profile subscriptions.

## Goals

- Validate ids, limits, search inputs, and enum values with `zod`.
- Normalize runtime errors with `AppError`.
- Use `withTimeout` + `withRetry` for read/write operations.
- Keep subscriptions safe with idempotent unsubscribe wrappers.

## Files

- `types.ts`: public types and query schemas.
- `queries.ts`: read/query and subscription wrappers.
- `mutations.ts`: write wrappers for follow/profile/contributions/saved categories.

## Usage

- Consume profile access from `@/features/profile/api`.
- Prefer API wrappers instead of importing `@/shared/lib/firestore/*` in UI code.

## Tests

- Unit:
  - `npm run test:run -- src/features/profile/api/queries.test.ts`
  - `npm run test:run -- src/features/profile/api/mutations.test.ts`
