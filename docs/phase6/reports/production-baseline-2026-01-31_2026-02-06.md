# Production Baseline Report

- Periodo oficial: 2026-01-31 to 2026-02-06 (7 days)
- Proyecto: vinctus (`vinctus-daf32`)
- Generado: 2026-02-07

## 1) Real Cost (Source of Truth)

Source: Google Cloud Billing Reports

- Total cost (period): PEN 0.00 (S/. 0.00)
- Billing account: Pago de Firebase
- Project filter: `vinctus`
- Grouped by: Service
- Active billed service in period: Cloud Run Functions

## 2) Firestore Usage

Source: Firebase Console > Firestore > Usage

- UI period available: Last 7 days (2026-01-30 to 2026-02-06)
- `document/read_ops_count`: 5900 operations
- `document/write_ops_count`: 437 operations
- `document/delete_ops_count`: 0 (or minimum, not visible in chart)
- Snapshot listener objects (max): 46

## 3) Storage Usage

Source: Firebase Console > Storage > Usage

- UI period available: Last 7 days (2026-01-30 to 2026-02-06)
- Egress/download bytes: 1.92 MB total
- Stored bytes (current): 20.24 MB
- Object count (current): 75
- Requests: 63 total

## 4) Cloud Functions Invocations

Source: Cloud Monitoring > Metrics Explorer

- Metric: `cloudfunctions.googleapis.com/function/execution_count`
- Approx period available: Last 7 days (~2026-01-30 to 2026-02-06)
- Aggregation: `REDUCE_SUM` + `ALIGN_SUM`
- Total invocations: 1

Detected first-gen functions (sample):

- onCollectionDeleted
- onCollectionItemDeleted
- onDirectConversationWrite
- onEventAttendeeCreated
- onEventAttendeeDeleted
- onEventDeleted
- onFollowRequestUpdated
- onFriendRequestWrite
- onGroupDeleted
- onGroupMemberCreated
- onGroupMemberDeleted

Latest deployment observed: 2026-02-06 18:04

## 5) Budgets and Alerts

Source: Billing > Budgets and alerts

Budget: Firebase Project `vinctus-daf32`

- Period: monthly
- Scope: all projects (1), all services
- Threshold 50%: S/. 7.5 (actual spend) -> enabled
- Threshold 75%: S/. 11.25 (actual spend) -> enabled
- Threshold 90%: S/. 13.5 (actual spend) -> enabled
- Threshold 100%: S/. 15.0 (actual spend) -> enabled
- Notifications: email to billing admins/users enabled

## Evidence files

- `docs/phase6/reports/production-baseline-2026-01-31_2026-02-06.md`
- `docs/phase6/reports/production-baseline-billing-report.csv`
- `docs/phase6/reports/production-baseline-billing-report.png`
- `docs/phase6/reports/production-baseline-firestore-usage.png`
- `docs/phase6/reports/production-baseline-storage-usage.png`
- `docs/phase6/reports/production-baseline-functions-usage.png`
- `docs/phase6/reports/production-baseline-budgets.png`

## Notes

- Official baseline range for release decision is 2026-01-31 to 2026-02-06 (Billing).
- Firebase Usage dashboards (Firestore/Storage) only expose "Last 7 days" in this capture, which includes 2026-01-30.
- This one-day offset is documented and accepted for this initial production baseline.
