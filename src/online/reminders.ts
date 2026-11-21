import { agendaFor } from '../core/goals/agenda';
import { isActiveOn, resolveGoal } from '../core/goals/rules';
import type { Completion, Goal } from '../core/goals/types';
import { isScheduledOn } from '../core/goals/agenda';
import type { DayKey } from '../core/time/calendar';

/**
 * Pure rules behind the goal reminders pushed by the scheduled job (scripts/notify). The job runs every
 * few minutes, so a reminder fires on the first run after its time and then never again that day.
 */

/** A reminder is dropped if the job is this late (e.g. GitHub skipped runs), instead of buzzing hours later. */
export const REMINDER_GRACE_MINUTES = 180;

/** Minutes since local midnight in a time zone. */
export function minutesOfDay(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', hour: 'numeric', minute: 'numeric' }).formatToParts(at);
  const n = (type: string): number => Number(parts.find((p) => p.type === type)?.value);
  return n('hour') * 60 + n('minute');
}

/** "07:30" -> 450. */
export function parseReminderTime(value: string | undefined): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value ?? '');
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

export interface ReminderCandidate {
  goal: Goal;
  title: string;
  /** Marks the reminder as sent for that day (`goalId_dayKey`). */
  key: string;
}

/**
 * Goals of one person whose reminder time has come today (and not by more than the grace). Whether they
 * are already done is decided later with the completions, which the job only loads when needed.
 */
export function reminderCandidates(
  goals: readonly Goal[],
  day: DayKey,
  nowMinutes: number,
  grace = REMINDER_GRACE_MINUTES,
): ReminderCandidate[] {
  const result: ReminderCandidate[] = [];
  for (const goal of goals) {
    if (!isActiveOn(goal, day)) continue;
    const fields = resolveGoal(goal, day);
    const at = parseReminderTime(fields.reminderTime);
    if (at === null || !isScheduledOn(fields, day)) continue;
    if (nowMinutes >= at && nowMinutes - at <= grace) result.push({ goal, title: fields.title, key: `${goal.id}_${day}` });
  }
  return result;
}

/** Keeps the candidates that are still to do today (a times-per-week goal whose quota is met is dropped). */
export function stillToDo(
  candidates: readonly ReminderCandidate[],
  completions: readonly Completion[],
  day: DayKey,
): ReminderCandidate[] {
  const todo = new Set(
    agendaFor(
      candidates.map((c) => c.goal),
      completions,
      day,
    )
      .filter((item) => item.state === 'todo')
      .map((item) => item.goal.id),
  );
  return candidates.filter((c) => todo.has(c.goal.id));
}
