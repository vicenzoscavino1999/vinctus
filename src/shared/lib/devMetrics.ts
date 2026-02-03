type MetricKind = 'read' | 'write' | 'listener_start' | 'listener_stop' | 'call' | 'flow';

type MetricsCounter = {
  reads: number;
  writes: number;
  calls: number;
  listenerStarts: number;
  listenerStops: number;
  listenersActive: number;
  listenersPeak: number;
  bySource: Record<string, number>;
};

type MetricEvent = {
  kind: MetricKind;
  source: string;
  flow: string;
  at: string;
};

type ListenerTrack = {
  flow: string;
  source: string;
};

type MetricsState = {
  enabled: boolean;
  currentFlow: string;
  totals: MetricsCounter;
  flows: Record<string, MetricsCounter>;
  events: MetricEvent[];
  nextListenerId: number;
  activeListeners: Record<number, ListenerTrack>;
};

type MetricsSnapshot = {
  enabled: boolean;
  currentFlow: string;
  totals: MetricsCounter;
  flows: Record<string, MetricsCounter>;
  events: MetricEvent[];
  generatedAt: string;
};

type MetricsApi = {
  snapshot: () => MetricsSnapshot;
  reset: () => void;
  setFlow: (flow: string) => void;
  logSummary: () => void;
  download: (fileName?: string) => void;
};

type GlobalState = Record<string, unknown>;

const METRICS_STATE_KEY = '__VINCTUS_DEV_METRICS_STATE__';
const METRICS_API_KEY = 'vinctusMetrics';
const MAX_EVENTS = 2000;

const createCounter = (): MetricsCounter => ({
  reads: 0,
  writes: 0,
  calls: 0,
  listenerStarts: 0,
  listenerStops: 0,
  listenersActive: 0,
  listenersPeak: 0,
  bySource: {},
});

const cloneCounter = (counter: MetricsCounter): MetricsCounter => ({
  ...counter,
  bySource: { ...counter.bySource },
});

const isEnabled = (): boolean =>
  import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEV_METRICS === 'true';

const getFlowCounter = (state: MetricsState, flow: string): MetricsCounter => {
  if (!state.flows[flow]) {
    state.flows[flow] = createCounter();
  }
  return state.flows[flow];
};

const ensureState = (): MetricsState => {
  const globalState = globalThis as GlobalState;
  const existing = globalState[METRICS_STATE_KEY] as MetricsState | undefined;
  if (existing) return existing;

  const state: MetricsState = {
    enabled: isEnabled(),
    currentFlow: 'unknown',
    totals: createCounter(),
    flows: {},
    events: [],
    nextListenerId: 1,
    activeListeners: {},
  };

  globalState[METRICS_STATE_KEY] = state;
  return state;
};

const pushEvent = (state: MetricsState, event: Omit<MetricEvent, 'at'>): void => {
  if (!state.enabled) return;
  state.events.push({ ...event, at: new Date().toISOString() });
  if (state.events.length > MAX_EVENTS) {
    state.events.shift();
  }
};

const bumpSource = (counter: MetricsCounter, source: string): void => {
  counter.bySource[source] = (counter.bySource[source] || 0) + 1;
};

const record = (kind: MetricKind, source: string, flowOverride?: string): void => {
  const state = ensureState();
  if (!state.enabled) return;

  const flow = flowOverride || state.currentFlow || 'unknown';
  const flowCounter = getFlowCounter(state, flow);

  switch (kind) {
    case 'read':
      state.totals.reads += 1;
      flowCounter.reads += 1;
      break;
    case 'write':
      state.totals.writes += 1;
      flowCounter.writes += 1;
      break;
    case 'call':
      state.totals.calls += 1;
      flowCounter.calls += 1;
      break;
    case 'listener_start':
      state.totals.listenerStarts += 1;
      state.totals.listenersActive += 1;
      flowCounter.listenerStarts += 1;
      flowCounter.listenersActive += 1;
      state.totals.listenersPeak = Math.max(
        state.totals.listenersPeak,
        state.totals.listenersActive,
      );
      flowCounter.listenersPeak = Math.max(flowCounter.listenersPeak, flowCounter.listenersActive);
      break;
    case 'listener_stop':
      state.totals.listenerStops += 1;
      state.totals.listenersActive = Math.max(0, state.totals.listenersActive - 1);
      flowCounter.listenerStops += 1;
      flowCounter.listenersActive = Math.max(0, flowCounter.listenersActive - 1);
      break;
    case 'flow':
      break;
  }

  bumpSource(state.totals, source);
  bumpSource(flowCounter, source);
  pushEvent(state, { kind, source, flow });
};

export const setMetricsFlow = (flow: string): void => {
  const state = ensureState();
  if (!state.enabled) return;
  state.currentFlow = flow || 'unknown';
  pushEvent(state, { kind: 'flow', source: flow || 'unknown', flow: flow || 'unknown' });
};

export const trackFirestoreRead = (source: string): void => {
  record('read', source);
};

export const trackFirestoreWrite = (source: string): void => {
  record('write', source);
};

export const trackAppCall = (source: string): void => {
  record('call', source);
};

export const trackFirestoreListener = (source: string, unsubscribe: () => void): (() => void) => {
  const state = ensureState();
  if (!state.enabled) return unsubscribe;

  const flow = state.currentFlow || 'unknown';
  const listenerId = state.nextListenerId++;
  state.activeListeners[listenerId] = { flow, source };
  record('listener_start', source, flow);

  return () => {
    const tracked = state.activeListeners[listenerId];
    if (tracked) {
      record('listener_stop', tracked.source, tracked.flow);
      delete state.activeListeners[listenerId];
    }
    unsubscribe();
  };
};

export const getMetricsSnapshot = (): MetricsSnapshot => {
  const state = ensureState();
  const flows: Record<string, MetricsCounter> = {};

  Object.entries(state.flows).forEach(([flow, counter]) => {
    flows[flow] = cloneCounter(counter);
  });

  return {
    enabled: state.enabled,
    currentFlow: state.currentFlow,
    totals: cloneCounter(state.totals),
    flows,
    events: state.events.map((event) => ({ ...event })),
    generatedAt: new Date().toISOString(),
  };
};

export const resetMetrics = (): void => {
  const state = ensureState();
  state.currentFlow = 'unknown';
  state.totals = createCounter();
  state.flows = {};
  state.events = [];
  state.nextListenerId = 1;
  state.activeListeners = {};
};

export const logMetricsSummary = (): void => {
  const snapshot = getMetricsSnapshot();
  console.groupCollapsed('[Vinctus Metrics] Summary');
  console.table({
    reads: snapshot.totals.reads,
    writes: snapshot.totals.writes,
    calls: snapshot.totals.calls,
    listenersActive: snapshot.totals.listenersActive,
    listenersPeak: snapshot.totals.listenersPeak,
  });
  console.log('Flows:', snapshot.flows);
  console.groupEnd();
};

export const downloadMetricsJson = (fileName = 'vinctus-metrics.json'): void => {
  if (typeof document === 'undefined') return;

  const snapshot = getMetricsSnapshot();
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
};

const installApi = (): void => {
  const state = ensureState();
  if (!state.enabled) return;

  const globalState = globalThis as GlobalState;
  if (globalState[METRICS_API_KEY]) return;

  const api: MetricsApi = {
    snapshot: getMetricsSnapshot,
    reset: resetMetrics,
    setFlow: setMetricsFlow,
    logSummary: logMetricsSummary,
    download: downloadMetricsJson,
  };

  globalState[METRICS_API_KEY] = api;
};

installApi();
