import type { DayKey } from '../time/calendar';

export type Difficulty = 'easy' | 'medium' | 'hard';

/**
 * How often a goal repeats. Weekdays are 1 (Monday) to 7 (Sunday).
 * - daily: every day
 * - weekdays: only on the listed weekdays
 * - timesPerWeek: `times` completions per week, on any day
 * - once: a single completion, optionally on a given date
 */
export type Recurrence =
  | { type: 'daily' }
  | { type: 'weekdays'; weekdays: number[] }
  | { type: 'timesPerWeek'; times: number }
  | { type: 'once'; date?: DayKey };

export type GoalStatus = 'active' | 'paused' | 'archived';

/** The editable part of a goal. */
export interface GoalFields {
  title: string;
  difficulty: Difficulty;
  recurrence: Recurrence;
  /** `HH:mm`, optional. Notifications arrive in stage 6. */
  reminderTime?: string;
  status: GoalStatus;
}

export interface Goal extends GoalFields {
  id: string;
  /** First day this goal counts (new goals start the day after they are created). */
  effectiveFrom: DayKey;
  createdAt: string;
  updatedAt: string;
  /** An edit, pause or archive waiting for its day: edits apply from the next day. */
  pending?: { from: DayKey; patch: Partial<GoalFields> };
}

/** What the player types when creating a goal. */
export type GoalInput = Omit<GoalFields, 'status'>;

export interface Completion {
  id: string;
  goalId: string;
  dayKey: DayKey;
  /** Monday of that week. */
  weekKey: DayKey;
  difficulty: Difficulty;
  basePoints: number;
  /** Ranking points after the streak bonus and the daily cap. */
  awardedPoints: number;
  bonusPct: number;
  coins: number;
  energy: number;
  /** Meters climbed. */
  altitude: number;
  completedAt: string;
  /** Synced after the grace window: personal coins and energy only (0 points, 0 altitude). */
  late?: boolean;
}
