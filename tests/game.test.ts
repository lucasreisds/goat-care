import { describe, expect, it } from 'vitest';
import {
  addGoal,
  agenda,
  archiveGoal,
  changeGoal,
  completeGoal,
  completeOnboarding,
  currentStreak,
  pauseGoal,
  pendingWeeklyReview,
  recordWeeklyReview,
  renameCharacter,
  resumeGoal,
  setMood,
  moodToday,
  settle,
  suggestName,
  validateCharacterName,
  MAX_CHARACTER_NAME,
} from '../src/core/game';
import { MAX_ACTIVE_GOALS } from '../src/core/goals/rules';
import { characterNameOf, initialState, totalsOf, type GameState } from '../src/core/state';
import { browserStore, loadState, parseState, saveState, STORAGE_KEY, type KeyValueStore } from '../src/data/localStore';
import { at, goalInput, nextId, stateWith } from './helpers';

function ok<T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> {
  if (!r.ok) throw new Error(`expected ok, got ${JSON.stringify(r)}`);
  return r as Extract<T, { ok: true }>;
}

describe('completing goals', () => {
  it('a goal created today can be completed today', () => {
    const state = stateWith('2026-11-16', [goalInput()]);
    expect(agenda(state, at('2026-11-15'))).toHaveLength(0);
    expect(agenda(state, at('2026-11-16'))).toHaveLength(1);
    expect(completeGoal(state, state.goals[0]!.id, at('2026-11-16'))).toMatchObject({ ok: true });
  });

  it('awards points, coins, energy and altitude', () => {
    const state = stateWith('2026-11-16', [goalInput({ difficulty: 'medium' })]);
    const done = ok(completeGoal(state, state.goals[0]!.id, at('2026-11-17')));
    expect(done.completion).toMatchObject({ basePoints: 3, awardedPoints: 3, coins: 6, energy: 3, altitude: 15, dayKey: '2026-11-17', weekKey: '2026-11-16' });
    expect(totalsOf(done.state)).toEqual({ coins: 6, energy: 3, altitude: 15 });
  });

  it('only once per goal per day', () => {
    const state = stateWith('2026-11-16', [goalInput()]);
    const id = state.goals[0]!.id;
    const first = ok(completeGoal(state, id, at('2026-11-17', '08:00')));
    expect(completeGoal(first.state, id, at('2026-11-17', '20:00'))).toMatchObject({ ok: false, reason: 'already-done' });
    expect(ok(completeGoal(first.state, id, at('2026-11-18'))).completion.dayKey).toBe('2026-11-18');
  });

  it('respects the daily cap across goals, without discarding the completion', () => {
    const state = stateWith('2026-11-16', Array.from({ length: 4 }, (_, i) => goalInput({ title: `m${i}`, difficulty: 'hard' })));
    let s: GameState = state;
    const awards: number[] = [];
    for (const g of state.goals) {
      const r = ok(completeGoal(s, g.id, at('2026-11-17')));
      s = r.state;
      awards.push(r.completion.awardedPoints);
    }
    expect(awards).toEqual([5, 5, 5, 0]); // cap 15, the 4th still completes with 0 points
    expect(s.completions).toHaveLength(4);
    expect(totalsOf(s).coins).toBe(4 * 10); // coins ignore the cap
    expect(totalsOf(s).altitude).toBe(15 * 5); // altitude does not
  });

  it('adds the streak bonus after enough consecutive days', () => {
    let s = stateWith('2026-11-01', [goalInput({ difficulty: 'hard' })]);
    const id = s.goals[0]!.id;
    const bonuses: number[] = [];
    for (const day of ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05']) {
      const r = ok(completeGoal(s, id, at(day)));
      s = r.state;
      bonuses.push(r.completion.bonusPct);
    }
    expect(bonuses).toEqual([0, 0, 0, 10]); // streak reaches 3 days before the 4th completion
    expect(currentStreak(s, at('2026-11-06'))).toBe(4);
  });

  it('reports altitude milestones crossed', () => {
    let s = stateWith('2026-11-01', [goalInput({ difficulty: 'hard' })]);
    s = {
      ...s,
      completions: [
        { id: 'old', goalId: 'x', dayKey: '2026-10-01', weekKey: '2026-09-28', difficulty: 'hard', basePoints: 5, awardedPoints: 5, bonusPct: 0, coins: 0, energy: 0, altitude: 140, completedAt: '' },
      ],
    };
    const r = ok(completeGoal(s, s.goals[0]!.id, at('2026-11-02')));
    expect(r.newMilestones).toEqual([150]); // 140 + 25 crosses 150
  });
});

describe('goal management', () => {
  it('limits active goals to 10', () => {
    const state = stateWith('2026-11-16', Array.from({ length: MAX_ACTIVE_GOALS }, (_, i) => goalInput({ title: `m${i}` })));
    expect(addGoal(state, goalInput({ title: 'extra' }), at('2026-11-16'), nextId())).toMatchObject({ ok: false, reason: 'limit' });
  });

  it('a paused goal frees a slot, resuming needs a free slot', () => {
    const state = stateWith('2026-11-01', Array.from({ length: MAX_ACTIVE_GOALS }, (_, i) => goalInput({ title: `m${i}` })));
    const first = state.goals[0]!.id;
    const paused = ok(pauseGoal(state, first, at('2026-11-16')));
    const withExtra = ok(addGoal(paused.state, goalInput({ title: 'extra' }), at('2026-11-16'), nextId()));
    expect(resumeGoal(withExtra.state, first, at('2026-11-16'))).toMatchObject({ ok: false, reason: 'limit' });
  });

  it('rejects invalid input with machine-readable issues', () => {
    const state = stateWith('2026-11-16', []);
    expect(addGoal(state, goalInput({ title: '' }), at('2026-11-16'), nextId())).toMatchObject({ ok: false, reason: 'invalid', issues: ['title-empty'] });
    const withGoal = stateWith('2026-11-01', [goalInput()]);
    expect(changeGoal(withGoal, withGoal.goals[0]!.id, { title: '' }, at('2026-11-16'))).toMatchObject({ ok: false, reason: 'invalid' });
    expect(changeGoal(withGoal, 'nope', { title: 'x' }, at('2026-11-16'))).toMatchObject({ ok: false, reason: 'unknown-goal' });
  });

  it('edits keep today as it was and apply tomorrow', () => {
    const state = stateWith('2026-11-01', [goalInput({ difficulty: 'easy' })]);
    const id = state.goals[0]!.id;
    const edited = ok(changeGoal(state, id, { difficulty: 'hard' }, at('2026-11-16'))).state;
    expect(ok(completeGoal(edited, id, at('2026-11-16'))).completion.basePoints).toBe(1); // today: old value
    expect(ok(completeGoal(edited, id, at('2026-11-17'))).completion.basePoints).toBe(5); // tomorrow: new value
  });

  it('archived goals disappear from tomorrow', () => {
    const state = stateWith('2026-11-01', [goalInput()]);
    const archived = ok(archiveGoal(state, state.goals[0]!.id, at('2026-11-16'))).state;
    expect(agenda(archived, at('2026-11-16'))).toHaveLength(1);
    expect(agenda(archived, at('2026-11-17'))).toHaveLength(0);
  });

  it('settle makes pending changes permanent without changing behavior', () => {
    const state = stateWith('2026-11-01', [goalInput()]);
    const paused = ok(pauseGoal(state, state.goals[0]!.id, at('2026-11-16'))).state;
    const settled = settle(paused, at('2026-11-17'));
    expect(settled.goals[0]!.status).toBe('paused');
    expect(settled.goals[0]!.pending).toBeUndefined();
    expect(settle(settled, at('2026-11-17'))).toBe(settled);
  });
});

describe('weekly review', () => {
  const played = (): GameState => {
    let s = stateWith('2026-11-01', [goalInput()]);
    s = ok(completeGoal(s, s.goals[0]!.id, at('2026-11-10'))).state; // previous week (Mon 9th..Sun 15th)
    return s;
  };

  it('is offered on Mondays for the previous week', () => {
    expect(pendingWeeklyReview(played(), at('2026-11-16'))).toBe('2026-11-09');
  });

  it('is not offered on other days', () => {
    expect(pendingWeeklyReview(played(), at('2026-11-17'))).toBeNull();
    expect(pendingWeeklyReview(played(), at('2026-11-15'))).toBeNull();
  });

  it('is optional: can be switched off, and once handled is not offered again', () => {
    const s = played();
    expect(pendingWeeklyReview({ ...s, settings: { ...s.settings, weeklyReviewEnabled: false } }, at('2026-11-16'))).toBeNull();
    const handled = recordWeeklyReview(s, '2026-11-09', at('2026-11-16'));
    expect(pendingWeeklyReview(handled, at('2026-11-16', '20:00'))).toBeNull();
  });

  it('ignoring it leaves every goal exactly as it was', () => {
    const s = played();
    const later = settle(s, at('2026-11-16'));
    expect(later.goals).toEqual(s.goals);
  });

  it('is not offered when the previous week had nothing', () => {
    const s = stateWith('2026-11-14', [goalInput()]); // goal starts the 15th, nothing in the week of the 9th
    expect(pendingWeeklyReview(s, at('2026-11-16'))).toBe('2026-11-09'); // the goal was active on the 15th (Sunday)
    const none = stateWith('2026-11-16', [goalInput()]);
    expect(pendingWeeklyReview(none, at('2026-11-16'))).toBeNull();
  });
});

describe('mood check-in', () => {
  it('stores one mood per day', () => {
    const s = stateWith('2026-11-16', []);
    expect(moodToday(s, at('2026-11-17'))).toBeNull();
    const a = setMood(s, 'good', at('2026-11-17', '08:00'));
    const b = setMood(a, 'low', at('2026-11-17', '20:00'));
    expect(moodToday(b, at('2026-11-17'))).toBe('low');
    expect(moodToday(b, at('2026-11-18'))).toBeNull();
  });
});

describe('names', () => {
  it('validates the character name (up to 16 characters)', () => {
    expect(validateCharacterName('')).toBe('empty');
    expect(validateCharacterName('   ')).toBe('empty');
    expect(validateCharacterName('a'.repeat(MAX_CHARACTER_NAME))).toBeNull();
    expect(validateCharacterName('a'.repeat(MAX_CHARACTER_NAME + 1))).toBe('too-long');
  });

  it('counts characters, not UTF-16 units', () => {
    expect(validateCharacterName('🐐'.repeat(MAX_CHARACTER_NAME))).toBeNull();
  });

  it('keeps the character name per character in the profile, apart from the display name', () => {
    const done = completeOnboarding(initialState(), ' Ana ', ' Pico ');
    if (typeof done === 'string') throw new Error(done);
    expect(done.profile.displayName).toBe('Ana');
    expect(done.profile.characters['mountain-goat']).toEqual({ name: 'Pico' });
    expect(done.profile.onboarded).toBe(true);
    expect(characterNameOf(done)).toBe('Pico');

    const renamed = renameCharacter(done, 'mountain-goat', 'Neve');
    if (typeof renamed === 'string') throw new Error(renamed);
    expect(characterNameOf(renamed)).toBe('Neve');
    expect(renamed.profile.displayName).toBe('Ana');
    expect(renameCharacter(done, 'mountain-goat', '')).toBe('empty');
  });

  it('refuses onboarding with bad names', () => {
    expect(completeOnboarding(initialState(), '', 'Pico')).toBe('empty');
    expect(completeOnboarding(initialState(), 'Ana', 'x'.repeat(17))).toBe('too-long');
  });

  it('suggests a different name from the current one', () => {
    const names = ['A', 'B', 'C'];
    for (let i = 0; i < 20; i++) expect(suggestName(names, Math.random, 'A')).not.toBe('A');
    expect(suggestName(['Only'], () => 0.5, 'Only')).toBe('Only');
  });
});

describe('persistence', () => {
  const memory = (): KeyValueStore & { data: Map<string, string> } => {
    const data = new Map<string, string>();
    return { data, get: (k) => data.get(k) ?? null, set: (k, v) => void data.set(k, v) };
  };

  it('round-trips the whole state', () => {
    const store = memory();
    const base = stateWith('2026-11-16', [goalInput()]);
    const state = ok(completeGoal(base, base.goals[0]!.id, at('2026-11-17'))).state;
    saveState(store, state);
    expect(loadState(store)).toEqual({ state, recovered: false });
  });

  it('starts fresh when nothing is stored', () => {
    expect(loadState(memory())).toEqual({ state: initialState(), recovered: false });
  });

  it('recovers from corrupt data and keeps a backup', () => {
    const store = memory();
    store.set(STORAGE_KEY, '{not json');
    const result = loadState(store);
    expect(result.recovered).toBe(true);
    expect(result.state).toEqual(initialState());
    expect(store.get(`${STORAGE_KEY}/backup`)).toBe('{not json');
  });

  it('rejects an unknown version and fills missing settings with defaults', () => {
    expect(parseState(JSON.stringify({ ...initialState(), version: 99 }))).toBeNull();
    const old = JSON.parse(JSON.stringify(initialState())) as { settings: Record<string, unknown> };
    delete old.settings.weeklyReviewEnabled;
    expect(parseState(JSON.stringify(old))?.settings.weeklyReviewEnabled).toBe(true);
  });

  it('browserStore works even without localStorage (in-memory fallback)', () => {
    const store = browserStore();
    store.set('k', 'v');
    expect(store.get('k')).toBe('v');
  });
});
