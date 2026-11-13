export type ReactionKind = 'like' | 'save';
export type ReactionState = {
  value: boolean | null;
  count: number;
  loaded: boolean;
  loading: boolean;
  pending?: boolean;
  error: string | null;
};
export type ReactionIO = {
  read: (kind: ReactionKind, postId: string, uid: string) => Promise<boolean>;
  write: (kind: ReactionKind, desired: boolean, postId: string, uid: string) => Promise<void>;
};

const empty = (): ReactionState => ({
  value: null,
  count: 0,
  loaded: false,
  loading: false,
  error: null,
});

/** One post/account session. All mutations are desired values, never remote toggles. */
export class PostEngagementSession {
  private state = { like: empty(), save: empty() };
  private listeners = new Set<() => void>();
  private active = false;
  private epoch = 0;

  constructor(
    private readonly postId: string | undefined,
    private readonly uid: string | undefined,
    private readonly io: ReactionIO,
  ) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.state;

  open() {
    this.active = true;
    this.epoch++;
    this.state = { like: empty(), save: empty() };
    this.listeners.forEach((listener) => listener());
  }
  close() {
    this.active = false;
    this.epoch++;
  }
  private update(kind: ReactionKind, state: ReactionState) {
    this.state = { ...this.state, [kind]: state };
    this.listeners.forEach((listener) => listener());
  }

  async load(kind: ReactionKind, count: number, force = false) {
    const previous = this.state[kind];
    if (
      !this.active ||
      !this.postId ||
      previous.loading ||
      previous.pending !== undefined ||
      (previous.loaded && !force)
    )
      return;
    const epoch = this.epoch;
    this.update(kind, { ...previous, count: Math.max(0, count), loading: true, error: null });
    try {
      const value = this.uid ? await this.io.read(kind, this.postId, this.uid) : false;
      if (!this.active || epoch !== this.epoch) return;
      this.update(kind, {
        value,
        count: Math.max(0, count),
        loaded: true,
        loading: false,
        error: null,
      });
    } catch {
      if (!this.active || epoch !== this.epoch) return;
      this.update(kind, {
        ...previous,
        count: Math.max(0, count),
        loaded: false,
        loading: false,
        error: 'No se pudo consultar. Reintenta.',
      });
    }
  }

  async act(kind: ReactionKind) {
    if (!this.active || !this.postId || !this.uid) return;
    const previous = this.state[kind];
    if (previous.loading) return;
    if (!previous.loaded) {
      await this.load(kind, previous.count, true);
      return;
    }
    const epoch = this.epoch;
    const desired = previous.pending ?? !previous.value;
    const count = Math.max(
      0,
      previous.count + (kind === 'like' && desired !== previous.value ? (desired ? 1 : -1) : 0),
    );
    this.update(kind, {
      ...previous,
      value: desired,
      count,
      loading: true,
      pending: desired,
      error: null,
    });
    try {
      await this.io.write(kind, desired, this.postId, this.uid);
      if (!this.active || epoch !== this.epoch) return;
      this.update(kind, { value: desired, count, loading: false, loaded: true, error: null });
    } catch {
      if (!this.active || epoch !== this.epoch) return;
      this.update(kind, {
        ...previous,
        loading: false,
        pending: desired,
        error: 'No se confirmó el cambio. Reintenta.',
      });
    }
  }
}

export function reactionLabel(kind: ReactionKind, state: ReactionState) {
  const name = kind === 'like' ? 'me gusta' : 'guardado';
  if (!state.loaded)
    return state.loading ? `Consultando ${name}` : `Reintentar consulta de ${name}`;
  if (state.pending !== undefined && state.error) {
    return state.pending
      ? `Reintentar ${kind === 'like' ? 'me gusta' : 'guardar'}`
      : `Reintentar quitar ${name}`;
  }
  return kind === 'like'
    ? state.value
      ? 'Quitar me gusta'
      : 'Me gusta'
    : state.value
      ? 'Quitar de guardados'
      : 'Guardar publicación';
}
