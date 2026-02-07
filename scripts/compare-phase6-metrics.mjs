import fs from 'node:fs/promises';
import process from 'node:process';

const beforePath = process.argv[2] || 'docs/phase6/reports/phase6-metrics-before.json';
const afterPath = process.argv[3] || 'docs/phase6/reports/phase6-metrics-after.json';
const outPath = process.argv[4] || 'docs/phase6/reports/phase6-metrics-compare.md';

const readJson = async (path) => JSON.parse(await fs.readFile(path, 'utf8'));

const pct = (before, after) => {
  if (!Number.isFinite(before) || before === 0) return null;
  return ((after - before) / before) * 100;
};

const fmtPct = (value) => (value === null ? 'n/a' : `${value.toFixed(1)}%`);

const fmtDelta = (before, after) => {
  if (!Number.isFinite(before) || !Number.isFinite(after)) return 'n/a';
  const sign = after - before > 0 ? '+' : '';
  return `${sign}${(after - before).toFixed(0)}`;
};

const reductionGate = (value) => {
  if (value === null) return 'FAIL';
  return value <= -30 ? 'PASS' : 'FAIL';
};

const buildRow = (metric, before, after, threshold, status) =>
  `| ${metric} | ${before} | ${after} | ${fmtDelta(before, after)} | ${threshold} | ${status} |`;

const resolveFeedReads = (flow) => {
  if (typeof flow?.firestore?.gateReads === 'number') return flow.firestore.gateReads;
  if (typeof flow?.firestore?.estimatedReads === 'number') return flow.firestore.estimatedReads;
  if (typeof flow?.visiblePosts === 'number') return flow.visiblePosts;
  if (typeof flow?.firestore?.reads === 'number') return flow.firestore.reads;
  return 0;
};

const main = async () => {
  const before = await readJson(beforePath);
  const after = await readJson(afterPath);

  const beforeFeedReads = resolveFeedReads(before.flows?.feed);
  const afterFeedReads = resolveFeedReads(after.flows?.feed);
  const beforeChatReads = before.flows?.chat?.firestore?.reads ?? 0;
  const afterChatReads = after.flows?.chat?.firestore?.reads ?? 0;

  const feedDeltaPct = pct(beforeFeedReads, afterFeedReads);
  const chatDeltaPct = pct(beforeChatReads, afterChatReads);

  const beforeFeedListeners = before.flows?.feed?.listenersActiveAfterRoundTrip ?? 0;
  const afterFeedListeners = after.flows?.feed?.listenersActiveAfterRoundTrip ?? 0;
  const beforeChatListeners = before.flows?.chat?.listenersActiveAfterRoundTrip ?? 0;
  const afterChatListeners = after.flows?.chat?.listenersActiveAfterRoundTrip ?? 0;

  const afterFeedRatio = after.flows?.feed?.readPerVisiblePost ?? null;
  const feedRatioStatus = afterFeedRatio !== null && afterFeedRatio <= 1.2 ? 'PASS' : 'FAIL';

  const lines = [
    '# Phase 6 Metrics Comparison',
    '',
    `- Before file: \`${beforePath}\``,
    `- After file: \`${afterPath}\``,
    `- Captured before: ${before.capturedAt || 'unknown'}`,
    `- Captured after: ${after.capturedAt || 'unknown'}`,
    '',
    '| Metric | Before | After | Delta | Threshold | Status |',
    '| --- | ---: | ---: | ---: | --- | --- |',
    buildRow(
      'Feed reads/open (3 pages)',
      beforeFeedReads,
      afterFeedReads,
      '<= -30% (target band -30% to -50%)',
      reductionGate(feedDeltaPct),
    ),
    buildRow(
      'Chat reads/open',
      beforeChatReads,
      afterChatReads,
      '<= -30% (target band -30% to -50%)',
      reductionGate(chatDeltaPct),
    ),
    buildRow(
      'Feed listeners after round-trip leave',
      beforeFeedListeners,
      afterFeedListeners,
      '0',
      afterFeedListeners === 0 ? 'PASS' : 'FAIL',
    ),
    buildRow(
      'Chat listeners after round-trip leave',
      beforeChatListeners,
      afterChatListeners,
      '0',
      afterChatListeners === 0 ? 'PASS' : 'FAIL',
    ),
    `| Feed read/view ratio | n/a | ${afterFeedRatio ?? 'n/a'} | n/a | <= 1.2 | ${feedRatioStatus} |`,
    '',
    '## Percentage deltas',
    '',
    `- Feed reads delta: ${fmtPct(feedDeltaPct)}`,
    `- Chat reads delta: ${fmtPct(chatDeltaPct)}`,
    '',
    '## Flow notes (after)',
    '',
    `- Discover latency: ${after.flows?.discover?.latencyMs ?? 'n/a'} ms`,
    `- Feed latency: ${after.flows?.feed?.latencyMs ?? 'n/a'} ms`,
    `- Post latency: ${after.flows?.post?.latencyMs ?? 'n/a'} ms`,
    `- Chat latency: ${after.flows?.chat?.latencyMs ?? 'n/a'} ms`,
    `- Profile latency: ${after.flows?.profile?.latencyMs ?? 'n/a'} ms`,
    `- Feed storage egress: ${after.flows?.feed?.network?.storageEgressBytes ?? 'n/a'} bytes`,
    `- Chat storage egress: ${after.flows?.chat?.network?.storageEgressBytes ?? 'n/a'} bytes`,
    `- Functions invocations (feed/chat): ${after.flows?.feed?.network?.functionsInvocations ?? 'n/a'} / ${
      after.flows?.chat?.network?.functionsInvocations ?? 'n/a'
    }`,
  ];

  await fs.writeFile(outPath, `${lines.join('\n')}\n`, 'utf8');
  console.log(`Phase6 comparison report saved to ${outPath}`);
};

main().catch((error) => {
  console.error('Failed to compare phase6 metrics:', error);
  process.exit(1);
});
