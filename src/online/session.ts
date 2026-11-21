import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  waitForPendingWrites,
  where,
  writeBatch,
  type DocumentData,
  type DocumentReference,
  type DocumentSnapshot,
  type Query,
  type QuerySnapshot,
  type Firestore,
  type Unsubscribe,
} from 'firebase/firestore';
import type { Completion, Goal } from '../core/goals/types';
import { initialState, type GameState } from '../core/state';
import { addDays, dayKeyOf, weekKeyOf, type DayKey } from '../core/time/calendar';
import type { KeyValueStore } from '../data/localStore';
import {
  acceptedCap,
  asLate,
  completionDocId,
  effectiveCap,
  generateInviteCode,
  INVITE_TTL_MINUTES,
  isSyncWindowOpen,
  isValidCap,
  newCouple,
  recalculate,
  type Caress,
  type CaressKind,
  type CoupleDoc,
  type MemberDoc,
} from './model';

/** The personal part of the game, stored in `users/{uid}.state` (only its owner can read it). */
export interface PrivateState {
  profile: GameState['profile'];
  moods: GameState['moods'];
  weeklyReviews: GameState['weeklyReviews'];
  inventory: GameState['inventory'];
  wardrobe: GameState['wardrobe'];
  giftsSent: GameState['giftsSent'];
  weeklyReviewEnabled: boolean;
  /** Completions that missed the sync window: coins and energy only. */
  late: Completion[];
}

export function privateOf(state: GameState, late: Completion[]): PrivateState {
  return {
    profile: state.profile,
    moods: state.moods,
    weeklyReviews: state.weeklyReviews,
    inventory: state.inventory,
    wardrobe: state.wardrobe,
    giftsSent: state.giftsSent,
    weeklyReviewEnabled: state.settings.weeklyReviewEnabled,
    late,
  };
}

function parsePrivate(raw: unknown): PrivateState {
  const base = privateOf(initialState(), []);
  const data = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<PrivateState>;
  return { ...base, ...data, profile: { ...base.profile, ...data.profile }, late: data.late ?? [] };
}

export interface UserDoc {
  coupleId: string | null;
  state: PrivateState;
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const byTime = (a: Completion, b: Completion): number => a.completedAt.localeCompare(b.completedAt);
const keyOf = (c: Pick<Completion, 'goalId' | 'dayKey'>): string => `${c.goalId}_${c.dayKey}`;
const errorCode = (error: unknown): string => (error as { code?: string } | null)?.code ?? '';

// ------------------------------------------------------------ before the session

export async function loadUser(db: Firestore, uid: string): Promise<UserDoc | null> {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return null;
  const data = snap.data();
  return { coupleId: (data.coupleId as string | null) ?? null, state: parsePrivate(data.state) };
}

export async function createUser(db: Firestore, uid: string, state: PrivateState): Promise<void> {
  await setDoc(doc(db, 'users', uid), { coupleId: null, state, createdAt: serverTimestamp() });
}

/** Starts a couple with one member; the partner joins later with an invite code. */
export async function createCouple(db: Firestore, uid: string, timezone: string, now: Date): Promise<string> {
  const ref = doc(collection(db, 'couples'));
  const batch = writeBatch(db);
  batch.set(ref, { ...newCouple(uid, timezone, now), createdAt: serverTimestamp() });
  batch.update(doc(db, 'users', uid), { coupleId: ref.id });
  await batch.commit();
  return ref.id;
}

export type JoinIssue = 'not-found' | 'expired' | 'used' | 'own' | 'failed';

/** Joins the partner's couple, consuming the invite in the same batch (the rules require it). */
export async function joinCouple(db: Firestore, uid: string, code: string): Promise<{ ok: true; coupleId: string } | { ok: false; reason: JoinIssue }> {
  try {
    const invite = await getDoc(doc(db, 'invites', code));
    if (!invite.exists()) return { ok: false, reason: 'not-found' };
    const data = invite.data();
    if (data.createdBy === uid) return { ok: false, reason: 'own' };
    if (data.usedBy !== null) return { ok: false, reason: 'used' };
    if ((data.expiresAt as Timestamp).toMillis() <= Date.now()) return { ok: false, reason: 'expired' };

    const coupleId = data.coupleId as string;
    const batch = writeBatch(db);
    batch.update(invite.ref, { usedBy: uid });
    batch.update(doc(db, 'couples', coupleId), { members: arrayUnion(uid), joinCode: code });
    batch.update(doc(db, 'users', uid), { coupleId });
    await batch.commit();
    return { ok: true, coupleId };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}

// --------------------------------------------------------------------- session

export interface SessionDeps {
  db: Firestore;
  uid: string;
  coupleId: string;
  /** Holds the offline completion queue. */
  store: KeyValueStore;
  now: () => Date;
  /** The card the partner sees, derived from the state (needs the item catalog, so the app provides it). */
  card: (state: GameState) => MemberDoc;
}

export interface RankingEntry {
  uid: string;
  card: MemberDoc | null;
  /** Ranking points this week. */
  points: number;
}

export interface WeekResult {
  weekKey: DayKey;
  scores: Record<string, number>;
}

const MAX_DENIALS = 5;

/**
 * The online game: composes the GameState from Firestore listeners and writes changes back.
 *
 * - Goals, profile, wardrobe and so on are written straight away; Firestore's offline cache queues them.
 * - Completions go through OUR queue: one transaction each, in `completedAt` order, with the points
 *   recalculated against the day's counter at sync time (decision 4). A completion is never discarded;
 *   one that misses the 48 h window is kept as "late" (coins and energy only).
 */
export class Session {
  readonly uid: string;
  readonly coupleId: string;

  private readonly db: Firestore;
  private readonly deps: SessionDeps;
  private readonly listeners = new Set<() => void>();
  private readonly caressListeners = new Set<(caress: Caress) => void>();
  private readonly unsubs: Unsubscribe[] = [];
  private weekUnsub: Unsubscribe | null = null;

  private coupleDoc!: CoupleDoc;
  private priv!: PrivateState;
  private goals: Goal[] = [];
  private partnerGoalList: Goal[] = [];
  private serverCompletions: Completion[] = [];
  private weekCompletions: Array<Completion & { uid: string }> = [];
  private memberCards: Record<string, MemberDoc> = {};
  private caressList: Caress[] = [];
  private queue: Completion[] = [];
  private readonly denials = new Map<string, number>();
  private readonly announced = new Set<string>();
  private syncing = false;
  /** True once every listener delivered its first snapshot (composing needs all of them). */
  private started = false;
  private currentWeek: DayKey = '';
  private lastCard = '';
  private composed: GameState = initialState();

  private constructor(deps: SessionDeps) {
    this.deps = deps;
    this.db = deps.db;
    this.uid = deps.uid;
    this.coupleId = deps.coupleId;
    this.queue = this.loadQueue();
  }

  /** Resolves once the first snapshot of everything the home screen needs has arrived. */
  static async start(deps: SessionDeps): Promise<Session> {
    const session = new Session(deps);
    await session.listen();
    session.compose();
    void session.sync();
    window.addEventListener('online', () => void session.sync());
    document.addEventListener('visibilitychange', () => !document.hidden && void session.sync());
    window.setInterval(() => void session.sync(), 60_000);
    return session;
  }

  // ---------------------------------------------------------------- reading

  get state(): GameState {
    return this.composed;
  }

  get couple(): CoupleDoc {
    return this.coupleDoc;
  }

  get partnerUid(): string | null {
    return this.coupleDoc.members.find((m) => m !== this.uid) ?? null;
  }

  get partner(): MemberDoc | null {
    const uid = this.partnerUid;
    return uid ? (this.memberCards[uid] ?? null) : null;
  }

  get partnerGoals(): readonly Goal[] {
    return this.partnerGoalList;
  }

  /** What the partner completed this week (enough to tell which of their goals are done today). */
  get partnerWeekCompletions(): Completion[] {
    return this.weekCompletions.filter((c) => c.uid !== this.uid);
  }

  get caresses(): readonly Caress[] {
    return this.caressList;
  }

  /** Completions still waiting to reach the server. */
  get pendingSync(): number {
    return this.queue.length;
  }

  /** This week's ranking, me first. My points include completions still waiting to sync. */
  ranking(): RankingEntry[] {
    const mine = this.composed.completions.filter((c) => c.weekKey === this.currentWeek).reduce((sum, c) => sum + c.awardedPoints, 0);
    const entries: RankingEntry[] = [{ uid: this.uid, card: this.deps.card(this.composed), points: mine }];
    const partnerUid = this.partnerUid;
    if (partnerUid) {
      const points = this.weekCompletions.filter((c) => c.uid === partnerUid).reduce((sum, c) => sum + c.awardedPoints, 0);
      entries.push({ uid: partnerUid, card: this.memberCards[partnerUid] ?? null, points });
    }
    return entries;
  }

  /** Final scores of the previous weeks, newest first (weeks nobody scored in are skipped). */
  async history(weeks: number): Promise<WeekResult[]> {
    const keys = Array.from({ length: weeks }, (_, i) => addDays(this.currentWeek, -7 * (i + 1)));
    const results = await Promise.all(
      keys.map(async (weekKey) => {
        const snap = await getDocs(collection(this.db, 'couples', this.coupleId, 'weeks', weekKey, 'scores'));
        const scores: Record<string, number> = {};
        snap.forEach((d) => (scores[d.id] = Number(d.data().points) || 0));
        return { weekKey, scores };
      }),
    );
    return results.filter((r) => Object.keys(r.scores).length > 0);
  }

  onChange(listener: () => void): void {
    this.listeners.add(listener);
  }

  /** Fires once for every caress addressed to me that I have not seen yet. */
  onCaress(listener: (caress: Caress) => void): void {
    this.caressListeners.add(listener);
    for (const caress of this.caressList) this.announce(caress);
  }

  // ---------------------------------------------------------------- writing

  /** Persists whatever changed between the current state and `next`. */
  apply(next: GameState): void {
    const prev = this.composed;

    for (const goal of next.goals) {
      const old = prev.goals.find((g) => g.id === goal.id);
      if (old && same(old, goal)) continue;
      this.write(setDoc(doc(this.db, 'couples', this.coupleId, 'goals', goal.id), { ...goal, ownerUid: this.uid }));
    }
    this.goals = next.goals;

    const known = new Set(prev.completions.map((c) => c.id));
    const fresh = next.completions.filter((c) => !known.has(c.id));
    if (fresh.length > 0) {
      this.queue.push(...fresh);
      this.saveQueue();
    }

    this.savePrivate(privateOf(next, this.priv.late));
    this.compose();
    if (fresh.length > 0) void this.sync();
  }

  /** Recomputes what depends on the clock (day and week turn, the cap that starts today). */
  refresh(): void {
    const week = weekKeyOf(this.today());
    if (week !== this.currentWeek) this.listenWeek(week);
    const before = this.composed;
    this.compose(false);
    if (!same(before.settings, this.composed.settings)) this.emit();
  }

  /** A new single-use invite code (the previous ones simply expire). */
  async createInvite(): Promise<{ code: string; expiresAt: Date }> {
    const expiresAt = new Date(Date.now() + INVITE_TTL_MINUTES * 60_000);
    for (let attempt = 0; ; attempt++) {
      const code = generateInviteCode();
      try {
        await setDoc(doc(this.db, 'invites', code), {
          coupleId: this.coupleId,
          createdBy: this.uid,
          expiresAt: Timestamp.fromDate(expiresAt),
          usedBy: null,
        });
        return { code, expiresAt };
      } catch (error) {
        // a code that already exists is refused by the rules (it would be an update): try another
        if (attempt >= 2) throw error;
      }
    }
  }

  /** The daily cap changes only when both agree: one proposes, the other accepts. */
  async proposeCap(value: number): Promise<void> {
    if (!isValidCap(value)) throw new Error('invalid cap');
    await updateDoc(this.coupleRef(), { capProposal: { value, by: this.uid } });
  }

  async declineCap(): Promise<void> {
    await updateDoc(this.coupleRef(), { capProposal: null });
  }

  /** Accepts the partner's proposal; the new cap starts tomorrow. */
  async acceptCap(): Promise<void> {
    const next = acceptedCap(this.coupleDoc, this.today());
    if (!next || this.coupleDoc.capProposal?.by === this.uid) throw new Error('nothing to accept');
    await updateDoc(this.coupleRef(), { ...next });
  }

  /** Sends a predefined message or an item gift. Returns the caress id. */
  async sendCaress(kind: CaressKind, ref: string): Promise<string> {
    const to = this.partnerUid;
    if (!to) throw new Error('no partner yet');
    const caressRef = doc(collection(this.db, 'couples', this.coupleId, 'caresses'));
    await setDoc(caressRef, { from: this.uid, to, kind, ref, createdAt: serverTimestamp(), seenAt: null });
    return caressRef.id;
  }

  markSeen(caressId: string): void {
    this.write(updateDoc(doc(this.db, 'couples', this.coupleId, 'caresses', caressId), { seenAt: serverTimestamp() }));
  }

  // ------------------------------------------------------------- listeners

  private coupleRef() {
    return doc(this.db, 'couples', this.coupleId);
  }

  private today(): DayKey {
    return dayKeyOf(this.deps.now(), this.coupleDoc.timezone);
  }

  private listen(): Promise<void> {
    const couplePath = ['couples', this.coupleId] as const;
    const first: Array<Promise<void>> = [];
    /** Wraps a listener: the returned promise settles on its first snapshot; later ones recompose. */
    const track = <S>(handle: (snap: S) => void, start: (next: (snap: S) => void, fail: (error: Error) => void) => Unsubscribe): void => {
      first.push(
        new Promise<void>((resolve, reject) => {
          let ready = false;
          this.unsubs.push(
            start(
              (snap) => {
                handle(snap);
                if (!ready) {
                  ready = true;
                  resolve();
                } else if (this.started) {
                  this.compose();
                }
              },
              (error) => {
                console.error('[sync] listener failed', error);
                if (!ready) reject(error);
              },
            ),
          );
        }),
      );
    };
    const subDoc = (ref: DocumentReference, handle: (snap: DocumentSnapshot) => void): void =>
      track<DocumentSnapshot>(handle, (next, fail) => onSnapshot(ref, next, fail));
    const subQuery = (q: Query, handle: (snap: QuerySnapshot) => void): void =>
      track<QuerySnapshot>(handle, (next, fail) => onSnapshot(q, next, fail));

    subDoc(
      doc(this.db, 'users', this.uid),
      (snap) => {
        // our own pending write is already what we hold; the server copy matters on other devices
        if (this.priv && snap.metadata.hasPendingWrites) return;
        this.priv = parsePrivate(snap.data()?.state);
      },
    );
    subDoc(
      this.coupleRef(),
      (snap) => {
        this.coupleDoc = snap.data() as CoupleDoc;
      },
    );
    subQuery(
      collection(this.db, ...couplePath, 'goals'),
      (snap) => {
        const mine: Goal[] = [];
        const theirs: Goal[] = [];
        snap.forEach((d) => {
          const { ownerUid, ...goal } = d.data() as Goal & { ownerUid: string };
          (ownerUid === this.uid ? mine : theirs).push(goal);
        });
        const order = (a: Goal, b: Goal): number => a.createdAt.localeCompare(b.createdAt);
        this.goals = mine.sort(order);
        this.partnerGoalList = theirs.sort(order);
      },
    );
    subQuery(
      query(collection(this.db, ...couplePath, 'completions'), where('uid', '==', this.uid)),
      (snap) => {
        this.serverCompletions = snap.docs.map((d) => this.toCompletion(d.data()));
      },
    );
    subQuery(
      collection(this.db, ...couplePath, 'members'),
      (snap) => {
        const cards: Record<string, MemberDoc> = {};
        snap.forEach((d) => (cards[d.id] = d.data() as MemberDoc));
        this.memberCards = cards;
      },
    );
    subQuery(
      query(collection(this.db, ...couplePath, 'caresses'), orderBy('createdAt', 'desc'), limit(30)),
      (snap) => {
        this.caressList = snap.docs.map((d) => {
          const data = d.data({ serverTimestamps: 'estimate' });
          return {
            id: d.id,
            from: data.from as string,
            to: data.to as string,
            kind: data.kind as CaressKind,
            ref: data.ref as string,
            createdAtMs: (data.createdAt as Timestamp | null)?.toMillis() ?? Date.now(),
            seen: data.seenAt !== null,
          };
        });
        if (!this.started) return;
        this.receiveGifts();
        for (const caress of this.caressList) this.announce(caress);
      },
    );

    return Promise.all(first).then(() => {
      this.started = true;
      this.receiveGifts();
      this.listenWeek(weekKeyOf(this.today()));
    });
  }

  /** Both members' completions of the current week: the live ranking and the partner's day. */
  private listenWeek(week: DayKey): void {
    this.weekUnsub?.();
    this.currentWeek = week;
    this.weekCompletions = [];
    this.weekUnsub = onSnapshot(
      query(collection(this.db, 'couples', this.coupleId, 'completions'), where('weekKey', '==', week)),
      (snap) => {
        this.weekCompletions = snap.docs.map((d) => ({ ...this.toCompletion(d.data()), uid: d.data().uid as string }));
        this.emit();
      },
      (error) => console.error('[sync] week listener failed', error),
    );
  }

  private toCompletion(data: DocumentData): Completion {
    const { uid: _uid, ...rest } = data as Omit<Completion, 'id'> & { uid: string };
    void _uid;
    return { ...rest, id: `${rest.goalId}_${rest.dayKey}_1` };
  }

  // --------------------------------------------------------------- compose

  private compose(notify = true): void {
    const onServer = new Set(this.serverCompletions.map(keyOf));
    const waiting = this.queue.filter((c) => !onServer.has(keyOf(c)));
    const completions = [...this.serverCompletions, ...this.priv.late, ...waiting].sort(byTime);

    this.composed = {
      ...initialState(),
      profile: this.priv.profile,
      moods: this.priv.moods,
      weeklyReviews: this.priv.weeklyReviews,
      inventory: this.priv.inventory,
      wardrobe: this.priv.wardrobe,
      giftsSent: this.priv.giftsSent,
      settings: {
        timezone: this.coupleDoc.timezone,
        dailyCap: effectiveCap(this.coupleDoc, this.today()),
        weeklyReviewEnabled: this.priv.weeklyReviewEnabled,
      },
      goals: this.goals,
      completions,
    };
    this.publishCard();
    if (notify) this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  /** Keeps `members/{uid}` (what the partner sees) in step with the state. */
  private publishCard(): void {
    const card = this.deps.card(this.composed);
    const serialized = JSON.stringify(card);
    if (serialized === this.lastCard) return;
    this.lastCard = serialized;
    this.write(setDoc(doc(this.db, 'couples', this.coupleId, 'members', this.uid), { ...card, updatedAt: serverTimestamp() }));
  }

  private savePrivate(next: PrivateState): void {
    if (same(next, this.priv)) return;
    this.priv = next;
    this.write(updateDoc(doc(this.db, 'users', this.uid), { state: next }));
  }

  /** Fire-and-forget write: Firestore queues it offline and the listeners reflect it at once. */
  private write(promise: Promise<unknown>): void {
    promise.catch((error: unknown) => console.error('[sync] write failed', error));
  }

  // -------------------------------------------------------------- caresses

  /** A gift becomes an owned item (it cost the sender, not me). */
  private receiveGifts(): void {
    let inventory = this.priv.inventory;
    for (const caress of this.caressList) {
      if (caress.to !== this.uid || caress.kind !== 'gift' || inventory[caress.ref]) continue;
      inventory = { ...inventory, [caress.ref]: { at: new Date(caress.createdAtMs).toISOString(), paid: 0 } };
    }
    if (inventory !== this.priv.inventory) this.savePrivate({ ...this.priv, inventory });
  }

  private announce(caress: Caress): void {
    if (caress.to !== this.uid || caress.seen || this.announced.has(caress.id) || this.caressListeners.size === 0) return;
    this.announced.add(caress.id);
    for (const listener of this.caressListeners) listener(caress);
  }

  // ------------------------------------------------------------ sync queue

  private queueKey(): string {
    return `goat-care/queue/${this.uid}`;
  }

  private loadQueue(): Completion[] {
    try {
      const parsed: unknown = JSON.parse(this.deps.store.get(this.queueKey()) ?? '[]');
      return Array.isArray(parsed) ? (parsed as Completion[]) : [];
    } catch {
      return [];
    }
  }

  private saveQueue(): void {
    this.deps.store.set(this.queueKey(), JSON.stringify(this.queue));
  }

  /** Sends queued completions in the order they happened, one transaction each. */
  async sync(): Promise<void> {
    if (this.syncing || this.queue.length === 0 || !navigator.onLine) return;
    this.syncing = true;
    try {
      // goals created offline must reach the server first: the rules check the goal's owner
      await waitForPendingWrites(this.db);
      for (const completion of [...this.queue].sort(byTime)) {
        const outcome = await this.push(completion);
        if (outcome === 'offline') break;
        if (outcome === 'denied') continue;
        this.queue = this.queue.filter((c) => c.id !== completion.id);
        this.saveQueue();
        if (outcome === 'late') this.savePrivate({ ...this.priv, late: [...this.priv.late, asLate(completion)] });
        this.compose();
      }
    } finally {
      this.syncing = false;
    }
  }

  private async push(completion: Completion): Promise<'synced' | 'late' | 'denied' | 'offline'> {
    const offset = this.coupleDoc.utcOffsetMinutes;
    if (!isSyncWindowOpen(completion.dayKey, offset, Date.now())) return 'late';

    const base = ['couples', this.coupleId] as const;
    const id = completionDocId(this.uid, completion);
    const compRef = doc(this.db, ...base, 'completions', id);
    const dayRef = doc(this.db, ...base, 'days', `${this.uid}_${completion.dayKey}`);
    const scoreRef = doc(this.db, ...base, 'weeks', completion.weekKey, 'scores', this.uid);
    try {
      await runTransaction(this.db, async (tx) => {
        const [existing, day, score] = await Promise.all([tx.get(compRef), tx.get(dayRef), tx.get(scoreRef)]);
        // already there: another device completed it, or an earlier attempt went through
        if (existing.exists()) return;
        const dayPoints = day.exists() ? Number(day.data().points) : 0;
        const weekPoints = score.exists() ? Number(score.data().points) : 0;
        const final = recalculate(completion, dayPoints, effectiveCap(this.coupleDoc, completion.dayKey));
        const { id: _id, late: _late, ...fields } = final;
        void _id;
        void _late;
        tx.set(compRef, { ...fields, uid: this.uid });
        tx.set(dayRef, { uid: this.uid, dayKey: completion.dayKey, points: dayPoints + final.awardedPoints, lastCompletionId: id });
        tx.set(scoreRef, { uid: this.uid, weekKey: completion.weekKey, points: weekPoints + final.awardedPoints, lastCompletionId: id });
      });
      return 'synced';
    } catch (error) {
      if (errorCode(error) !== 'permission-denied') return 'offline';
      // Refused by the rules. Usually transient (e.g. the cap changed under us); give up after a few tries.
      const count = (this.denials.get(completion.id) ?? 0) + 1;
      this.denials.set(completion.id, count);
      console.error('[sync] completion refused', completion.id, error);
      return count >= MAX_DENIALS ? 'late' : 'denied';
    }
  }
}
