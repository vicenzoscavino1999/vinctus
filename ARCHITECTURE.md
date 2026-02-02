# Architecture snapshot (baseline)

This document captures the current state before migration. Update it only in Phase 0 and when a major change lands.

## Routes and domains

- Routes list (from `src/components/AppLayout.tsx`):
  - `/` -> Discover
  - `/discover`
  - `/search`
  - `/category/:categoryId`
  - `/feed`
  - `/projects`
  - `/library`
  - `/settings`
  - `/settings/notifications`
  - `/settings/privacy`
  - `/help`
  - `/profile`
  - `/user/:userId`
  - `/user/:userId/connections`
  - `/notifications`
  - `/messages`
  - `/messages/:conversationId/details`
  - `/messages/:conversationId/group-details`
  - `/group/:groupId`
  - `/group/:groupId/edit`
  - `/post/:postId`
  - `*` -> Discover

- Domain map (features suggested by current routes and data):
  - Discover (categories, groups, posts)
  - Search + user profiles
  - Feed (global and category feeds)
  - Messaging (conversations, messages, typing)
  - Groups (group detail, members, edit)
  - Posts (detail, comments, likes)
  - Projects / collaborations / events
  - Library / collections
  - Notifications
  - Settings + privacy + help
  - Auth + onboarding

## Firebase usage

- Firestore collections (top-level):
  - `users`, `users_public`
  - `posts`, `groups`, `events`, `stories`
  - `conversations`
  - `notifications`
  - `friend_requests`, `follow_requests`, `group_requests`
  - `collaborations`, `collaboration_requests`
  - `collections` (user collections live under users)
  - `contributions`, `reports`, `support_tickets`

- Firestore subcollections (known):
  - `groups/{groupId}/members`
  - `posts/{postId}/comments`, `posts/{postId}/likes`
  - `events/{eventId}/attendees`
  - `conversations/{conversationId}/messages`, `conversations/{conversationId}/members`, `conversations/{conversationId}/typing`
  - `users/{uid}/followers`, `users/{uid}/following`, `users/{uid}/friends`
  - `users/{uid}/blockedUsers`, `users/{uid}/memberships`, `users/{uid}/likes`
  - `users/{uid}/savedPosts`, `users/{uid}/savedCategories`
  - `users/{uid}/collections/{collectionId}/items`
  - `users/{uid}/directConversations`

- CollectionGroup usage:
  - `items` (collection group for collection items)
  - `messages` (collection group for conversations in functions)

- Primary data access layer:
  - `src/lib/firestore.ts` (queries, mutations, subscriptions)
  - `src/lib/storage.ts` (uploads, downloads, deletes)
  - `src/lib/firebase.ts` (Firebase config + auth/firestore/functions/storage)

- Active listeners (examples):
  - user profile subscriptions
  - memberships, likes, saved posts/categories
  - conversations/messages/typing subscriptions

- Cloud Functions (from `functions/src/index.ts`):
  - `onEventAttendeeCreated`, `onEventAttendeeDeleted`
  - `onUserFollowerCreated`, `onUserFollowerDeleted`
  - `onUserFollowingCreated`, `onUserFollowingDeleted`
  - `onFollowRequestUpdated`
  - `onGroupMemberCreated`, `onGroupMemberDeleted`
  - `onPostLikeCreated`, `onPostLikeDeleted`
  - `onGroupDeleted`, `onEventDeleted`
  - `onPostCreated`, `onPostDeleted`
  - `onCollectionItemDeleted`, `onCollectionDeleted`
  - `onUserPublicProfileUpdated`
  - `onFriendRequestWrite`, `onDirectConversationWrite`
  - `revokeUserSessions`

- Admin/backfill scripts (in `functions/scripts/`):
  - backfill counters, friends, direct conversations, group conversations, orphan groups, karma

## Critical dependencies

- App shell/layout:
  - `src/App.tsx` (BrowserRouter + Auth/AppState + layout)
  - `src/components/AppLayout.tsx` (routes + layout)
- Auth/session:
  - `src/context/AuthContext.tsx`
  - `src/lib/firebase.ts` (Auth, Google provider)
- Data access layer:
  - `src/lib/firestore.ts`, `src/lib/storage.ts`
- External APIs:
  - `src/services/api.ts` (arXiv, Wikipedia, HackerNews, OpenLibrary, iNaturalist)

## Notes

- This file is a snapshot; update only at the end of a phase or when the architecture materially changes.
