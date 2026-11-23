import { describe, expect, it } from 'vitest';
import { createGoal } from '../src/core/goals/rules';
import type { Completion } from '../src/core/goals/types';
import { pushSupport, type PushEnvironment } from '../src/online/pushSupport';
import {
  minutesOfDay,
  parseReminderTime,
  reminderCandidates,
  REMINDER_GRACE_MINUTES,
  stillToDo,
} from '../src/online/reminders';
import { at, goalInput } from './helpers';

const TZ = 'America/Sao_Paulo';
const DAY = '2026-11-18'; // a Wednesday
const goal = (over = {}, id = 'g1') => createGoal(goalInput({ reminderTime: '08:00', ...over }), at('2026-11-01'), TZ, id);

describe('reminder time', () => {
  it('parses HH:mm and rejects anything else', () => {
    expect(parseReminderTime('07:30')).toBe(450);
    expect(parseReminderTime('00:00')).toBe(0);
    expect(parseReminderTime('23:59')).toBe(1439);
    expect(parseReminderTime('24:00')).toBeNull();
    expect(parseReminderTime('7:30')).toBeNull();
    expect(parseReminderTime(undefined)).toBeNull();
  });

  it('reads the local time of day in the couple time zone', () => {
    expect(minutesOfDay(new Date('2026-11-18T11:00:00Z'), TZ)).toBe(8 * 60); // UTC-3
    expect(minutesOfDay(new Date('2026-11-18T02:59:00Z'), TZ)).toBe(23 * 60 + 59);
    expect(minutesOfDay(new Date('2026-11-18T11:00:00Z'), 'Asia/Tokyo')).toBe(20 * 60);
  });
});

describe('reminder candidates', () => {
  it('fire once their time has come, not before', () => {
    expect(reminderCandidates([goal()], DAY, 7 * 60 + 59)).toEqual([]);
    expect(reminderCandidates([goal()], DAY, 8 * 60).map((c) => c.key)).toEqual([`g1_${DAY}`]);
    expect(reminderCandidates([goal()], DAY, 8 * 60 + 40)).toHaveLength(1);
  });

  it('are dropped when the job is far too late', () => {
    expect(reminderCandidates([goal()], DAY, 8 * 60 + REMINDER_GRACE_MINUTES)).toHaveLength(1);
    expect(reminderCandidates([goal()], DAY, 8 * 60 + REMINDER_GRACE_MINUTES + 1)).toEqual([]);
  });

  it('skip goals without a reminder, paused ones and days they are not scheduled', () => {
    expect(reminderCandidates([goal({ reminderTime: undefined })], DAY, 12 * 60)).toEqual([]);
    expect(reminderCandidates([goal({ recurrence: { type: 'weekdays', weekdays: [1] } })], DAY, 9 * 60)).toEqual([]); // Monday only
    expect(reminderCandidates([goal({ recurrence: { type: 'weekdays', weekdays: [3] } })], DAY, 9 * 60)).toHaveLength(1);
  });

  it('skip a goal that has not started yet', () => {
    const later = createGoal(goalInput({ reminderTime: '08:00' }), at('2026-11-19'), TZ, 'new'); // starts tomorrow
    expect(reminderCandidates([later], DAY, 9 * 60)).toEqual([]);
  });
});

describe('still to do', () => {
  const done = (goalId: string, dayKey: string): Completion => ({
    id: `${goalId}_${dayKey}_1`, goalId, dayKey, weekKey: '2026-11-16', difficulty: 'easy', basePoints: 1,
    awardedPoints: 1, bonusPct: 0, coins: 2, energy: 1, altitude: 5, completedAt: '',
  });

  it('drops goals already completed today', () => {
    const candidates = reminderCandidates([goal({}, 'a'), goal({}, 'b')], DAY, 9 * 60);
    expect(stillToDo(candidates, [done('a', DAY)], DAY).map((c) => c.goal.id)).toEqual(['b']);
  });

  it('a completion on another day does not count for a daily goal', () => {
    const candidates = reminderCandidates([goal()], DAY, 9 * 60);
    expect(stillToDo(candidates, [done('g1', '2026-11-17')], DAY)).toHaveLength(1);
  });

  it('drops a times-per-week goal whose quota is already met', () => {
    const weekly = goal({ recurrence: { type: 'timesPerWeek', times: 2 } });
    const candidates = reminderCandidates([weekly], DAY, 9 * 60);
    expect(stillToDo(candidates, [done('g1', '2026-11-16')], DAY)).toHaveLength(1);
    expect(stillToDo(candidates, [done('g1', '2026-11-16'), done('g1', '2026-11-17')], DAY)).toEqual([]);
  });
});

describe('push support', () => {
  const env = (over: Partial<PushEnvironment> = {}): PushEnvironment => ({
    hasServiceWorker: true, hasPushManager: true, hasNotification: true, isIos: false, standalone: false, ...over,
  });

  it('is ok when the browser has everything', () => {
    expect(pushSupport(env())).toBe('ok');
    expect(pushSupport(env({ isIos: true, standalone: true }))).toBe('ok');
  });

  it('tells iOS users to install the app first (no PushManager in a Safari tab)', () => {
    expect(pushSupport(env({ isIos: true, hasPushManager: false }))).toBe('needs-install');
  });

  it('is unsupported elsewhere when an API is missing, and on iOS even installed', () => {
    expect(pushSupport(env({ hasPushManager: false }))).toBe('unsupported');
    expect(pushSupport(env({ hasNotification: false }))).toBe('unsupported');
    expect(pushSupport(env({ isIos: true, standalone: true, hasPushManager: false }))).toBe('unsupported');
  });
});
