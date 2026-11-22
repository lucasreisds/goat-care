import { daysOfWeek, weekdayOf, weekKeyOf, type DayKey } from '../time/calendar';
import { isActiveOn, resolveGoal } from './rules';
import type { Completion, Goal, GoalFields } from './types';

/** Is the goal on the schedule that day? (Completion state is handled separately.) */
export function isScheduledOn(fields: GoalFields, day: DayKey): boolean {
  const r = fields.recurrence;
  switch (r.type) {
    case 'daily':
      return true;
    case 'weekdays':
      return r.weekdays.includes(weekdayOf(day));
    case 'timesPerWeek':
      return true; // any day, until the weekly quota is met
    case 'once':
      return r.date === undefined || r.date === day;
  }
}

export type AgendaState = 'todo' | 'done';

export interface AgendaItem {
  goal: Goal;
  fields: GoalFields;
  state: AgendaState;
  /** For times-per-week goals: completions so far this week and the weekly target. */
  weekProgress?: { done: number; target: number };
}

const forGoal = (completions: readonly Completion[], goalId: string): Completion[] =>
  completions.filter((c) => c.goalId === goalId);

/** Goals shown for a day: scheduled and not yet done (todo), or completed that day (done). */
export function agendaFor(goals: readonly Goal[], completions: readonly Completion[], day: DayKey): AgendaItem[] {
  const week = weekKeyOf(day);
  const items: AgendaItem[] = [];

  for (const goal of goals) {
    if (!isActiveOn(goal, day)) continue;
    const fields = resolveGoal(goal, day);
    const mine = forGoal(completions, goal.id);
    const doneToday = mine.some((c) => c.dayKey === day);
    const r = fields.recurrence;

    if (r.type === 'once') {
      const everDone = mine.length > 0;
      if (doneToday) items.push({ goal, fields, state: 'done' });
      else if (!everDone && isScheduledOn(fields, day)) items.push({ goal, fields, state: 'todo' });
      continue;
    }

    if (r.type === 'timesPerWeek') {
      const done = mine.filter((c) => c.weekKey === week).length;
      const weekProgress = { done, target: r.times };
      if (doneToday) items.push({ goal, fields, state: 'done', weekProgress });
      else if (done < r.times) items.push({ goal, fields, state: 'todo', weekProgress });
      continue;
    }

    if (!isScheduledOn(fields, day)) continue;
    items.push({ goal, fields, state: doneToday ? 'done' : 'todo' });
  }
  return items;
}

/** Days of a week on which the goal is active and on the schedule. */
export function scheduledDaysInWeek(goal: Goal, weekKey: DayKey): DayKey[] {
  return daysOfWeek(weekKey).filter((d) => isActiveOn(goal, d) && isScheduledOn(resolveGoal(goal, d), d));
}

/** Completions the goal asks for in a week (0 when it was not active that week). */
export function weekTarget(goal: Goal, weekKey: DayKey): number {
  const scheduled = scheduledDaysInWeek(goal, weekKey);
  if (scheduled.length === 0) return 0;
  const r = resolveGoal(goal, daysOfWeek(weekKey)[6]!).recurrence;
  if (r.type === 'timesPerWeek') return r.times;
  if (r.type === 'once') return 1;
  return scheduled.length;
}
