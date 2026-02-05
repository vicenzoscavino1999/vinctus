# Groups API (Phase 6)

This folder is the canonical data-access layer for the **groups** domain.

## Queries

Source: `src/features/groups/api/queries.ts`

- `getGroupsPage(pageSize, cursor?)`
  - Cursor pagination over `groups` ordered by `memberCount desc`.
  - Returns `{ items, lastDoc, hasMore }`.
- `getGroupsByCategoryPage(categoryId, pageSize, cursor?)`
  - Cursor pagination over `groups` filtered by `categoryId`.
- `getGroup(groupId)`
  - Fetches a single group document (returns `null` when missing).
- `getGroupJoinStatus(groupId, uid)`
  - Returns `member | pending | none` using:
    - `groups/{groupId}/members/{uid}`
    - `group_requests` where `groupId == ... && fromUid == ... && status == pending`
- `getGroupMembersPage(groupId, pageSize, cursor?)`
  - Cursor pagination over `groups/{groupId}/members` ordered by `joinedAt desc`.
- `getPostsByGroup(groupId, pageSize, cursor?)`
  - Cursor pagination over `posts` where `groupId == ...` ordered by `createdAt desc`.
- `getGroupMemberCount(groupId)`
  - Aggregation query on `groups/{groupId}/members`.
- `getGroupPostsWeekCount(groupId)`
  - Aggregation query on `posts` where `groupId == ... && createdAt >= weekAgo`.

## Mutations

Source: `src/features/groups/api/mutations.ts`

- `createGroup(ownerId, input)` / `updateGroup(groupId, input)`
  - Creates/updates group metadata with Zod validation + `withTimeout/withRetry`.
- `joinPublicGroup(groupId, uid)`
  - Reads `groups/{groupId}` to validate `visibility == public`, then writes membership docs.
- `joinGroupWithSync(groupId, uid)` / `leaveGroupWithSync(groupId, uid)`
  - Offline-first membership writes using a single `writeBatch`.
- `sendGroupJoinRequest(input)` / `acceptGroupJoinRequest(requestId)` / `rejectGroupJoinRequest(requestId)`
  - Private-group join request flow (`group_requests`).
- `addGroupMember(groupId, uid, role?)` / `removeGroupMember(groupId, uid)` / `updateGroupMemberRole(groupId, uid, role)`
  - Owner moderation helpers.
- `getOrCreateGroupConversation(groupId, uid)`
  - Re-exported from `src/features/chat/api/mutations.ts`.

## Counters

- `groups.memberCount` is updated by a Cloud Function on create/delete of `groups/{groupId}/members/{uid}`.

## Error model

- Inputs are validated with Zod and throw `AppError` (`VALIDATION_FAILED`).
- Firestore operations use `withTimeout` (5s) and `withRetry` for transient failures.
- Non-validation failures are normalized with `toAppError` (`PERMISSION_DENIED`, `NOT_AUTHENTICATED`, `NETWORK`, `TIMEOUT`, `UNKNOWN`).

## Emulator tests

Integration tests (Firebase Emulator) live at:

- `src/tests/emulators/groups/groups.queries.cases.ts`
- `src/tests/emulators/groups/groups.mutations.cases.ts`

Run:

- `npm run test:emulators`
