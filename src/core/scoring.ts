import type { Difficulty } from './goals/types';

/** Ranking points per difficulty. */
export const POINTS: Readonly<Record<Difficulty, number>> = { easy: 1, medium: 3, hard: 5 };

/** Default daily point cap per person. Changes only when BOTH partners confirm (stage 5). */
export const DEFAULT_DAILY_CAP = 15;

/** Consistency bonus: +10% for every 3 days in a row, up to +30%. */
export const STREAK_STEP_DAYS = 3;
export const STREAK_BONUS_PER_STEP = 0.1;
export const STREAK_BONUS_MAX = 0.3;

/** Bonus fraction (0..0.3) for a streak of consecutive days. */
export function streakBonus(streakDays: number): number {
  const steps = Math.floor(Math.max(0, streakDays) / STREAK_STEP_DAYS);
  return Math.min(STREAK_BONUS_MAX, steps * STREAK_BONUS_PER_STEP);
}

export interface Award {
  base: number;
  /** Bonus as a whole percent (0, 10, 20 or 30). */
  bonusPct: number;
  /** Points actually granted: base plus bonus, cut down to what is left of the daily cap. */
  awarded: number;
  /** True when the cap trimmed the award. */
  capped: boolean;
}

/** Points for one completion. The completion always counts; only the points are limited by the cap. */
export function awardPoints(args: { difficulty: Difficulty; pointsToday: number; cap: number; streakDays: number }): Award {
  const base = POINTS[args.difficulty];
  const bonus = streakBonus(args.streakDays);
  const raw = Math.round(base * (1 + bonus));
  const remaining = Math.max(0, args.cap - args.pointsToday);
  const awarded = Math.min(raw, remaining);
  return { base, bonusPct: Math.round(bonus * 100), awarded, capped: awarded < raw };
}
