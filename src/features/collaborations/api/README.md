# Collaborations API (Phase 6)

This folder is the typed + resilient data-access layer for **collaborations** and collaboration requests.

## Queries

Source: `src/features/collaborations/api/queries.ts`

- `getCollaborations(limitCount?)`
  - Fetches open collaborations ordered by `createdAt desc`.
  - Includes fallback logic if the composite index is not ready.
- `getPendingCollaborationRequests(uid, limitCount?)`
  - Fetches pending requests for a collaboration owner ordered by `createdAt desc`.

Page variants are also available:

- `getCollaborationsPage(...)`
- `getPendingCollaborationRequestsPage(...)`

## Mutations

Source: `src/features/collaborations/api/mutations.ts`

- `createCollaboration(authorId, authorSnapshot, input)`
- `updateCollaboration(collaborationId, input)`
- `deleteCollaboration(authorId, collaborationId)`
- `sendCollaborationRequest(input)`
- `acceptCollaborationRequest(requestId)`
- `rejectCollaborationRequest(requestId)`

## Error model

- Inputs are validated with Zod and throw `AppError` (`VALIDATION_FAILED`).
- Firestore operations use `withTimeout` (5s) and `withRetry` for transient failures.
- Non-validation failures are normalized with `toAppError` (`PERMISSION_DENIED`, `NOT_AUTHENTICATED`, `NETWORK`, `TIMEOUT`, `UNKNOWN`).

## Indexes

- `collaborations` where `status == ...` order by `createdAt desc`.
- `collaboration_requests` where `toUid == ... && status == ...` order by `createdAt desc`.
- `collaboration_requests` where `fromUid == ... && collaborationId == ...`.

All of the above are defined in `firestore.indexes.json`.

## Emulator tests

Integration tests (Firebase Emulator) live at:

- `src/tests/emulators/collaborations/collaborations.queries.cases.ts`
- `src/tests/emulators/collaborations/collaborations.mutations.cases.ts`

Run:

- `npm run test:emulators`
