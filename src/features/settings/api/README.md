# Settings API

Data-access module for user settings (notifications and privacy).

## Goals

- Validate settings contracts with `zod`.
- Normalize read/write failures with `AppError`.
- Apply `withTimeout` + `withRetry` for Firestore operations.

## Files

- `types.ts`: exported types and schemas.
- `queries.ts`: defaults and user-settings reads.
- `mutations.ts`: settings write operations.

## Usage

- Consume from `@/features/settings/api`.
- Keep UI code free of direct `@/shared/lib/firestore/*` imports for settings.

## Tests

- `npm run test:run -- src/features/settings/api/queries.test.ts src/features/settings/api/mutations.test.ts`
