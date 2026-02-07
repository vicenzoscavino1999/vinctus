# Phase 6 Cost Metrics (Anti-Quiebra)

Last update: 2026-02-07

## Scope measured

Required flows:

- Discover critical (`/discover`)
- Feed open (3 pages) (`/feed`)
- Post open (`/post/post_1`)
- Chat open (`/messages?conversation=dm_user_a_user_b`)
- Profile critical (`/profile`)

Measured per flow:

- Firestore `reads/writes/deletes`
- Active listeners (`peak`, `after leave`, `after round-trip leave`)
- Perceived latency (`ms` until useful screen)
- Storage egress bytes
- Functions invocation count

## Reproducible method

1. Start emulators (`auth`, `firestore`, `storage`, `functions`) with `firebase emulators:start`.
2. Seed base data:
   - `npm run seed`
3. Seed phase6 stress dataset:
   - `npm run metrics:phase6:seed`
4. Capture baseline:
   - `METRICS_OUT=docs/phase6/reports/phase6-metrics-before.json npm run metrics:phase6:collect`
5. Apply optimizations.
6. Capture after:
   - `METRICS_OUT=docs/phase6/reports/phase6-metrics-after.json npm run metrics:phase6:collect`
7. Compare:
   - `npm run metrics:phase6:compare -- docs/phase6/reports/phase6-metrics-before.json docs/phase6/reports/phase6-metrics-after.json docs/phase6/reports/phase6-metrics-compare.md`

Notes:

- Feed reads now come from direct instrumentation on the actual feed queries (`firestore.getDocs` / `firestore.getDoc`) without estimation fallback in new captures.
- Dataset used in both runs:
  - `extraPosts=120`
  - `extraDirectConversations=80`

## Latest before/after summary

Evidence files:

- `docs/phase6/reports/phase6-metrics-before.json`
- `docs/phase6/reports/phase6-metrics-after.json`
- `docs/phase6/reports/phase6-metrics-compare.md`

| Flow           | Before reads | After reads | Before latency | After latency | Listeners after leave (before/after) | Storage egress (after) | Functions calls (after) |
| -------------- | -----------: | ----------: | -------------: | ------------: | -----------------------------------: | ---------------------: | ----------------------: |
| Discover       |           10 |           1 |        2154 ms |       1689 ms |                                0 / 0 |                    0 B |                       0 |
| Feed (3 pages) |           60 |          36 |        4145 ms |       7628 ms |                                0 / 0 |                    0 B |                       0 |
| Post open      |            9 |           7 |        2106 ms |       5657 ms |                                0 / 0 |                    0 B |                       0 |
| Chat open      |          803 |           5 |        2674 ms |       2604 ms |                                0 / 0 |                    0 B |                       0 |
| Profile        |           36 |           2 |        2100 ms |       2086 ms |                                0 / 0 |                    0 B |                       0 |

## Quality gates status

| Gate                     | Target                      | Result                       | Status |
| ------------------------ | --------------------------- | ---------------------------- | ------ |
| Feed reads               | -30% to -50% (minimum -30%) | -40.0%                       | PASS   |
| Chat reads               | -30% to -50% (minimum -30%) | -99.4%                       | PASS   |
| Duplicate listeners      | 0                           | 0 (feed/chat round-trip)     | PASS   |
| Firestore index warnings | 0                           | 0 observed in measured flows | PASS   |
| Feed read/view ratio     | <= 1.2                      | 1.0                          | PASS   |
| Validation gate          | `npm run validate` green    | green on 2026-02-07          | PASS   |

## Production baseline (manual production capture)

Status: `PASS` (manual evidence documented).

Official baseline range (release reference): `2026-01-31` to `2026-02-06` (7 days), based on Billing Reports.

Production evidence:

- `docs/phase6/reports/production-baseline-2026-01-31_2026-02-06.md`
- `docs/phase6/reports/production-baseline-billing-report.csv`

Captured values:

- Billing total (source of truth): `PEN 0.00`
- Firestore usage (UI last 7 days): `reads=5900`, `writes=437`, `deletes~0`, `listeners max=46`
- Storage usage (UI last 7 days): `egress=1.92 MB`, `stored=20.24 MB`, `objects=75`, `requests=63`
- Cloud Functions invocations (`execution_count`): `1`
- Budgets/alerts: `50%/75%/90%/100%` configured and enabled

Operational note:

- Firebase Usage UI in this capture exposes only "Last 7 days" and includes `2026-01-30`.
- This one-day offset is documented and accepted; billing range remains the official baseline for release decisions.
