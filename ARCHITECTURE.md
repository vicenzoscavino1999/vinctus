# Architecture snapshot

A short technical snapshot of the current production design. Checked against `main` (`2563d5f`)
on 2026-11-25. The first version of this file was the Phase 6 Day 15 snapshot.

## Runtime topology

- Web frontend: React 19 + Vite SPA (`src/`).
- Native iPhone app: SwiftUI (`ios-native/VinctusNative/`, see its `ARCHITECTURE.md`). It reads
  and writes the same Firebase data as the web.
- Hosting: Vercel (`vercel.json`) with SPA rewrites, `/__/auth/*` and `/__/firebase/*` proxied to
  the Firebase project, and `/api/*` serverless routes.
- Backend platform: Firebase Auth, Firestore, Storage, Cloud Functions (`functions/src/index.ts`,
  Node 22).
- Serverless APIs (`api/`, shared helpers in `api/lib/`):
  - `api/chat.ts`: AI chat (Gemini, OpenAI, NVIDIA) and AI actions that write with Firebase Admin
    (create group).
  - `api/discover.ts`: cached proxy for the public APIs used by Discover.
  - `api/youtube.ts`, `api/youtube-search.ts`, `api/youtube-shorts.ts`: YouTube Data API
    (video metadata, Discover videos, Shorts for stories).

## Environments

| Environment | Web                          | Firebase project          | How it ships                                                                                                  |
| ----------- | ---------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Production  | `vinctus.vercel.app`         | `vinctus-daf32`           | Vercel deploys `main` automatically; Firebase is deployed manually (`--project`)                              |
| Staging     | `vinctus-staging.vercel.app` | `vinctus-staging`         | Separate Vercel project `vinctus-staging`; branches `testflight/vinctus-staging` and `deploy/vinctus-staging` |
| CI / local  | `localhost:5173`             | `vinctus-dev` (emulators) | GitHub Actions                                                                                                |

There is no `.firebaserc`; every `firebase deploy` must pass `--project`. Deployment order:
`docs/plan-despliegue-coordinado.md`. iOS builds: `docs/testflight-sin-mac.md`.

## Application composition

- `src/App.tsx`
  - wraps the app with `AuthProvider`
  - handles password-reset links, then gates login and onboarding
  - lazy loads `AuthenticatedAppShell` for authenticated runtime
- `src/app/routes/AuthenticatedAppShell.tsx`
  - mounts `BrowserRouter`
  - mounts `AppStateProvider` and `ToastProvider`
  - lazy loads `AppLayout`
- `src/app/routes/AppLayout.tsx`
  - route map and global layout (header, sidebar, mobile nav)
  - page-level lazy loading for feature pages
- `src/app/providers/AppState.tsx`
  - optimistic UI actions (groups, likes, saves)
  - Firestore bootstrap state using bounded reads (`APP_STATE_REMOTE_LIMIT = 50`)

## Route domains

Declared in `src/app/routes/AppLayout.tsx`; unknown paths fall back to Discover.

- Discover and search: `/`, `/discover`, `/search`, `/category/:categoryId`
- Feed and posts: `/feed`, `/post/:postId`
- Groups: `/group/:groupId`, `/group/:groupId/edit`
- Chat: `/messages`, `/messages/:conversationId/details`, `/messages/:conversationId/group-details`
- Social graph and profile: `/profile`, `/user/:userId`, `/user/:userId/connections`
- AI: `/arena`, `/arena/:debateId`, `/ai/chat`
- Settings: `/settings`, `/settings/notifications`, `/settings/privacy`
- Legal: `/legal/privacy`, `/legal/terms`, `/legal/community-guidelines`
- Supporting modules: `/projects`, `/library`, `/notifications`, `/help`, `/moderation`

Static legal and support pages (`/privacy`, `/terms`, `/community-guidelines`, `/support`) are
served by Vercel rewrites to `public/*.html`, outside the SPA.

## Data and integrations

- Domain APIs: `src/features/*/api/{queries,mutations,types}.ts`, which validate input and call the
  shared Firestore layer in `src/shared/lib/firestore/`.
- Firebase client: `src/shared/lib/firebase.ts` (Auth, Firestore with persistent cache, Firestore
  Lite, Functions, Storage, optional App Check, emulators behind `VITE_USE_FIREBASE_EMULATOR`).
- Where client operations go:
  - Directly to Firestore and Storage through the SDK, guarded by `firestore.rules` and
    `storage.rules`: most writes (follows, likes, chat, groups, stories, collections, profile).
  - Vercel `/api/*`: AI chat, Discover content, YouTube.
  - Cloud Functions callables: `readPosts`, `createDebate`, `getArenaUsage`, `getArenaPersonas`,
    `revokeUserSessions`, `requestAccountDeletion`, `getAccountDeletionStatus`,
    `deleteUserAccount`, `moderationTakeAction`. HTTP endpoint: `readPostMedia`.
  - Cloud Functions triggers react to writes: counters, follow-request acceptance, moderation,
    cascade cleanup.
- Shared contract: `shared/firestore-contract.json` (collection names, limits, Storage paths).
  `npm run contract:generate` writes `src/shared/lib/firestore/firestoreContract.ts`,
  `functions/src/firestoreContract.ts`, `api/lib/firestoreContract.ts` and the iOS
  `FirestoreContract.swift`; CI runs `npm run contract:check`.
- Shared reliability layer:
  - `src/shared/lib/errors.ts`
  - `src/shared/lib/validators.ts`
  - `src/shared/lib/firebase-helpers.ts`
- Firestore index contract: `docs/firestore-indexes.md`

## Quality gates in use

- Validation gate: `npm run validate`
  - `typecheck` + `lint` + `test:coverage` + `test:api` + `build`
- CI (`.github/workflows/ci.yml`, every PR and push to `main`): guardrails and contract check,
  typecheck, unit and API tests, rules tests, Cloud Functions integration tests
  (`test:post-counts`, `test:post-reads`), build, cost gates, E2E (smoke and full) and Lighthouse.
- Coverage gate (Phase 6 scoped): statements/functions/lines `>= 85`, branches `>= 80`
  - scope documented in `docs/phase6/reports/coverage-scope.md`
- Lighthouse gate: Home/Feed/Chat/Groups `>= 0.90`
  - baseline and commands in `docs/phase6/reports/lhci-day14.md`
- E2E: one Playwright spec per module plus smoke and critical flows (`e2e/*.spec.ts`)
- iOS: `.github/workflows/ios-native.yml` builds the app, runs unit and emulator integration tests,
  and uploads to TestFlight on manual runs.
