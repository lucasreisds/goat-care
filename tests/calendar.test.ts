import { describe, expect, it } from 'vitest';
import {
  addDays,
  dayKeyOf,
  daysBetween,
  daysOfWeek,
  isValidDayKey,
  previousWeekKey,
  weekdayOf,
  weekKeyOf,
} from '../src/core/time/calendar';

describe('dayKeyOf', () => {
  it('turns the day at midnight in the couple time zone (Sao Paulo, UTC-3)', () => {
    expect(dayKeyOf(new Date('2026-11-20T02:59:00Z'))).toBe('2026-11-19');
    expect(dayKeyOf(new Date('2026-11-20T03:00:00Z'))).toBe('2026-11-20');
  });

  it('honors another time zone', () => {
    expect(dayKeyOf(new Date('2026-11-20T16:00:00Z'), 'Asia/Tokyo')).toBe('2026-11-21');
    expect(dayKeyOf(new Date('2026-11-20T16:00:00Z'), 'America/Sao_Paulo')).toBe('2026-11-20');
  });
});

describe('week math (week starts on Monday)', () => {
  it('numbers weekdays 1 (Mon) to 7 (Sun)', () => {
    expect(weekdayOf('2026-11-16')).toBe(1);
    expect(weekdayOf('2026-11-20')).toBe(5);
    expect(weekdayOf('2026-11-22')).toBe(7);
  });

  it('finds the Monday of a week', () => {
    expect(weekKeyOf('2026-11-16')).toBe('2026-11-16');
    expect(weekKeyOf('2026-11-22')).toBe('2026-11-16');
    expect(weekKeyOf('2026-11-23')).toBe('2026-11-23');
  });

  it('lists the 7 days and the previous week', () => {
    const days = daysOfWeek('2026-11-16');
    expect(days).toHaveLength(7);
    expect(days[0]).toBe('2026-11-16');
    expect(days[6]).toBe('2026-11-22');
    expect(previousWeekKey('2026-11-16')).toBe('2026-11-09');
  });
});

describe('addDays / daysBetween / isValidDayKey', () => {
  it('crosses month, year and leap day', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('counts days between', () => {
    expect(daysBetween('2026-11-16', '2026-11-20')).toBe(4);
    expect(daysBetween('2026-11-20', '2026-11-16')).toBe(-4);
  });

  it('validates day keys', () => {
    expect(isValidDayKey('2026-11-20')).toBe(true);
    expect(isValidDayKey('2026-02-30')).toBe(false);
    expect(isValidDayKey('20-11-2026')).toBe(false);
    expect(isValidDayKey('')).toBe(false);
  });
});
