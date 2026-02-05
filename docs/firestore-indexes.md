# Firestore indexes

This project uses `firestore.indexes.json` as the source of truth for composite indexes.

## Posts (P0)

**Feed**

- `posts` ordered by `createdAt desc` -> single-field index (no composite index required).

**Common list queries (composite indexes)**

These are required when filtering by an equality field and ordering by `createdAt`:

- `posts` where `groupId == ...` order by `createdAt desc`
- `posts` where `authorId == ...` order by `createdAt desc`
- `posts` where `categoryId == ...` order by `createdAt desc`

All of the above are already defined in `firestore.indexes.json`.

## Notifications (existing)

- `notifications` where `toUid == ...` order by `createdAt desc` (defined in `firestore.indexes.json`).

## Profile (P0)

- `users_public/{uid}` fetched by document id -> no composite index required.
- `users_public` where `documentId() in [...]` (chunked by 10) -> no composite index required.
- `follow_requests` where `toUid == ... && status == ...` order by `createdAt desc` (defined in `firestore.indexes.json`).
- `follow_requests` where `fromUid == ... && status == ...` order by `createdAt desc` (defined in `firestore.indexes.json`).
- `contributions` where `categoryId == ...` order by `createdAt desc` (defined in `firestore.indexes.json`).

## Settings (P1)

- `users/{uid}` fetched by document id -> no composite index required.

## Events (P1)

- `events` where `visibility == ... && startAt >= ...` order by `startAt asc` (defined in `firestore.indexes.json`).
- `events` where `visibility == ...` order by `startAt desc` (defined in `firestore.indexes.json`).

## Collections (P1)

- `users/{uid}/collections` ordered by `createdAt desc` -> single-field index.
- `users/{uid}/collections/{collectionId}/items` ordered by `createdAt desc` -> single-field index.
- `items` collection group where `ownerId == ...` order by `createdAt desc` (defined in `firestore.indexes.json`).

## Chat (P0)

- `users/{uid}/directConversations` ordered by `updatedAt desc` (single-field index).
- `users/{uid}/memberships` ordered by `joinedAt desc` (single-field index).
- `conversations/{conversationId}/messages` ordered by `clientCreatedAt desc` (single-field index).

## Groups (P0)

- `groups` ordered by `memberCount desc` -> single-field index (no composite index required).
- `groups` where `categoryId == ...` -> single-field index (no composite index required).
- `groups/{groupId}/members` ordered by `joinedAt desc` -> single-field index.
- `group_requests` where `groupId == ... && fromUid == ... && status == ...` (defined in `firestore.indexes.json`).

## Collaborations (P1)

- `collaborations` where `status == ...` order by `createdAt desc` (defined in `firestore.indexes.json`).
- `collaboration_requests` where `toUid == ... && status == ...` order by `createdAt desc` (defined in `firestore.indexes.json`).
- `collaboration_requests` where `fromUid == ... && collaborationId == ...` (defined in `firestore.indexes.json`).
