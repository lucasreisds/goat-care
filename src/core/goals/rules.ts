import { addDays, dayKeyOf, isValidDayKey, type DayKey } from '../time/calendar';
import type { Goal, GoalFields, GoalInput, GoalStatus } from './types';

export const MAX_ACTIVE_GOALS = 10;
export const MAX_TITLE_LENGTH = 60;

export type GoalIssue =
  | 'title-empty'
  | 'title-too-long'
  | 'weekdays-empty'
  | 'weekdays-invalid'
  | 'times-invalid'
  | 'date-invalid'
  | 'reminder-invalid';

/** Machine-readable problems with a goal; the UI turns them into pt-BR messages. */
export function validateGoalInput(input: GoalInput): GoalIssue[] {
  const issues: GoalIssue[] = [];
  const title = input.title.trim();
  if (title.length === 0) issues.push('title-empty');
  if (title.length > MAX_TITLE_LENGTH) issues.push('title-too-long');

  const r = input.recurrence;
  if (r.type === 'weekdays') {
    if (r.weekdays.length === 0) issues.push('weekdays-empty');
    else if (r.weekdays.some((d) => !Number.isInteger(d) || d < 1 || d > 7) || new Set(r.weekdays).size !== r.weekdays.length) {
      issues.push('weekdays-invalid');
    }
  }
  if (r.type === 'timesPerWeek' && (!Number.isInteger(r.times) || r.times < 1 || r.times > 7)) issues.push('times-invalid');
  if (r.type === 'once' && r.date !== undefined && !isValidDayKey(r.date)) issues.push('date-invalid');
  if (input.reminderTime !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.reminderTime)) issues.push('reminder-invalid');
  return issues;
}

/** Fields as they will be once every pending change has applied. */
export function latestFields(goal: Goal): GoalFields {
  return { ...fieldsOf(goal), ...goal.pending?.patch };
}

function fieldsOf(goal: Goal): GoalFields {
  const fields: GoalFields = {
    title: goal.title,
    difficulty: goal.difficulty,
    recurrence: goal.recurrence,
    status: goal.status,
  };
  if (goal.reminderTime !== undefined) fields.reminderTime = goal.reminderTime;
  return fields;
}

/** The goal's fields as they apply on a given day (pending changes take effect on their day). */
export function resolveGoal(goal: Goal, day: DayKey): GoalFields {
  if (goal.pending && day >= goal.pending.from) return latestFields(goal);
  return fieldsOf(goal);
}

/** True when the goal counts on that day: already started and active (not paused/archived). */
export function isActiveOn(goal: Goal, day: DayKey): boolean {
  return day >= goal.effectiveFrom && resolveGoal(goal, day).status === 'active';
}

/** Applies pending changes whose day has come, so stored goals stay tidy. */
export function settleGoal(goal: Goal, today: DayKey): Goal {
  if (!goal.pending || today < goal.pending.from) return goal;
  const { pending, ...rest } = goal;
  return { ...rest, ...pending.patch };
}

export const settleGoals = (goals: Goal[], today: DayKey): Goal[] => goals.map((g) => settleGoal(g, today));

/** Goals that count toward the limit: active once all pending changes apply (including ones not started yet). */
export function countActiveGoals(goals: readonly Goal[]): number {
  return goals.filter((g) => latestFields(g).status === 'active').length;
}

export const canAddActiveGoal = (goals: readonly Goal[]): boolean => countActiveGoals(goals) < MAX_ACTIVE_GOALS;

export function createGoal(input: GoalInput, now: Date, timeZone: string, id: string): Goal {
  const today = dayKeyOf(now, timeZone);
  const goal: Goal = {
    id,
    title: input.title.trim(),
    difficulty: input.difficulty,
    recurrence: input.recurrence,
    status: 'active',
    // new goals start the day after they are created
    effectiveFrom: addDays(today, 1),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
  if (input.reminderTime !== undefined) goal.reminderTime = input.reminderTime;
  return goal;
}

/** Queues an edit (or pause/resume/archive) to apply from tomorrow. */
export function queueChange(goal: Goal, patch: Partial<GoalFields>, now: Date, timeZone: string): Goal {
  const today = dayKeyOf(now, timeZone);
  const settled = settleGoal(goal, today);
  const from = addDays(today, 1);
  const cleaned: Partial<GoalFields> = { ...patch };
  if (typeof cleaned.title === 'string') cleaned.title = cleaned.title.trim();
  return {
    ...settled,
    updatedAt: now.toISOString(),
    pending: { from, patch: { ...settled.pending?.patch, ...cleaned } },
  };
}

export const statusPatch = (status: GoalStatus): Partial<GoalFields> => ({ status });
