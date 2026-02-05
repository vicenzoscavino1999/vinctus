# Deployment guide

Last update: 2026-02-05

## Prerequisites

- Node.js `>=20`
- Firebase CLI authenticated
- Correct project selected (`vinctus-dev` or production project)

## Pre-deploy quality gate

Run full validation before deploy:

```bash
npm run validate
```

Optional release readiness bundle (Phase 6 Day 15):

```bash
npm run phase6:day15
```

## Frontend deployment

Build:

```bash
npm run build
```

If using Firebase Hosting:

```bash
firebase deploy --only hosting --project vinctus-daf32
```

If using Vercel:

- Deploy from the target branch in Vercel dashboard.

## Firebase backend deployment

### Firestore rules + indexes + storage rules

```bash
firebase deploy --only firestore:rules,firestore:indexes,storage --project vinctus-daf32
```

### Cloud Functions

```bash
npm run functions:install
npm run functions:build
firebase deploy --only functions --project vinctus-daf32
```

## Post-deploy smoke checklist

1. Login with a valid user.
2. Open `/feed` and scroll.
3. Open post comments modal.
4. Open `/messages`, enter a conversation, send message.
5. Open `/group/1` (or an existing group) and verify membership action.

## Rollback

Use `ROLLBACK.md` for revert-by-tag and emergency rollback commands.
