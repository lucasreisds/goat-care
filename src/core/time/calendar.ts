/**
 * Day and week math for the pair. The day and the week turn at midnight in the couple's time zone
 * (default America/Sao_Paulo) and the week starts on Monday.
 * Days are plain `yyyy-MM-dd` strings; a week is identified by the day of its Monday.
 */
export const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

/** `yyyy-MM-dd` */
export type DayKey = string;

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidDayKey(value: string): boolean {
  const m = DAY_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

function parse(day: DayKey): number {
  const m = DAY_RE.exec(day);
  if (!m) throw new Error(`Invalid day key "${day}"`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

const formatters = new Map<string, Intl.DateTimeFormat>();

/** The calendar day an instant falls on in the given time zone. */
export function dayKeyOf(date: Date, timeZone: string = DEFAULT_TIMEZONE): DayKey {
  let fmt = formatters.get(timeZone);
  if (!fmt) {
    // en-CA formats as yyyy-MM-dd
    fmt = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
    formatters.set(timeZone, fmt);
  }
  return fmt.format(date);
}

export function addDays(day: DayKey, amount: number): DayKey {
  return new Date(parse(day) + amount * 86_400_000).toISOString().slice(0, 10);
}

/** 1 = Monday ... 7 = Sunday */
export function weekdayOf(day: DayKey): number {
  const sunday0 = new Date(parse(day)).getUTCDay();
  return ((sunday0 + 6) % 7) + 1;
}

/** The Monday of the week a day belongs to. */
export function weekKeyOf(day: DayKey): DayKey {
  return addDays(day, -(weekdayOf(day) - 1));
}

/** The 7 days (Monday..Sunday) of a week. */
export function daysOfWeek(weekKey: DayKey): DayKey[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekKey, i));
}

export const previousWeekKey = (weekKey: DayKey): DayKey => addDays(weekKey, -7);

/** Whole days from `a` to `b` (positive when b is later). */
export function daysBetween(a: DayKey, b: DayKey): number {
  return Math.round((parse(b) - parse(a)) / 86_400_000);
}
