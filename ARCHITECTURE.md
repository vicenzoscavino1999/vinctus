# Architecture snapshot (Phase 6 Day 15)

This document is a short technical snapshot of the current production design.

## Runtime topology

- Frontend: React 19 + Vite SPA.
- Hosting: Vercel (`vercel.json`) with SPA rewrites and `/api/*` serverless routes.
- Backend platform: Firebase Auth, Firestore, Storage, Cloud Functions.
- Serverless API: `api/chat.ts` (Gemini + Firebase Admin actions).

## Application composition

- `src/App.tsx`
  - wraps the app with `AuthProvider`
  - gates login/onboarding
  - lazy loads `AuthenticatedAppShell` for authenticated runtime
- `src/app/routes/AuthenticatedAppShell.tsx`
  - mounts `BrowserRouter`
  - mounts `AppStateProvider` and `ToastProvider`
  - lazy loads `AppLayout`
- `src/app/routes/AppLayout.tsx`
  - route map and global layout (header, nav, mobile nav)
  - page-level lazy loading for feature pages
- `src/app/providers/AppState.tsx`
  - optimistic UI actions (groups, likes, saves)
  - Firestore bootstrap state using bounded reads (`limit(50)`)

## Route domains

- Discover and search: `/`, `/discover`, `/search`, `/category/:categoryId`
- Feed and posts: `/feed`, `/post/:postId`
- Groups: `/group/:groupId`, `/group/:groupId/edit`
- Chat: `/messages`, `/messages/:conversationId/details`, `/messages/:conversationId/group-details`
- Social graph and profile: `/profile`, `/user/:userId`, `/user/:userId/connections`
- Supporting modules: `/projects`, `/library`, `/notifications`, `/settings`, `/help`

## Data and integrations

- Domain APIs: `src/features/*/api/{queries,mutations,types}.ts`
- Shared reliability layer:
  - `src/shared/lib/errors.ts`
  - `src/shared/lib/validators.ts`
  - `src/shared/lib/firebase-helpers.ts`
- Firestore index contract: `docs/firestore-indexes.md`
- Cloud Functions trigger surface: `functions/src/index.ts`

## Quality gates in use

- Validation gate: `npm run validate`
  - `typecheck` + `lint` + `test:coverage` + `build`
- Coverage gate (Phase 6 scoped): statements/functions/lines `>= 85`, branches `>= 80`
  - scope documented in `docs/phase6/reports/coverage-scope.md`
- Lighthouse gate: Home/Feed/Chat/Groups `>= 0.90`
  - baseline and commands in `docs/phase6/reports/lhci-day14.md`
- E2E critical flows: login, feed, post detail, chat, group/chat handoff (`e2e/*.spec.ts`)
