# Collections API (Phase 6)

This folder is the typed + resilient data-access layer for **collections**.

Collections live under:

- `users/{uid}/collections/{collectionId}`
- `users/{uid}/collections/{collectionId}/items/{itemId}`

## Queries

Source: `src/features/collections/api/queries.ts`

- `getUserCollections(uid, limitCount?)`
- `getCollectionItems(uid, collectionId, limitCount?)`
- `getRecentCollectionItems(uid, limitCount?)`

Page variants are also available:

- `getUserCollectionsPage(...)`
- `getCollectionItemsPage(...)`

## Mutations

Source: `src/features/collections/api/mutations.ts`

- `createCollection(uid, input)`
- `updateCollection(uid, collectionId, input)`
- `deleteCollection(uid, collectionId)`
- `createCollectionItem(uid, collectionId, input)`
- `deleteCollectionItem(uid, collectionId, itemId)`

## Error model

- Inputs are validated with Zod and throw `AppError` (`VALIDATION_FAILED`).
- Firestore operations use `withTimeout` (5s) and `withRetry` for transient failures.
- Non-validation failures are normalized with `toAppError` (`PERMISSION_DENIED`, `NOT_AUTHENTICATED`, `NETWORK`, `TIMEOUT`, `UNKNOWN`).

## Indexes

- `items` collection group where `ownerId == ...` order by `createdAt desc` (defined in `firestore.indexes.json`).

## Emulator tests

Integration tests (Firebase Emulator) live at:

- `src/tests/emulators/collections/collections.queries.cases.ts`
- `src/tests/emulators/collections/collections.mutations.cases.ts`

Run:

- `npm run test:emulators`
