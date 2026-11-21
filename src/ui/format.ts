import type { Recurrence } from '../core/goals/types';
import type { DayKey } from '../core/time/calendar';
import { strings } from '../i18n';

const { goal: g } = strings.ui;

/** `2026-11-16` -> `16/11` */
export const formatDay = (day: DayKey): string => `${day.slice(8, 10)}/${day.slice(5, 7)}`;

/** Short, human description of how often a goal repeats. */
export function describeRecurrence(r: Recurrence): string {
  switch (r.type) {
    case 'daily':
      return g.frequencyShort.daily;
    case 'weekdays':
      return g.frequencyShort.weekdays([...r.weekdays].sort().map((d) => g.weekdayShort[d - 1]).join(', '));
    case 'timesPerWeek':
      return g.frequencyShort.timesPerWeek(r.times);
    case 'once':
      return g.frequencyShort.once(r.date ? formatDay(r.date) : undefined);
  }
}
