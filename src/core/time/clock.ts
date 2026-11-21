/** Wraps any hour value into [0, 24). */
export function wrapHour(hour: number): number {
  return ((hour % 24) + 24) % 24;
}

/** Device-local time as a fractional hour (e.g. 18:30 -> 18.5). */
export function localHour(date: Date = new Date()): number {
  return date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
}

/**
 * Where the scene reads "what time is it" from. Real device time by default;
 * the debug panel or `?hour=` can pin it for testing.
 */
export class HourSource {
  private override: number | null;

  constructor(initial: number | null = null) {
    this.override = initial;
  }

  set(hour: number | null): void {
    this.override = hour === null ? null : wrapHour(hour);
  }

  get isOverridden(): boolean {
    return this.override !== null;
  }

  get(): number {
    return this.override ?? localHour();
  }
}

/** Reads `?hour=21.5` from a query string. Returns null if absent or invalid. */
export function parseHourParam(search: string): number | null {
  const raw = new URLSearchParams(search).get('hour');
  if (raw === null || raw.trim() === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? wrapHour(value) : null;
}
