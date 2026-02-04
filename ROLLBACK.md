# Rollback Guide (Vinctus)

This repo deploys changes to:

- Frontend (Vite app) via Vercel or Firebase Hosting (depending on your setup).
- Firebase: Cloud Functions, Firestore rules/indexes, Storage rules.

Goal: make rollback fast, boring, and repeatable.

## Quick Decision Tree

1. Is the issue only in code (UI/logic) and you just merged a PR?
   - Revert the PR on GitHub (fastest).

2. Is the issue in Firebase config (rules/indexes/functions) or you need a known-good version?
   - Redeploy from the last known-good git tag (recommended).

## Known Project IDs

- Local/dev emulators and rules tests: `vinctus-dev`
- Production (per existing deploy docs): `vinctus-daf32`

If you have a staging project, replace project IDs below accordingly.

## Rollback A Merged PR (Code Only)

Best option: use GitHub UI

- Open the merged PR -> click "Revert" -> merge the revert PR.

CLI option (merge commit):

```bash
git checkout main
git pull --ff-only

# Find the merge commit SHA, then:
git revert -m 1 <MERGE_COMMIT_SHA>
git push origin main
```

Then redeploy your frontend (Vercel/Firebase Hosting) from `main` as usual.

## Rollback By Tag (Recommended For Prod)

1. Pick a known-good tag.

```bash
git fetch --tags origin
git tag --list | sort

# Example: previous stable tag
git checkout v4-firebase-optimized
```

2. Deploy the surface you need from that tag.

### Frontend

If using Vercel:

- Vercel Dashboard -> Project -> Deployments -> "Promote" the last known-good deployment.

If using Firebase Hosting:

```bash
npm ci
npm run build
firebase deploy --only hosting --project vinctus-daf32
```

### Cloud Functions

```bash
firebase use vinctus-daf32
firebase deploy --only functions
```

### Firestore Rules + Indexes + Storage Rules

```bash
firebase deploy --only firestore:rules,firestore:indexes,storage --project vinctus-daf32
```

3. Verify

- Firebase Console: Functions errors, Firestore rule denials, index errors.
- App smoke: login, open feed, open chat, create a post, join/leave a group.

## Last Resort: Stop A Broken Function (Prod)

If a function is causing failures/cost spikes and you need an immediate stop:

- Prefer redeploying from a known-good tag (above).
- If you must delete a function, do it explicitly and intentionally:

```bash
firebase functions:delete <FUNCTION_NAME> --region us-central1 --project vinctus-daf32
```

Then redeploy the known-good version when ready.
