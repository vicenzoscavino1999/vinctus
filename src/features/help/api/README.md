# Help API

Data-access module for support/feedback ticket submissions.

## Goals

- Validate support input contracts with `zod`.
- Normalize runtime errors with `AppError`.
- Use `withTimeout` + `withRetry` for write operations.
- Keep support modal contracts unchanged.

## Files

- `types.ts`: support ticket types and validation schemas.
- `mutations.ts`: ticket creation wrapper.

## Usage

- Consume support access from `@/features/help/api`.
- Avoid importing `@/shared/lib/firestore/*` directly from UI.

## Tests

- Unit:
  - `npm run test:run -- src/features/help/api/mutations.test.ts`
