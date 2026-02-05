# Phase 6 (quality + performance)

## Baseline

Generate baseline artifacts (API inventory + test coverage + type coverage):

```bash
npm run phase6:baseline
```

Generate bundle visualizer report:

```bash
npm run build:report
```

Generate LHCI reports for Home/Feed/Chat/Groups:

```bash
npm run lhci:phase6
```

Run P0 emulator coverage gate (85% global, 80% branches) for `posts/chat/groups/notifications/profile` APIs:

```bash
npm run test:coverage:gate:p0
```

Run Day 14 quality sprint bundle (type coverage + tests coverage + LHCI):

```bash
npm run phase6:day14
```

Run Day 15 release readiness bundle (validate + critical E2E):

```bash
npm run phase6:day15
```
