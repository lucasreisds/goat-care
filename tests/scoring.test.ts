import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createGoal, queueChange } from '../src/core/goals/rules';
import type { Completion, Goal } from '../src/core/goals/types';
import {
  ALTITUDE_MILESTONES,
  METERS_PER_POINT,
  REFERENCE_DAILY_METERS,
  nextMilestone,
  progressToNextMilestone,
  reachedMilestones,
  rewardFor,
} from '../src/core/progression/rewards';
import { awardPoints, DEFAULT_DAILY_CAP, POINTS, streakBonus } from '../src/core/scoring';
import { streakThrough } from '../src/core/streak';
import { summarizeWeek } from '../src/core/summary';
import { goalInput, at } from './helpers';

const TZ = 'America/Sao_Paulo';

describe('points', () => {
  it('are 1, 3 and 5 by difficulty, with a default cap of 15', () => {
    expect(POINTS).toEqual({ easy: 1, medium: 3, hard: 5 });
    expect(DEFAULT_DAILY_CAP).toBe(15);
  });

  it('streak bonus: +10% every 3 days in a row, capped at +30%', () => {
    expect([0, 2, 3, 5, 6, 9, 12, 30].map(streakBonus)).toEqual([0, 0, 0.1, 0.1, 0.2, 0.3, 0.3, 0.3]);
  });

  it('applies the bonus and rounds to whole points', () => {
    expect(awardPoints({ difficulty: 'hard', pointsToday: 0, cap: 15, streakDays: 9 }).awarded).toBe(7); // 5 * 1.3 = 6.5 -> 7
    expect(awardPoints({ difficulty: 'easy', pointsToday: 0, cap: 15, streakDays: 9 }).awarded).toBe(1); // 1.3 -> 1
    expect(awardPoints({ difficulty: 'medium', pointsToday: 0, cap: 15, streakDays: 3 })).toMatchObject({ bonusPct: 10, awarded: 3 });
  });

  it('never goes past the daily cap, but a capped completion still counts (0 points)', () => {
    expect(awardPoints({ difficulty: 'hard', pointsToday: 12, cap: 15, streakDays: 0 })).toMatchObject({ awarded: 3, capped: true });
    expect(awardPoints({ difficulty: 'hard', pointsToday: 15, cap: 15, streakDays: 0 })).toMatchObject({ awarded: 0, capped: true });
    expect(awardPoints({ difficulty: 'easy', pointsToday: 14, cap: 15, streakDays: 0 })).toMatchObject({ awarded: 1, capped: false });
  });
});

describe('rewards and altitude', () => {
  it('altitude follows awarded points; coins and energy follow the goal value', () => {
    expect(rewardFor({ basePoints: 3, awardedPoints: 3 })).toEqual({ coins: 6, energy: 3, altitude: 3 * METERS_PER_POINT });
    expect(rewardFor({ basePoints: 5, awardedPoints: 0 })).toEqual({ coins: 10, energy: 5, altitude: 0 });
  });

  it('milestones are days x 50 m for a 10-points-a-day player', () => {
    expect(REFERENCE_DAILY_METERS).toBe(50);
    expect(ALTITUDE_MILESTONES).toEqual([150, 350, 700, 1500, 2250, 3000, 4500, 6000, 8250]);
  });

  it('evolution thresholds of the goat pack are milestones', () => {
    const manifest = JSON.parse(readFileSync('public/characters/mountain-goat/manifest.json', 'utf-8')) as {
      stages: Array<{ minAltitude: number }>;
    };
    for (const stage of manifest.stages.slice(1)) expect(ALTITUDE_MILESTONES).toContain(stage.minAltitude);
  });

  it('finds reached and next milestones and the progress between them', () => {
    expect(reachedMilestones(0)).toEqual([]);
    expect(reachedMilestones(700)).toEqual([150, 350, 700]);
    expect(nextMilestone(0)).toBe(150);
    expect(nextMilestone(700)).toBe(1500);
    expect(nextMilestone(9000)).toBeNull();
    expect(progressToNextMilestone(75)).toBeCloseTo(0.5);
    expect(progressToNextMilestone(9000)).toBe(1);
  });
});

describe('streak', () => {
  const done = (goalId: string, dayKey: string): Completion => ({
    id: `${goalId}_${dayKey}_1`, goalId, dayKey, weekKey: '', difficulty: 'easy', basePoints: 1, awardedPoints: 1,
    bonusPct: 0, coins: 0, energy: 0, altitude: 0, completedAt: '',
  });
  const daily = (id = 'g1'): Goal => createGoal(goalInput(), at('2026-11-01'), TZ, id);

  it('counts consecutive days with a completion', () => {
    const cs = [done('g1', '2026-11-16'), done('g1', '2026-11-17'), done('g1', '2026-11-18')];
    expect(streakThrough('2026-11-18', [daily()], cs)).toBe(3);
  });

  it('a missed day breaks it', () => {
    const cs = [done('g1', '2026-11-16'), done('g1', '2026-11-18')];
    expect(streakThrough('2026-11-18', [daily()], cs)).toBe(1);
  });

  it('paused days are neutral: they do not break the streak nor count', () => {
    let goal = daily();
    goal = queueChange(goal, { status: 'paused' }, at('2026-11-16'), TZ); // paused from the 17th
    const resumed = queueChange(goal, { status: 'active' }, at('2026-11-18'), TZ); // active again from the 19th
    const cs = [done('g1', '2026-11-16'), done('g1', '2026-11-19'), done('g1', '2026-11-20')];
    // 17th and 18th are paused (neutral), 16th is met: streak 3 on the 20th
    expect(streakThrough('2026-11-20', [resumed], cs)).toBe(3);
  });

  it('weekly-quota and undated one-off goals never miss a day', () => {
    const weekly = createGoal(goalInput({ recurrence: { type: 'timesPerWeek', times: 3 } }), at('2026-11-01'), TZ, 'w');
    const cs = [done('w', '2026-11-16'), done('w', '2026-11-18')];
    expect(streakThrough('2026-11-18', [weekly], cs)).toBe(2); // the 17th had no obligation
  });

  it('is 0 with no goals', () => {
    expect(streakThrough('2026-11-18', [], [])).toBe(0);
  });
});

describe('weekly summary', () => {
  const done = (goalId: string, dayKey: string, awarded: number): Completion => ({
    id: `${goalId}_${dayKey}_1`, goalId, dayKey, weekKey: '2026-11-16', difficulty: 'easy', basePoints: 1,
    awardedPoints: awarded, bonusPct: 0, coins: 2, energy: 1, altitude: awarded * 5, completedAt: '',
  });

  it('totals the week and lists each goal against its target', () => {
    const daily = createGoal(goalInput({ title: 'Água' }), at('2026-11-01'), TZ, 'd');
    const weekly = createGoal(goalInput({ title: 'Treinar', recurrence: { type: 'timesPerWeek', times: 3 } }), at('2026-11-01'), TZ, 'w');
    const cs = [done('d', '2026-11-16', 1), done('d', '2026-11-17', 1), done('w', '2026-11-17', 3)];
    const s = summarizeWeek([daily, weekly], cs, '2026-11-16');

    expect(s).toMatchObject({ points: 5, completions: 3, coins: 6, altitude: 25, activeDays: 2 });
    expect(s.goals).toEqual([
      { goalId: 'd', title: 'Água', done: 2, target: 7 },
      { goalId: 'w', title: 'Treinar', done: 1, target: 3 },
    ]);
  });

  it('skips goals that were not active that week', () => {
    const later = createGoal(goalInput(), at('2026-11-20'), TZ, 'later'); // starts the 21st
    expect(summarizeWeek([later], [], '2026-11-09').goals).toEqual([]);
    expect(summarizeWeek([later], [], '2026-11-16').goals).toHaveLength(1);
  });
});
