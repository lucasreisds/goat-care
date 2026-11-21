import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { addDays, weekKeyOf } from '../../src/core/time/calendar';
import { newCouple } from '../../src/online/model';

/**
 * Runs against the Firestore emulator (`npm run test:rules`).
 * Every couple write is tested with a verified email and, negatively, with an unverified one (decision 7).
 */
const OFFSET = -180;
const C = 'couple-1';
const now = new Date();
const today = new Date(now.getTime() + OFFSET * 60_000).toISOString().slice(0, 10);

let env: RulesTestEnvironment;

const as = (uid: string, verified = true): Firestore =>
  env.authenticatedContext(uid, { email: `${uid}@example.com`, email_verified: verified }).firestore() as unknown as Firestore;
const alice = (): Firestore => as('alice');
const bob = (): Firestore => as('bob');
const aliceUnverified = (): Firestore => as('alice', false);

const admin = async (fn: (db: Firestore) => Promise<unknown>): Promise<void> =>
  env.withSecurityRulesDisabled(async (ctx) => {
    await fn(ctx.firestore() as unknown as Firestore);
  });

const coupleDoc = (members: string[], over: Record<string, unknown> = {}): Record<string, unknown> => ({
  ...newCouple(members[0]!, 'America/Sao_Paulo', now),
  members,
  createdAt: Timestamp.now(),
  ...over,
});

const goalDoc = (ownerUid: string, id: string, over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id,
  ownerUid,
  title: 'Beber água',
  difficulty: 'hard',
  recurrence: { type: 'daily' },
  status: 'active',
  effectiveFrom: today,
  createdAt: now.toISOString(),
  updatedAt: now.toISOString(),
  ...over,
});

/** alice and bob paired, each with a profile and goals. */
async function seedCouple(over: Record<string, unknown> = {}): Promise<void> {
  await admin(async (db) => {
    await setDoc(doc(db, 'users/alice'), { coupleId: C, state: {} });
    await setDoc(doc(db, 'users/bob'), { coupleId: C, state: {} });
    await setDoc(doc(db, `couples/${C}`), coupleDoc(['alice', 'bob'], over));
    await setDoc(doc(db, `couples/${C}/goals/g-alice`), goalDoc('alice', 'g-alice'));
    await setDoc(doc(db, `couples/${C}/goals/g-alice-2`), goalDoc('alice', 'g-alice-2'));
    await setDoc(doc(db, `couples/${C}/goals/g-bob`), goalDoc('bob', 'g-bob'));
  });
}

interface CompletionArgs {
  uid?: string;
  goalId?: string;
  day?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  basePoints?: number;
  awarded?: number;
  dayPoints?: number;
  weekPoints?: number;
  skip?: Array<'completion' | 'day' | 'score'>;
}

/** The batch the app sends for one completion: completion + day counter + weekly score. */
function completionBatch(db: Firestore, args: CompletionArgs = {}): Promise<void> {
  const uid = args.uid ?? 'alice';
  const goalId = args.goalId ?? `g-${uid}`;
  const day = args.day ?? today;
  const week = weekKeyOf(day);
  const base = args.basePoints ?? 5;
  const awarded = args.awarded ?? base;
  const id = `${uid}_${goalId}_${day}`;
  const skip = args.skip ?? [];
  const batch = writeBatch(db);
  if (!skip.includes('completion')) {
    batch.set(doc(db, `couples/${C}/completions/${id}`), {
      uid,
      goalId,
      dayKey: day,
      weekKey: week,
      difficulty: args.difficulty ?? 'hard',
      basePoints: base,
      awardedPoints: awarded,
      bonusPct: 0,
      coins: base * 2,
      energy: base,
      altitude: awarded * 5,
      completedAt: now.toISOString(),
    });
  }
  if (!skip.includes('day')) {
    batch.set(doc(db, `couples/${C}/days/${uid}_${day}`), { uid, dayKey: day, points: args.dayPoints ?? awarded, lastCompletionId: id });
  }
  if (!skip.includes('score')) {
    batch.set(doc(db, `couples/${C}/weeks/${week}/scores/${uid}`), { uid, weekKey: week, points: args.weekPoints ?? awarded, lastCompletionId: id });
  }
  return batch.commit();
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-goat-care',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
});

describe('users', () => {
  it('lets a verified user create and read only their own profile', async () => {
    await assertSucceeds(setDoc(doc(alice(), 'users/alice'), { coupleId: null, state: {} }));
    await assertSucceeds(getDoc(doc(alice(), 'users/alice')));
    await assertFails(getDoc(doc(bob(), 'users/alice')));
    await assertFails(setDoc(doc(bob(), 'users/alice'), { coupleId: null }));
  });

  it('rejects an unverified email', async () => {
    await assertFails(setDoc(doc(aliceUnverified(), 'users/alice'), { coupleId: null, state: {} }));
  });

  it('does not let a profile point at a couple the user is not in', async () => {
    await seedCouple();
    await admin((db) => setDoc(doc(db, 'users/carol'), { coupleId: null }));
    await assertFails(updateDoc(doc(as('carol'), 'users/carol'), { coupleId: C }));
  });
});

describe('creating a couple', () => {
  const create = (db: Firestore, uid: string, over: Record<string, unknown> = {}): Promise<void> => {
    const batch = writeBatch(db);
    batch.set(doc(db, 'couples/new'), { ...newCouple(uid, 'America/Sao_Paulo', now), createdAt: serverTimestamp(), ...over });
    batch.update(doc(db, `users/${uid}`), { coupleId: 'new' });
    return batch.commit();
  };

  beforeEach(async () => {
    await admin((db) => setDoc(doc(db, 'users/alice'), { coupleId: null, state: {} }));
  });

  it('works together with the profile update', async () => {
    await assertSucceeds(create(alice(), 'alice'));
    await assertSucceeds(getDoc(doc(alice(), 'couples/new')));
    await assertFails(getDoc(doc(bob(), 'couples/new')));
  });

  it('rejects an unverified email', async () => {
    await assertFails(create(aliceUnverified(), 'alice'));
  });

  it('rejects a custom cap, extra members or a missing profile link', async () => {
    await assertFails(create(alice(), 'alice', { dailyCap: 50 }));
    await assertFails(create(alice(), 'alice', { members: ['alice', 'bob'] }));
    await assertFails(setDoc(doc(alice(), 'couples/new'), { ...newCouple('alice', 'America/Sao_Paulo', now), createdAt: serverTimestamp() }));
  });

  it('allows only one couple per person', async () => {
    await seedCouple();
    await assertFails(create(alice(), 'alice'));
  });
});

describe('invites and pairing', () => {
  const invite = (uid: string, minutes = 30): Record<string, unknown> => ({
    coupleId: C,
    createdBy: uid,
    expiresAt: Timestamp.fromMillis(Date.now() + minutes * 60_000),
    usedBy: null,
  });
  const join = (db: Firestore, uid: string, code: string): Promise<void> => {
    const batch = writeBatch(db);
    batch.update(doc(db, `invites/${code}`), { usedBy: uid });
    batch.update(doc(db, `couples/${C}`), { members: ['alice', uid], joinCode: code });
    batch.update(doc(db, `users/${uid}`), { coupleId: C });
    return batch.commit();
  };

  beforeEach(async () => {
    await admin(async (db) => {
      await setDoc(doc(db, 'users/alice'), { coupleId: C });
      await setDoc(doc(db, 'users/bob'), { coupleId: null });
      await setDoc(doc(db, `couples/${C}`), coupleDoc(['alice']));
    });
  });

  it('lets the lone member create an invite, readable by exact code only', async () => {
    await assertSucceeds(setDoc(doc(alice(), 'invites/ABC234'), invite('alice')));
    await assertSucceeds(getDoc(doc(bob(), 'invites/ABC234')));
    await assertFails(getDocs(collection(bob(), 'invites')));
    await assertFails(getDoc(doc(as('bob', false), 'invites/ABC234')));
  });

  it('rejects invalid invites', async () => {
    await assertFails(setDoc(doc(aliceUnverified(), 'invites/ABC234'), invite('alice')));
    await assertFails(setDoc(doc(alice(), 'invites/ABC10O'), invite('alice'))); // 1, 0 and O are not in the alphabet
    await assertFails(setDoc(doc(alice(), 'invites/ABC234'), invite('alice', 120)));
    await assertFails(setDoc(doc(bob(), 'invites/ABC234'), invite('bob'))); // not a member of the couple
  });

  it('pairs the partner and consumes the invite in one batch', async () => {
    await admin((db) => setDoc(doc(db, 'invites/ABC234'), invite('alice')));
    await assertSucceeds(join(bob(), 'bob', 'ABC234'));
    await assertSucceeds(getDoc(doc(bob(), `couples/${C}`)));
    // single use, and the couple is full
    await admin((db) => setDoc(doc(db, 'users/carol'), { coupleId: null }));
    await assertFails(join(as('carol'), 'carol', 'ABC234'));
  });

  it('rejects an unverified email, an expired invite and a half-done join', async () => {
    await admin((db) => setDoc(doc(db, 'invites/ABC234'), invite('alice')));
    await assertFails(join(as('bob', false), 'bob', 'ABC234'));
    await assertFails(updateDoc(doc(bob(), `couples/${C}`), { members: ['alice', 'bob'], joinCode: 'ABC234' }));
    await assertFails(updateDoc(doc(bob(), 'invites/ABC234'), { usedBy: 'bob' }));
    await admin((db) => setDoc(doc(db, 'invites/XYZ234'), invite('alice', -1)));
    await assertFails(join(bob(), 'bob', 'XYZ234'));
  });
});

describe('goals and member cards', () => {
  beforeEach(() => seedCouple());

  it('are readable by both members and nobody else', async () => {
    await assertSucceeds(getDocs(collection(bob(), `couples/${C}/goals`)));
    await assertFails(getDocs(collection(as('carol'), `couples/${C}/goals`)));
    await assertFails(getDoc(doc(as('carol'), `couples/${C}`)));
  });

  it('are written only by their owner', async () => {
    await assertSucceeds(setDoc(doc(alice(), `couples/${C}/goals/g-new`), goalDoc('alice', 'g-new')));
    await assertSucceeds(updateDoc(doc(alice(), `couples/${C}/goals/g-alice`), { status: 'paused' }));
    await assertFails(updateDoc(doc(bob(), `couples/${C}/goals/g-alice`), { status: 'paused' }));
    await assertFails(setDoc(doc(bob(), `couples/${C}/goals/g-fake`), goalDoc('alice', 'g-fake')));
    await assertFails(setDoc(doc(alice(), `couples/${C}/goals/g-bad`), goalDoc('alice', 'g-bad', { title: '' })));
  });

  it('reject an unverified email', async () => {
    await assertFails(setDoc(doc(aliceUnverified(), `couples/${C}/goals/g-new`), goalDoc('alice', 'g-new')));
    await assertFails(updateDoc(doc(aliceUnverified(), `couples/${C}/goals/g-alice`), { status: 'paused' }));
  });

  it('let each member write only their own card', async () => {
    const card = { displayName: 'Ana', characterId: 'mountain-goat', characterName: 'Pico', altitude: 0, outfit: [], owned: [] };
    await assertSucceeds(setDoc(doc(alice(), `couples/${C}/members/alice`), card));
    await assertSucceeds(getDoc(doc(bob(), `couples/${C}/members/alice`)));
    await assertFails(setDoc(doc(bob(), `couples/${C}/members/alice`), card));
    await assertFails(setDoc(doc(aliceUnverified(), `couples/${C}/members/alice`), card));
  });
});

describe('completions and the daily cap', () => {
  beforeEach(() => seedCouple());

  it('accepts a completion with its day counter and weekly score', async () => {
    await assertSucceeds(completionBatch(alice()));
    await assertSucceeds(getDocs(collection(bob(), `couples/${C}/completions`)));
    const score = await getDoc(doc(bob(), `couples/${C}/weeks/${weekKeyOf(today)}/scores/alice`));
    expect(score.data()?.points).toBe(5);
  });

  it('rejects an unverified email', async () => {
    await assertFails(completionBatch(aliceUnverified()));
  });

  it('rejects a completion without its counters, or counters without a completion', async () => {
    await assertFails(completionBatch(alice(), { skip: ['day'] }));
    await assertFails(completionBatch(alice(), { skip: ['score'] }));
    await assertFails(completionBatch(alice(), { skip: ['completion'] }));
  });

  it('rejects counters that do not add up', async () => {
    await assertFails(completionBatch(alice(), { dayPoints: 3 }));
    await assertFails(completionBatch(alice(), { weekPoints: 50 }));
    await admin((db) => setDoc(doc(db, `couples/${C}/days/alice_${today}`), { uid: 'alice', dayKey: today, points: 5, lastCompletionId: 'x' }));
    await assertFails(completionBatch(alice(), { dayPoints: 5 }));
    await assertSucceeds(completionBatch(alice(), { dayPoints: 10 }));
  });

  it('enforces the daily cap per person', async () => {
    await admin((db) => setDoc(doc(db, `couples/${C}/days/alice_${today}`), { uid: 'alice', dayKey: today, points: 13, lastCompletionId: 'x' }));
    await assertFails(completionBatch(alice(), { awarded: 5, dayPoints: 18 }));
    // trimmed to what is left of the cap: still counts
    await assertSucceeds(completionBatch(alice(), { awarded: 2, dayPoints: 15 }));
    // the cap is exhausted: a 0-point completion is still kept
    await assertSucceeds(completionBatch(alice(), { goalId: 'g-alice-2', awarded: 0, dayPoints: 15, weekPoints: 2 }));
    // bob has his own cap
    await assertSucceeds(completionBatch(bob(), { uid: 'bob' }));
  });

  it('uses the new cap only from the day it starts', async () => {
    await admin((db) => updateDoc(doc(db, `couples/${C}`), { capNext: { value: 5, from: addDays(today, 1) } }));
    await admin((db) => setDoc(doc(db, `couples/${C}/days/alice_${today}`), { uid: 'alice', dayKey: today, points: 5, lastCompletionId: 'x' }));
    await assertSucceeds(completionBatch(alice(), { dayPoints: 10 }));
  });

  it('rejects inflated points', async () => {
    await assertFails(completionBatch(alice(), { awarded: 8 })); // more than base x 1.3
    await assertFails(completionBatch(alice(), { difficulty: 'easy', basePoints: 5 }));
    await assertSucceeds(completionBatch(alice(), { awarded: 7 })); // 5 + 30% rounded up
  });

  it('allows one completion per goal per day and no edits', async () => {
    await assertSucceeds(completionBatch(alice()));
    await assertFails(completionBatch(alice(), { dayPoints: 10, weekPoints: 10 }));
    await assertFails(updateDoc(doc(alice(), `couples/${C}/completions/alice_g-alice_${today}`), { awardedPoints: 7 }));
  });

  it('rejects completing a goal of the partner or writing their counters', async () => {
    await assertFails(completionBatch(alice(), { goalId: 'g-bob' }));
    await assertFails(completionBatch(alice(), { uid: 'bob' }));
  });

  it('closes days by time: yesterday still syncs, old and future days do not', async () => {
    await assertSucceeds(completionBatch(alice(), { day: addDays(today, -1) }));
    await assertFails(completionBatch(alice(), { day: addDays(today, -4) }));
    await assertFails(completionBatch(alice(), { day: addDays(today, 2) }));
  });

  it('rejects a week key that is not the Monday of that day', async () => {
    const db = alice();
    const batch = writeBatch(db);
    const id = `alice_g-alice_${today}`;
    const wrongWeek = addDays(weekKeyOf(today), -7);
    batch.set(doc(db, `couples/${C}/completions/${id}`), {
      uid: 'alice', goalId: 'g-alice', dayKey: today, weekKey: wrongWeek, difficulty: 'hard', basePoints: 5,
      awardedPoints: 5, bonusPct: 0, coins: 10, energy: 5, altitude: 25, completedAt: now.toISOString(),
    });
    batch.set(doc(db, `couples/${C}/days/alice_${today}`), { uid: 'alice', dayKey: today, points: 5, lastCompletionId: id });
    batch.set(doc(db, `couples/${C}/weeks/${wrongWeek}/scores/alice`), { uid: 'alice', weekKey: wrongWeek, points: 5, lastCompletionId: id });
    await assertFails(batch.commit());
  });
});

describe('changing the daily cap together', () => {
  const ref = (db: Firestore) => doc(db, `couples/${C}`);
  const tomorrow = addDays(today, 1);

  beforeEach(() => seedCouple());

  it('needs one to propose and the OTHER to accept, starting tomorrow', async () => {
    await assertSucceeds(updateDoc(ref(alice()), { capProposal: { value: 20, by: 'alice' } }));
    await assertFails(updateDoc(ref(alice()), { capProposal: null, capNext: { value: 20, from: tomorrow }, dailyCap: 15 }));
    await assertFails(updateDoc(ref(bob()), { capProposal: null, capNext: { value: 20, from: today }, dailyCap: 15 }));
    await assertFails(updateDoc(ref(bob()), { capProposal: null, capNext: { value: 30, from: tomorrow }, dailyCap: 15 }));
    await assertFails(updateDoc(ref(bob()), { capProposal: null, capNext: { value: 20, from: tomorrow }, dailyCap: 20 }));
    await assertSucceeds(updateDoc(ref(bob()), { capProposal: null, capNext: { value: 20, from: tomorrow }, dailyCap: 15 }));
  });

  it('never changes directly', async () => {
    await assertFails(updateDoc(ref(alice()), { dailyCap: 50 }));
    await assertFails(updateDoc(ref(alice()), { capNext: { value: 50, from: tomorrow } }));
    await assertFails(updateDoc(ref(alice()), { capProposal: { value: 20, by: 'bob' } }));
    await assertFails(updateDoc(ref(alice()), { capProposal: { value: 500, by: 'alice' } }));
    await assertFails(updateDoc(ref(alice()), { members: ['alice'] }));
  });

  it('can be declined, and rejects an unverified email', async () => {
    await assertFails(updateDoc(ref(aliceUnverified()), { capProposal: { value: 20, by: 'alice' } }));
    await assertSucceeds(updateDoc(ref(alice()), { capProposal: { value: 20, by: 'alice' } }));
    await assertFails(updateDoc(ref(as('bob', false)), { capProposal: null }));
    await assertSucceeds(updateDoc(ref(bob()), { capProposal: null }));
  });

  it('folds a change already in force into the base cap', async () => {
    await admin((db) => updateDoc(ref(db), { capNext: { value: 20, from: addDays(today, -3) }, capProposal: { value: 10, by: 'alice' } }));
    await assertFails(updateDoc(ref(bob()), { capProposal: null, capNext: { value: 10, from: tomorrow }, dailyCap: 15 }));
    await assertSucceeds(updateDoc(ref(bob()), { capProposal: null, capNext: { value: 10, from: tomorrow }, dailyCap: 20 }));
  });
});

describe('caresses', () => {
  const caress = (from: string, to: string, over: Record<string, unknown> = {}): Record<string, unknown> => ({
    from, to, kind: 'message', ref: 'proud', createdAt: serverTimestamp(), seenAt: null, ...over,
  });

  beforeEach(() => seedCouple());

  it('go from one member to the other', async () => {
    await assertSucceeds(setDoc(doc(alice(), `couples/${C}/caresses/c1`), caress('alice', 'bob')));
    await assertSucceeds(setDoc(doc(alice(), `couples/${C}/caresses/c2`), caress('alice', 'bob', { kind: 'gift', ref: 'scarf-red' })));
    await assertSucceeds(getDocs(collection(bob(), `couples/${C}/caresses`)));
    await assertFails(getDocs(collection(as('carol'), `couples/${C}/caresses`)));
  });

  it('reject forged, self-addressed, free-text or unverified ones', async () => {
    await assertFails(setDoc(doc(alice(), `couples/${C}/caresses/c1`), caress('bob', 'alice')));
    await assertFails(setDoc(doc(alice(), `couples/${C}/caresses/c1`), caress('alice', 'alice')));
    await assertFails(setDoc(doc(alice(), `couples/${C}/caresses/c1`), caress('alice', 'carol')));
    await assertFails(setDoc(doc(alice(), `couples/${C}/caresses/c1`), caress('alice', 'bob', { text: 'oi' })));
    await assertFails(setDoc(doc(alice(), `couples/${C}/caresses/c1`), caress('alice', 'bob', { ref: 'x'.repeat(200) })));
    await assertFails(setDoc(doc(aliceUnverified(), `couples/${C}/caresses/c1`), caress('alice', 'bob')));
  });

  it('are marked as seen only by the receiver', async () => {
    await assertSucceeds(setDoc(doc(alice(), `couples/${C}/caresses/c1`), caress('alice', 'bob')));
    await assertFails(updateDoc(doc(alice(), `couples/${C}/caresses/c1`), { seenAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(bob(), `couples/${C}/caresses/c1`), { seenAt: serverTimestamp(), ref: 'other' }));
    await assertSucceeds(updateDoc(doc(bob(), `couples/${C}/caresses/c1`), { seenAt: serverTimestamp() }));
  });
});
