import { describe, expect, it } from 'vitest';
import { agendaFor } from '../src/core/goals/agenda';
import {
  MAX_ACTIVE_GOALS,
  MAX_TITLE_LENGTH,
  countActiveGoals,
  createGoal,
  isActiveOn,
  latestFields,
  queueChange,
  resolveGoal,
  settleGoal,
  validateGoalInput,
} from '../src/core/goals/rules';
import type { Completion } from '../src/core/goals/types';
import { goalInput, at } from './helpers';

const TZ = 'America/Sao_Paulo';

describe('validateGoalInput', () => {
  it('accepts a normal goal', () => {
    expect(validateGoalInput(goalInput())).toEqual([]);
  });

  it('rejects empty and too long titles', () => {
    expect(validateGoalInput(goalInput({ title: '   ' }))).toContain('title-empty');
    expect(validateGoalInput(goalInput({ title: 'x'.repeat(MAX_TITLE_LENGTH + 1) }))).toContain('title-too-long');
  });

  it('checks the recurrence', () => {
    expect(validateGoalInput(goalInput({ recurrence: { type: 'weekdays', weekdays: [] } }))).toContain('weekdays-empty');
    expect(validateGoalInput(goalInput({ recurrence: { type: 'weekdays', weekdays: [0, 8] } }))).toContain('weekdays-invalid');
    expect(validateGoalInput(goalInput({ recurrence: { type: 'weekdays', weekdays: [1, 1] } }))).toContain('weekdays-invalid');
    expect(validateGoalInput(goalInput({ recurrence: { type: 'timesPerWeek', times: 0 } }))).toContain('times-invalid');
    expect(validateGoalInput(goalInput({ recurrence: { type: 'timesPerWeek', times: 8 } }))).toContain('times-invalid');
    expect(validateGoalInput(goalInput({ recurrence: { type: 'once', date: '2026-02-30' } }))).toContain('date-invalid');
    expect(validateGoalInput(goalInput({ recurrence: { type: 'once' } }))).toEqual([]);
  });

  it('checks the optional reminder', () => {
    expect(validateGoalInput(goalInput({ reminderTime: '07:30' }))).toEqual([]);
    expect(validateGoalInput(goalInput({ reminderTime: '25:00' }))).toContain('reminder-invalid');
  });
});

describe('when changes take effect (from the next day)', () => {
  const created = at('2026-11-16'); // Monday

  it('a new goal starts the day after it is created', () => {
    const goal = createGoal(goalInput(), created, TZ, 'g1');
    expect(goal.effectiveFrom).toBe('2026-11-17');
    expect(isActiveOn(goal, '2026-11-16')).toBe(false);
    expect(isActiveOn(goal, '2026-11-17')).toBe(true);
  });

  it('an edit applies tomorrow, today keeps the old values', () => {
    const goal = createGoal(goalInput({ difficulty: 'easy' }), at('2026-11-10'), TZ, 'g1');
    const edited = queueChange(goal, { difficulty: 'hard', title: '  Correr  ' }, created, TZ);

    expect(resolveGoal(edited, '2026-11-16').difficulty).toBe('easy');
    expect(resolveGoal(edited, '2026-11-17').difficulty).toBe('hard');
    expect(resolveGoal(edited, '2026-11-17').title).toBe('Correr');
    expect(latestFields(edited).difficulty).toBe('hard');
  });

  it('a pause applies tomorrow: still active today', () => {
    const goal = createGoal(goalInput(), at('2026-11-10'), TZ, 'g1');
    const paused = queueChange(goal, { status: 'paused' }, created, TZ);
    expect(isActiveOn(paused, '2026-11-16')).toBe(true);
    expect(isActiveOn(paused, '2026-11-17')).toBe(false);
  });

  it('several edits on the same day merge into one pending change', () => {
    const goal = createGoal(goalInput(), at('2026-11-10'), TZ, 'g1');
    const a = queueChange(goal, { difficulty: 'hard' }, created, TZ);
    const b = queueChange(a, { title: 'Novo' }, at('2026-11-16', '18:00'), TZ);
    expect(b.pending?.from).toBe('2026-11-17');
    expect(latestFields(b)).toMatchObject({ difficulty: 'hard', title: 'Novo' });
  });

  it('settling applies pending changes once their day has come', () => {
    const goal = createGoal(goalInput(), at('2026-11-10'), TZ, 'g1');
    const edited = queueChange(goal, { difficulty: 'hard' }, created, TZ);
    expect(settleGoal(edited, '2026-11-16')).toBe(edited);
    const settled = settleGoal(edited, '2026-11-17');
    expect(settled.pending).toBeUndefined();
    expect(settled.difficulty).toBe('hard');
  });
});

describe('active goal limit', () => {
  it('counts goals that will be active, not paused or archived ones', () => {
    const goals = Array.from({ length: MAX_ACTIVE_GOALS }, (_, i) => createGoal(goalInput({ title: `m${i}` }), at('2026-11-10'), TZ, `g${i}`));
    expect(countActiveGoals(goals)).toBe(10);

    const paused = queueChange(goals[0]!, { status: 'paused' }, at('2026-11-16'), TZ);
    const archived = queueChange(goals[1]!, { status: 'archived' }, at('2026-11-16'), TZ);
    expect(countActiveGoals([paused, archived, ...goals.slice(2)])).toBe(8);
  });
});

describe('agenda', () => {
  const day = (d: string) => d;
  const done = (goalId: string, dayKey: string, weekKey: string): Completion => ({
    id: `${goalId}_${dayKey}_1`,
    goalId,
    dayKey,
    weekKey,
    difficulty: 'easy',
    basePoints: 1,
    awardedPoints: 1,
    bonusPct: 0,
    coins: 2,
    energy: 1,
    altitude: 5,
    completedAt: '',
  });
  const make = (input: ReturnType<typeof goalInput>, id = 'g1') => createGoal(input, at('2026-11-01'), TZ, id);

  it('daily goals appear every day, done once completed', () => {
    const goal = make(goalInput());
    expect(agendaFor([goal], [], day('2026-11-18')).map((i) => i.state)).toEqual(['todo']);
    expect(agendaFor([goal], [done('g1', '2026-11-18', '2026-11-16')], '2026-11-18').map((i) => i.state)).toEqual(['done']);
    expect(agendaFor([goal], [done('g1', '2026-11-18', '2026-11-16')], '2026-11-19').map((i) => i.state)).toEqual(['todo']);
  });

  it('weekday goals appear only on their days', () => {
    const goal = make(goalInput({ recurrence: { type: 'weekdays', weekdays: [1, 3] } }));
    expect(agendaFor([goal], [], '2026-11-16')).toHaveLength(1); // Monday
    expect(agendaFor([goal], [], '2026-11-17')).toHaveLength(0); // Tuesday
    expect(agendaFor([goal], [], '2026-11-18')).toHaveLength(1); // Wednesday
  });

  it('times-per-week goals show progress and disappear once the quota is met', () => {
    const goal = make(goalInput({ recurrence: { type: 'timesPerWeek', times: 2 } }));
    const week = '2026-11-16';
    expect(agendaFor([goal], [], '2026-11-16')[0]!.weekProgress).toEqual({ done: 0, target: 2 });

    const one = [done('g1', '2026-11-16', week)];
    const tue = agendaFor([goal], one, '2026-11-17');
    expect(tue[0]!.state).toBe('todo');
    expect(tue[0]!.weekProgress).toEqual({ done: 1, target: 2 });

    const two = [...one, done('g1', '2026-11-17', week)];
    expect(agendaFor([goal], two, '2026-11-18')).toHaveLength(0); // quota met
    expect(agendaFor([goal], two, '2026-11-17')[0]!.state).toBe('done'); // still shown as done that day
    expect(agendaFor([goal], two, '2026-11-23')).toHaveLength(1); // new week
  });

  it('one-off goals: dated only on their date, undated until done', () => {
    const dated = make(goalInput({ recurrence: { type: 'once', date: '2026-11-18' } }), 'dated');
    expect(agendaFor([dated], [], '2026-11-17')).toHaveLength(0);
    expect(agendaFor([dated], [], '2026-11-18')).toHaveLength(1);
    expect(agendaFor([dated], [], '2026-11-19')).toHaveLength(0);

    const undated = make(goalInput({ recurrence: { type: 'once' } }), 'undated');
    expect(agendaFor([undated], [], '2026-11-25')).toHaveLength(1);
    expect(agendaFor([undated], [done('undated', '2026-11-25', '2026-11-23')], '2026-11-26')).toHaveLength(0);
  });

  it('hides paused goals', () => {
    const goal = queueChange(make(goalInput()), { status: 'paused' }, at('2026-11-16'), TZ);
    expect(agendaFor([goal], [], '2026-11-16')).toHaveLength(1);
    expect(agendaFor([goal], [], '2026-11-17')).toHaveLength(0);
  });
});
