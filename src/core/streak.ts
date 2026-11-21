import { isScheduledOn } from './goals/agenda';
import { isActiveOn, resolveGoal } from './goals/rules';
import type { Completion, Goal } from './goals/types';
import { addDays, type DayKey } from './time/calendar';

const MAX_LOOKBACK_DAYS = 400;

type DayStatus = 'met' | 'missed' | 'neutral';

function statusOf(goals: readonly Goal[], completionDays: ReadonlySet<DayKey>, day: DayKey): DayStatus {
  if (completionDays.has(day)) return 'met';
  const hadObligation = goals.some((g) => {
    if (!isActiveOn(g, day)) return false;
    const fields = resolveGoal(g, day);
    const r = fields.recurrence;
    // weekly-quota goals and undated one-offs never "miss" a specific day
    if (r.type === 'timesPerWeek') return false;
    if (r.type === 'once' && r.date === undefined) return false;
    return isScheduledOn(fields, day);
  });
  return hadObligation ? 'missed' : 'neutral';
}

/**
 * Consecutive days (ending at `lastDay`) with at least one completion.
 * Days with nothing scheduled (everything paused, or only weekly-quota goals) are neutral:
 * they neither break the streak nor count toward it.
 */
export function streakThrough(lastDay: DayKey, goals: readonly Goal[], completions: readonly Completion[]): number {
  const completionDays = new Set(completions.map((c) => c.dayKey));
  const firstDay = goals.reduce<DayKey | null>((min, g) => (min === null || g.effectiveFrom < min ? g.effectiveFrom : min), null);
  if (firstDay === null) return 0;

  let streak = 0;
  let day = lastDay;
  for (let i = 0; i < MAX_LOOKBACK_DAYS && day >= firstDay; i++) {
    const status = statusOf(goals, completionDays, day);
    if (status === 'missed') break;
    if (status === 'met') streak++;
    day = addDays(day, -1);
  }
  return streak;
}
