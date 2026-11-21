import { weekTarget } from './goals/agenda';
import type { Completion, Goal } from './goals/types';
import type { DayKey } from './time/calendar';

export interface GoalWeekLine {
  goalId: string;
  title: string;
  done: number;
  target: number;
}

export interface WeekSummary {
  weekKey: DayKey;
  points: number;
  completions: number;
  coins: number;
  altitude: number;
  /** Days of the week with at least one completion. */
  activeDays: number;
  goals: GoalWeekLine[];
}

/** Resumo da semana: what happened in the week that starts on `weekKey` (Monday). */
export function summarizeWeek(goals: readonly Goal[], completions: readonly Completion[], weekKey: DayKey): WeekSummary {
  const mine = completions.filter((c) => c.weekKey === weekKey);
  const lines: GoalWeekLine[] = [];
  for (const goal of goals) {
    const target = weekTarget(goal, weekKey);
    const done = mine.filter((c) => c.goalId === goal.id).length;
    if (target === 0 && done === 0) continue;
    lines.push({ goalId: goal.id, title: goal.title, done, target });
  }

  return {
    weekKey,
    points: mine.reduce((sum, c) => sum + c.awardedPoints, 0),
    completions: mine.length,
    coins: mine.reduce((sum, c) => sum + c.coins, 0),
    altitude: mine.reduce((sum, c) => sum + c.altitude, 0),
    activeDays: new Set(mine.map((c) => c.dayKey)).size,
    goals: lines,
  };
}
