# Performance report (Phase 6)

Last update: 2026-02-05

## Current benchmark snapshot

### Firestore flow reads (Phase 4 baseline vs current)

Source files:

- `phase4-metrics-before.json`
- `phase4-metrics-after.json`

| Flow        | Before reads/open | Current reads/open |  Delta |
| ----------- | ----------------: | -----------------: | -----: |
| Feed open   |                20 |                  8 | -60.0% |
| Chat open   |                16 |                 11 | -31.3% |
| Create post |                20 |                  8 | -60.0% |

Listener cleanup status:

- Feed listeners after leave: `0`
- Chat listeners after leave: `0`

### Lighthouse CI (Home/Feed/Chat/Groups)

Latest reports in `docs/phase6/reports/lhci`:

| Route                       | Latest score |
| --------------------------- | -----------: |
| Home (`/`)                  |           64 |
| Feed (`/feed`)              |           64 |
| Chat (`/messages`)          |           64 |
| Group (`/group/lhci-group`) |           64 |

Current status vs target (`>= 90`): **pending optimization**.

## How to capture again

### Day 14 quality run

```bash
npm run phase6:day14
```

### Per-flow reads (emulator, repeatable)

```bash
npx firebase emulators:exec --project vinctus-dev --only auth,firestore,storage "npm run seed && node scripts/collect-phase4-metrics.mjs"
```

## Optimization focus (next iteration)

1. Reduce first-render JS and non-critical assets on `/`, `/feed`, `/messages`, `/group/:id`.
2. Remove avoidable layout shifts and long main-thread tasks.
3. Keep feed/chat query shape bounded (`limit`, cursor pagination, no N+1).
4. Preserve listener lifecycle guarantee (`listenersActiveAfterLeave === 0`).
