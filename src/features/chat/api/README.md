# Chat API (Phase 6)

This folder is the typed + resilient API surface for the chat domain.

Goal (Phase 6):

- Improve **micro-performance** for real-time listeners
- Handle **edge cases** (permission/offline/unavailable) consistently
- Increase **type safety** (runtime guards where it matters)

## Subscriptions

Source: `src/features/chat/api/subscriptions.ts`

- `subscribeToConversations(uid, onUpdate, onError?)`
  - Subscribes to the user's **direct conversation index** + **group memberships**, then attaches per-conversation listeners.
  - Dedupe: avoids double-listening to the same conversation id.
  - Performance: batches emits (microtask) to reduce React re-render churn on initial loads.
  - Resilience: retries snapshot listeners with exponential backoff for retryable errors.

- `subscribeToMessages(conversationId, onUpdate, onError?)`
  - Subscribes to last 50 messages ordered by `clientCreatedAt` (offline-safe).
  - Includes backoff on retryable errors.

- `subscribeToUserMemberships(uid, onUpdate, limit?, onError?)`
  - Subscribes to the user's memberships for group chat discovery.

## Mutations

Source: `src/features/chat/api/mutations.ts`

Wrappers add:

- Input validation (Zod)
- `withTimeout` (default 5s) + `withRetry` for transient failures
- `toAppError` for consistent error shaping
- Dev metrics (`trackFirestoreRead/Write`) where applicable

Key APIs:

- `sendMessage(...)` (supports deterministic `clientIdOverride` for tests)
- `getOrCreateGroupConversation(groupId, uid)`
- `markConversationRead(conversationId, uid)` (best-effort; safe for fire-and-forget usage)
- `setConversationMute(...)` / `clearConversationMute(...)`
- `leaveGroupWithSync(groupId, uid)`
- `createUserReport(...)` / `createGroupReport(...)`
- `blockUser(...)` / `unblockUser(...)`

## Emulator tests

Integration tests (Firebase Emulator) live at:

- `src/tests/emulators/chat/chat.mutations.cases.ts`

Run:

- `npm run test:emulators`
