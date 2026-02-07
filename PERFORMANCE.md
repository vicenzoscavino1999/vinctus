# Performance and Cost Control (Phase 6)

Last update: 2026-02-07

## Current status

Phase 6 technical gates are green in local reproducible runs:

- `npm run validate`: PASS
- `npm run metrics:phase6:gate`: PASS
- Feed reads/open (3 pages): -40.0% (PASS)
- Chat reads/open: -99.4% (PASS)
- Feed read/view ratio: 1.0 (PASS)
- Duplicated listeners after round-trip leave: 0 (PASS)

Primary evidence:

- `docs/phase6/reports/phase6-metrics-before.json`
- `docs/phase6/reports/phase6-metrics-after.json`
- `docs/phase6/reports/phase6-metrics-compare.md`
- `METRICS.md`

## Gate policy for releases

A release is blocked if any of the following fail:

- `npm run validate`
- `npm run metrics:phase6:gate`
- New missing-index warnings in critical flows (`/discover`, `/feed`, `/post/:id`, `/messages`, `/profile`)

Recommended release sequence:

1. `npm run validate`
2. `npm run metrics:phase6:compare -- docs/phase6/reports/phase6-metrics-before.json docs/phase6/reports/phase6-metrics-after.json docs/phase6/reports/phase6-metrics-compare.md`
3. `npm run metrics:phase6:gate`
4. Approve release only if all checks are PASS.

## Budgets and alerts (required in production)

Create Firebase/GCP billing budget alerts with these thresholds:

- 50%: warning
- 75%: warning (team channel + email)
- 90%: critical (incident channel + on-call)
- 100%: hard stop review (freeze non-critical deploys)

Minimum setup requirements:

- Billing budget per month for Firebase project.
- Email recipients: product owner + technical owner.
- Pub/Sub notification (or equivalent) routed to incident channel.

## Weekly cost dashboard routine

Weekly review checklist:

1. Firestore reads/writes/deletes trend (7d vs prior 7d).
2. Storage egress trend and top objects.
3. Functions invocations and error rates.
4. Feed read/view ratio and chat reads/open on latest synthetic run.
5. Open index warnings and failed query logs.

Store weekly snapshots in:

- `docs/phase6/reports/weekly-*`

## Known trade-offs

- Chat now limits direct conversation index and memberships to 50 for active realtime scope. Older conversations remain accessible through search/open flows but are not all subscribed at once.
- Post detail/comments now use embedded counters for primary rendering to avoid expensive count queries in hot paths. Very short eventual-consistency drift is acceptable.
- Firestore persistent local cache (IndexedDB) is enabled with safe fallback to memory when unavailable.
