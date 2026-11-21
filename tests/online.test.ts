import { describe, expect, it } from 'vitest';
import type { Completion } from '../src/core/goals/types';
import { initialState, totalsOf } from '../src/core/state';
import {
  acceptedCap,
  asLate,
  completionDocId,
  dayStartMs,
  effectiveCap,
  generateInviteCode,
  INVITE_ALPHABET,
  INVITE_LENGTH,
  isSyncWindowOpen,
  isValidCap,
  newCouple,
  normalizeInviteCode,
  recalculate,
  utcOffsetMinutesOf,
  weekWinner,
} from '../src/online/model';
import { createRng } from '../src/core/random';

const completion = (over: Partial<Completion> = {}): Completion => ({
  id: 'g1_2026-11-21_1',
  goalId: 'g1',
  dayKey: '2026-11-21',
  weekKey: '2026-11-16',
  difficulty: 'hard',
  basePoints: 5,
  awardedPoints: 5,
  bonusPct: 0,
  coins: 10,
  energy: 5,
  altitude: 25,
  completedAt: '2026-11-21T15:00:00.000Z',
  ...over,
});

describe('invite codes', () => {
  it('have 6 characters from an alphabet without I, O, 0 and 1', () => {
    const rng = createRng(42);
    for (let i = 0; i < 200; i++) {
      const code = generateInviteCode(rng);
      expect(code).toHaveLength(INVITE_LENGTH);
      expect([...code].every((ch) => INVITE_ALPHABET.includes(ch))).toBe(true);
    }
    expect(INVITE_ALPHABET).not.toMatch(/[IO01]/);
  });

  it('are cleaned up from what the player typed', () => {
    expect(normalizeInviteCode(' abc-234 ')).toBe('ABC234');
    expect(normalizeInviteCode('ABC23')).toBeNull();
    expect(normalizeInviteCode('ABC10O')).toBeNull();
  });
});

describe('time zone offset and sync window', () => {
  it('reads the fixed offset of the couple time zone', () => {
    const at = new Date('2026-11-21T12:00:00Z');
    expect(utcOffsetMinutesOf('America/Sao_Paulo', at)).toBe(-180);
    expect(utcOffsetMinutesOf('America/Manaus', at)).toBe(-240);
    expect(newCouple('u1', 'America/Sao_Paulo', at)).toMatchObject({ members: ['u1'], utcOffsetMinutes: -180, dailyCap: 15, capNext: null, capProposal: null });
  });

  it('starts a day at local midnight', () => {
    expect(new Date(dayStartMs('2026-11-21', -180)).toISOString()).toBe('2026-11-21T03:00:00.000Z');
  });

  it('keeps a day open for 48 hours after it ends', () => {
    const open = (iso: string): boolean => isSyncWindowOpen('2026-11-21', -180, Date.parse(iso));
    expect(open('2026-11-21T20:00:00-03:00')).toBe(true);
    expect(open('2026-11-23T23:59:00-03:00')).toBe(true);
    expect(open('2026-11-24T00:00:00-03:00')).toBe(false);
  });
});

describe('daily cap agreed by the pair', () => {
  const base = { dailyCap: 15, capNext: null, capProposal: null };

  it('applies a change only from its first day', () => {
    const couple = { ...base, capNext: { value: 20, from: '2026-11-22' } };
    expect(effectiveCap(couple, '2026-11-21')).toBe(15);
    expect(effectiveCap(couple, '2026-11-22')).toBe(20);
    expect(effectiveCap(couple, '2026-12-01')).toBe(20);
  });

  it('starts an accepted proposal tomorrow', () => {
    expect(acceptedCap(base, '2026-11-21')).toBeNull();
    expect(acceptedCap({ ...base, capProposal: { value: 20, by: 'u1' } }, '2026-11-21')).toEqual({
      dailyCap: 15,
      capNext: { value: 20, from: '2026-11-22' },
      capProposal: null,
    });
  });

  it('folds a change already in force into the base cap, but not one still to come', () => {
    const proposal = { value: 10, by: 'u1' };
    expect(acceptedCap({ dailyCap: 15, capNext: { value: 20, from: '2026-11-18' }, capProposal: proposal }, '2026-11-21')?.dailyCap).toBe(20);
    expect(acceptedCap({ dailyCap: 15, capNext: { value: 20, from: '2026-11-22' }, capProposal: proposal }, '2026-11-21')?.dailyCap).toBe(15);
  });

  it('accepts only whole caps in range', () => {
    expect(isValidCap(15)).toBe(true);
    expect(isValidCap(4)).toBe(false);
    expect(isValidCap(51)).toBe(false);
    expect(isValidCap(15.5)).toBe(false);
  });
});

describe('recalculating a completion at sync', () => {
  it('keeps the points when the cap has room', () => {
    expect(recalculate(completion(), 0, 15)).toMatchObject({ awardedPoints: 5, altitude: 25 });
  });

  it('applies the streak bonus the completion earned', () => {
    expect(recalculate(completion({ bonusPct: 30 }), 0, 15)).toMatchObject({ awardedPoints: 7, altitude: 35 });
  });

  it('trims to what is left of the cap, down to zero, and never drops the completion', () => {
    expect(recalculate(completion(), 13, 15)).toMatchObject({ awardedPoints: 2, altitude: 10, coins: 10, energy: 5 });
    expect(recalculate(completion(), 15, 15)).toMatchObject({ awardedPoints: 0, altitude: 0, coins: 10 });
    // another device already went past the cap we knew
    expect(recalculate(completion(), 20, 15).awardedPoints).toBe(0);
  });

  it('turns a completion that missed the window into coins and energy only', () => {
    expect(asLate(completion())).toMatchObject({ awardedPoints: 0, altitude: 0, coins: 10, energy: 5, late: true });
  });

  it('names the document so a goal is completed at most once a day', () => {
    expect(completionDocId('u1', completion())).toBe('u1_g1_2026-11-21');
  });
});

describe('weekly winner', () => {
  it('is derived from the final scores', () => {
    expect(weekWinner({ a: 40, b: 35 })).toBe('a');
    expect(weekWinner({ a: 12, b: 35 })).toBe('b');
    expect(weekWinner({ a: 20, b: 20 })).toBeNull();
    expect(weekWinner({ a: 0, b: 0 })).toBeNull();
    expect(weekWinner({})).toBeNull();
    expect(weekWinner({ a: 5 })).toBe('a');
  });
});

describe('gifts', () => {
  it('cost the sender coins like any purchase', () => {
    const state = {
      ...initialState(),
      completions: [completion({ coins: 40 })],
      inventory: { hat: { at: '', paid: 10 } },
      giftsSent: { c1: { itemId: 'flower', at: '', paid: 25 } },
    };
    expect(totalsOf(state).coins).toBe(5);
  });
});
