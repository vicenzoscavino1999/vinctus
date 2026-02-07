# Collaborations API

Data-access module for collaboration listings and request workflows.

## Goals

- Validate ids, limits, and mutation inputs with `zod`.
- Normalize runtime errors with `AppError`.
- Use `withTimeout` + `withRetry` for read/write operations.
- Keep project/collaboration UI contracts unchanged.

## Files

- `types.ts`: public types and validation schemas.
- `queries.ts`: read wrappers (`getCollaborations`, pending requests).
- `mutations.ts`: create/update/request/accept/reject/delete wrappers.

## Usage

- Consume collaboration access from `@/features/collaborations/api`.
- Avoid importing `@/shared/lib/firestore/*` directly from UI.

## Tests

- Unit:
  - `npm run test:run -- src/features/collaborations/api/queries.test.ts`
  - `npm run test:run -- src/features/collaborations/api/mutations.test.ts`
