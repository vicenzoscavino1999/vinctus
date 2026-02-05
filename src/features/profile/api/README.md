# Profile API (Phase 6)

This folder is the typed + resilient data-access layer for the **profile** domain.

Note: some APIs are still re-exported from `src/shared/lib/firestore.legacy.ts` while the extraction is in progress.

## Queries

Source: `src/features/profile/api/queries.ts`

- `getUserProfile(uid)`
  - Reads `users_public/{uid}` for all profiles.
  - Reads `users/{uid}` only when `auth.currentUser.uid === uid` (rules: private profile is owner-only).
  - Uses a small in-memory cache (TTL 60s) to reduce repeated reads.

- `getUserProfilesByIds(uids)`
  - Batch fetch for public profiles using `users_public` + `documentId() in [...]` (chunked by 10).
  - Returns `Map<uid, UserProfileRead | null>`.

## Mutations

Source: `src/features/profile/api/mutations.ts`

- `updateUserProfile(uid, updates)`
  - Syncs private data in `users/{uid}` and public fields in `users_public/{uid}`.
- `createContribution(input)` / `updateContributionFile(contributionId, fileInput)`
  - Portfolio contributions write/update flow in `contributions`.
- `saveCategoryWithSync(categoryId, uid)` / `unsaveCategoryWithSync(categoryId, uid)`
  - Manages `users/{uid}/savedCategories/{categoryId}`.
- Follow actions: `sendFollowRequest`, `cancelFollowRequest`, `acceptFollowRequest`, `declineFollowRequest`, `followPublicUser`, `unfollowUser`.
- Chat bridge: `getOrCreateDirectConversation(uid1, uid2)`.

## Error model

- Inputs are validated with Zod and throw `AppError` (`VALIDATION_FAILED`).
- Firestore operations use `withTimeout` (5s) and `withRetry` for transient failures.
- Non-validation failures are normalized with `toAppError` (`PERMISSION_DENIED`, `NOT_AUTHENTICATED`, `NETWORK`, `TIMEOUT`, `UNKNOWN`).

## Emulator tests

Integration tests (Firebase Emulator) live at:

- `src/tests/emulators/profile/profile.queries.cases.ts`
- `src/tests/emulators/profile/profile.mutations.cases.ts`

Run:

- `npm run test:emulators`
