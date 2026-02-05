# Events API (Phase 6)

This folder is the typed + resilient data-access layer for the **events** domain.

## Queries

Source: `src/features/events/api/queries.ts`

- `getUpcomingEvents(limitCount?)`
  - Fetches public future events ordered by `startAt asc`.
  - If no future events are found, it falls back to recent public events (`limitToLast`).
- `isEventAttendee(eventId, uid)`
  - Checks if `events/{eventId}/attendees/{uid}` exists.
- `getEventAttendeeCount(eventId)`
  - Uses Firestore aggregation count on `events/{eventId}/attendees`.

## Mutations

Source: `src/features/events/api/mutations.ts`

- `createEvent(ownerId, input)` / `updateEvent(eventId, input)` / `deleteEvent(eventId)`
  - Create/update/delete event metadata in `events`.
- `joinEvent(eventId, uid)` / `leaveEvent(eventId, uid)`
  - Public attendance flow in `events/{eventId}/attendees`.

## Error model

- Inputs are validated with Zod and throw `AppError` (`VALIDATION_FAILED`).
- Firestore operations use `withTimeout` (5s) and `withRetry` for transient failures.
- Non-validation failures are normalized with `toAppError` (`PERMISSION_DENIED`, `NOT_AUTHENTICATED`, `NETWORK`, `TIMEOUT`, `UNKNOWN`).

## Indexes

- `events` where `visibility == ...` and `startAt >= ...` order by `startAt asc` (defined in `firestore.indexes.json`).

## Emulator tests

Integration tests (Firebase Emulator) live at:

- `src/tests/emulators/events/events.queries.cases.ts`
- `src/tests/emulators/events/events.mutations.cases.ts`

Run:

- `npm run test:emulators`
