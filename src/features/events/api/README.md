# Events API

Data-access module for event reads and writes.

## Goals

- Validate event ids, user ids, limits, and mutation inputs with `zod`.
- Normalize runtime errors with `AppError`.
- Use `withTimeout` + `withRetry` for reads and writes.
- Keep UI contracts unchanged (`createEvent`, `updateEvent`, `joinEvent`, `getUpcomingEvents`, etc.).

## Files

- `types.ts`: public types and validation schemas.
- `queries.ts`: read wrappers (`getUpcomingEvents`, attendance reads).
- `mutations.ts`: write wrappers (create/update/join/leave/delete).

## Usage

- Consume event access from `@/features/events/api`.
- Avoid importing `@/shared/lib/firestore/*` directly from UI components.

## Tests

- Unit:
  - `npm run test:run -- src/features/events/api/queries.test.ts`
  - `npm run test:run -- src/features/events/api/mutations.test.ts`
