# Deployment Runbook (Production)

Last update: 2026-02-07

## 1) Prerequisites

- Node `>= 20`
- `npm ci` completed
- Firebase CLI authenticated (`firebase login`)
- Vercel CLI authenticated (`vercel login`)

## 2) Mandatory pre-release quality gates

Run from repo root:

```bash
npm run validate
```

Cost gates (Phase 6):

```bash
npm run metrics:phase6:gate
```

Rule:

- If any gate fails, release is not approved.

## 3) Mandatory staging monitoring evidence (24-48h)

Before production approval, attach a completed staging soak record.

Required:

- Follow `STAGING_MONITORING.md`.
- Minimum soak: 24h (48h recommended for high-risk releases).
- Save the completed evidence record in `docs/phase6/reports/` (for example: `staging-soak-YYYY-MM-DD.md`).

Hard rule:

- If staging monitoring evidence is missing or incomplete, production deploy is blocked.

## 4) Cost evidence refresh before critical releases

Recommended commands:

```bash
npm run seed
npm run metrics:phase6:seed
METRICS_OUT=docs/phase6/reports/phase6-metrics-after.json npm run metrics:phase6:collect
npm run metrics:phase6:compare -- docs/phase6/reports/phase6-metrics-before.json docs/phase6/reports/phase6-metrics-after.json docs/phase6/reports/phase6-metrics-compare.md
npm run metrics:phase6:gate
```

## 5) Firebase production deploy

Select project:

```bash
firebase use <firebase-project-id>
```

Build functions:

```bash
npm run functions:install
npm run functions:build
```

Deploy backend contracts:

```bash
firebase deploy --only firestore:rules,firestore:indexes,storage,functions
```

Important:

- This project keeps the frontend + `/api/chat` on Vercel.
- Do not deploy Firebase Hosting for production unless you explicitly add a valid `/api/**` route strategy.

## 6) Vercel production deploy

```bash
vercel link
vercel pull --yes --environment=production
vercel env ls
vercel --prod
```

## 7) Post-deploy verification

- `/discover`, `/feed`, `/post/:id`, `/messages`, `/profile` load correctly.
- No missing-index warnings in browser console for critical flows.
- `firebase functions:log --limit 100` has no blocking errors.
- Budget alert thresholds are configured at 50/75/90/100.

## 8) Budget alert operational policy

Budget thresholds:

- 50%: warning
- 75%: escalation warning
- 90%: critical escalation
- 100%: deploy freeze until review

Deployment owner must confirm alert configuration before approving production release.
