# Staging Monitoring Evidence (24-48h)

Last update: 2026-02-07

Use this checklist before every production release candidate.

## 1) Staging environment requirements

- Dedicated Firebase project (not `vinctus-dev` and not production).
- Dedicated Vercel staging deployment/environment.
- Same rules/indexes/functions version as candidate release.
- Same feature flags and env vars as production, except external credentials explicitly scoped for staging.

## 2) Minimum soak period

- Run staging in candidate version for at least 24h.
- Recommended for high-risk releases: 48h.

## 3) What must be monitored

- Firebase Functions:
  - Error count, cold starts, latency p95.
- Firestore:
  - Read/write volume trend and permission denied spikes.
- Storage:
  - Upload/download errors and unexpected volume spikes.
- App/API:
  - `/api/chat` error ratio and timeout rate.
- UX smoke:
  - login, feed, create post, messages, groups join/leave.

## 4) Evidence to attach

- Screenshots (or exported charts) for:
  - Functions usage/errors
  - Firestore usage
  - Storage usage
  - Budget/alert thresholds
- Command outputs:
  - `npm run validate`
  - `npm run guardrails`
  - `npm run test:rules`
  - `npm run test:e2e:local-ci:smoke`
- Any incident during soak and mitigation notes.

## 5) Evidence record template

- Candidate build/commit:
- Staging project ID:
- Soak window start (UTC):
- Soak window end (UTC):
- Duration:
- Smoke checks completed:
- Functions errors during soak:
- Firestore anomalies:
- Storage anomalies:
- Budget alerts triggered (Y/N):
- Go/No-go decision:
- Approver:

## 6) Release rule

- If soak evidence is missing or incomplete: no production deploy.
- If critical errors are observed and unresolved: no production deploy.
