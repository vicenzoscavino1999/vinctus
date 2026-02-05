# Posts API

This folder is the canonical data-access layer for **posts**. New Firestore logic should live here (not in `src/shared/lib/firestore.legacy.ts`).

## Queries

- `getFeedPostsPage(pageSize, cursor?)`
  - Cursor pagination over `posts` ordered by `createdAt desc`.
  - Returns `{ items, lastDoc, hasMore }`.
- `getFeedPostById(postId)`
  - Fetches a single post and normalizes legacy/new fields into `FeedPost`.

## Mutations

- `likePostWithSync(postId, uid)` / `unlikePostWithSync(postId, uid)`
  - Writes `posts/{postId}/likes/{uid}` + `users/{uid}/likes/{postId}` using `writeBatch`.
- `savePostWithSync(postId, uid)` / `unsavePostWithSync(postId, uid)`
  - Writes `users/{uid}/savedPosts/{postId}`.
- `addPostComment(postId, authorId, authorSnapshot, text)`
  - Writes `posts/{postId}/comments/{commentId}`.

## Error model

- Inputs are validated with Zod and throw `AppError` (`VALIDATION_FAILED`).
- Firestore operations use `withTimeout` (5s) and `withRetry` for transient failures.
- Non-validation failures are normalized with `toAppError` (`PERMISSION_DENIED`, `NOT_AUTHENTICATED`, `NETWORK`, `TIMEOUT`, `UNKNOWN`).

## Counters (important)

UI uses `posts.likeCount` and `posts.commentCount` as the default source for totals.

- `likeCount` is updated by Cloud Functions on like create/delete.
- `commentCount` is updated by Cloud Functions on comment create/delete.

## Tests

- Emulator integration: `npm run test:emulators` (starts `auth,firestore,storage,functions` via `firebase emulators:exec`).
