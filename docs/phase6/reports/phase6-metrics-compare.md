# Phase 6 Metrics Comparison

- Before file: `docs/phase6/reports/phase6-metrics-before.json`
- After file: `docs/phase6/reports/phase6-metrics-after.json`
- Captured before: 2026-02-07T02:03:19.056Z
- Captured after: 2026-02-07T03:19:44.537Z

| Metric                                | Before | After | Delta | Threshold                          | Status |
| ------------------------------------- | -----: | ----: | ----: | ---------------------------------- | ------ |
| Feed reads/open (3 pages)             |     60 |    36 |   -24 | <= -30% (target band -30% to -50%) | PASS   |
| Chat reads/open                       |    803 |     5 |  -798 | <= -30% (target band -30% to -50%) | PASS   |
| Feed listeners after round-trip leave |      0 |     0 |     0 | 0                                  | PASS   |
| Chat listeners after round-trip leave |      0 |     0 |     0 | 0                                  | PASS   |
| Feed read/view ratio                  |    n/a |     1 |   n/a | <= 1.2                             | PASS   |

## Percentage deltas

- Feed reads delta: -40.0%
- Chat reads delta: -99.4%

## Flow notes (after)

- Discover latency: 2139 ms
- Feed latency: 7649 ms
- Post latency: 5660 ms
- Chat latency: 2616 ms
- Profile latency: 2097 ms
- Feed storage egress: 0 bytes
- Chat storage egress: 0 bytes
- Functions invocations (feed/chat): 0 / 0
