import fs from 'node:fs/promises';
import process from 'node:process';

const beforePath = process.argv[2] || 'docs/phase6/reports/phase6-metrics-before.json';
const afterPath = process.argv[3] || 'docs/phase6/reports/phase6-metrics-after.json';

const readJson = async (path) => JSON.parse(await fs.readFile(path, 'utf8'));

const pctDelta = (before, after) => {
  if (!Number.isFinite(before) || before <= 0) return null;
  return ((after - before) / before) * 100;
};

const toStatus = (ok) => (ok ? 'PASS' : 'FAIL');

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

  const feedDelta = pctDelta(beforeFeedReads, afterFeedReads);
  const chatDelta = pctDelta(beforeChatReads, afterChatReads);

  const feedListenersAfterRoundTrip = after.flows?.feed?.listenersActiveAfterRoundTrip ?? 1;
  const chatListenersAfterRoundTrip = after.flows?.chat?.listenersActiveAfterRoundTrip ?? 1;
  const feedReadViewRatio = after.flows?.feed?.readPerVisiblePost ?? Number.POSITIVE_INFINITY;

  const checks = [
    {
      name: 'Feed reads reduction',
      expected: '<= -30%',
      got: feedDelta === null ? 'n/a' : `${feedDelta.toFixed(1)}%`,
      ok: feedDelta !== null && feedDelta <= -30,
    },
    {
      name: 'Chat reads reduction',
      expected: '<= -30%',
      got: chatDelta === null ? 'n/a' : `${chatDelta.toFixed(1)}%`,
      ok: chatDelta !== null && chatDelta <= -30,
    },
    {
      name: 'Feed listeners after round-trip',
      expected: '0',
      got: String(feedListenersAfterRoundTrip),
      ok: feedListenersAfterRoundTrip === 0,
    },
    {
      name: 'Chat listeners after round-trip',
      expected: '0',
      got: String(chatListenersAfterRoundTrip),
      ok: chatListenersAfterRoundTrip === 0,
    },
    {
      name: 'Feed read/view ratio',
      expected: '<= 1.2',
      got: Number.isFinite(feedReadViewRatio) ? String(feedReadViewRatio) : 'n/a',
      ok: Number.isFinite(feedReadViewRatio) && feedReadViewRatio <= 1.2,
    },
  ];

  console.log('# Phase6 Release Gates');
  checks.forEach((check) => {
    console.log(
      `- ${check.name}: ${toStatus(check.ok)} (expected ${check.expected}, got ${check.got})`,
    );
  });

  const failed = checks.filter((check) => !check.ok);
  if (failed.length > 0) {
    console.error(`Gate check failed (${failed.length} failing checks).`);
    process.exit(1);
  }

  console.log('All phase6 gates passed.');
};

main().catch((error) => {
  console.error('Failed to evaluate phase6 gates:', error);
  process.exit(1);
});
