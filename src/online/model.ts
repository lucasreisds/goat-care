import type { Completion } from '../core/goals/types';
import { METERS_PER_POINT } from '../core/progression/rewards';
import { DEFAULT_DAILY_CAP } from '../core/scoring';
import { addDays, type DayKey } from '../core/time/calendar';

/** Shapes of the Firestore documents and the pure rules around them (mirrored by firestore.rules). */

export const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const INVITE_LENGTH = 6;
/** Adjustable; firestore.rules allows this plus 5 minutes of clock tolerance. */
export const INVITE_TTL_MINUTES = 30;
/** Offline completions may sync up to this long after their day ends. */
export const SYNC_GRACE_HOURS = 48;
export const MIN_DAILY_CAP = 5;
export const MAX_DAILY_CAP = 50;

export interface CapChange {
  value: number;
  /** First day the new cap applies. */
  from: DayKey;
}

export interface CapProposal {
  value: number;
  by: string;
}

/** `couples/{coupleId}` */
export interface CoupleDoc {
  members: string[];
  timezone: string;
  /** Fixed offset used by the rules to close days and weeks (-180 for America/Sao_Paulo). */
  utcOffsetMinutes: number;
  dailyCap: number;
  capNext: CapChange | null;
  capProposal: CapProposal | null;
  joinCode: string | null;
}

/** `couples/{coupleId}/members/{uid}`: what the partner may see of a person. */
export interface MemberDoc {
  displayName: string;
  characterId: string;
  characterName: string;
  /** Total meters climbed (drives the stage the partner sees). */
  altitude: number;
  /** Item ids the character is wearing. */
  outfit: string[];
  /** Item ids the person already has (so gifts are never duplicates). */
  owned: string[];
}

export type CaressKind = 'message' | 'gift';

/** `couples/{coupleId}/caresses/{id}`: `ref` is a predefined message id or an item id. */
export interface Caress {
  id: string;
  from: string;
  to: string;
  kind: CaressKind;
  ref: string;
  createdAtMs: number;
  seen: boolean;
}

export function generateInviteCode(rng: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < INVITE_LENGTH; i++) code += INVITE_ALPHABET[Math.floor(rng() * INVITE_ALPHABET.length)];
  return code;
}

/** Cleans what the player typed (spaces, dashes, lower case). Returns null if it cannot be a code. */
export function normalizeInviteCode(raw: string): string | null {
  const code = raw.replace(/[\s-]/g, '').toUpperCase();
  if (code.length !== INVITE_LENGTH) return null;
  return [...code].every((ch) => INVITE_ALPHABET.includes(ch)) ? code : null;
}

export function newCouple(uid: string, timezone: string, now: Date): CoupleDoc {
  return {
    members: [uid],
    timezone,
    utcOffsetMinutes: utcOffsetMinutesOf(timezone, now),
    dailyCap: DEFAULT_DAILY_CAP,
    capNext: null,
    capProposal: null,
    joinCode: null,
  };
}

/** The cap that applies on a given day. */
export function effectiveCap(couple: Pick<CoupleDoc, 'dailyCap' | 'capNext'>, day: DayKey): number {
  return couple.capNext && day >= couple.capNext.from ? couple.capNext.value : couple.dailyCap;
}

/** Accepting a proposal: the new value starts tomorrow; a change already in force becomes the base. */
export function acceptedCap(
  couple: Pick<CoupleDoc, 'dailyCap' | 'capNext' | 'capProposal'>,
  today: DayKey,
): Pick<CoupleDoc, 'dailyCap' | 'capNext' | 'capProposal'> | null {
  if (!couple.capProposal) return null;
  return {
    dailyCap: effectiveCap(couple, today),
    capNext: { value: couple.capProposal.value, from: addDays(today, 1) },
    capProposal: null,
  };
}

export const isValidCap = (value: number): boolean =>
  Number.isInteger(value) && value >= MIN_DAILY_CAP && value <= MAX_DAILY_CAP;

/** Offset of a time zone from UTC at a given instant, in minutes (America/Sao_Paulo -> -180). */
export function utcOffsetMinutesOf(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(at);
  const n = (type: string): number => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second'));
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60_000);
}

/** Midnight that starts a day, in the couple's fixed offset. */
export function dayStartMs(day: DayKey, utcOffsetMinutes: number): number {
  return Date.parse(`${day}T00:00:00Z`) - utcOffsetMinutes * 60_000;
}

/** Whether a completion of that day can still be written (the rules close it 48 h after the day ends). */
export function isSyncWindowOpen(day: DayKey, utcOffsetMinutes: number, nowMs: number): boolean {
  return nowMs < dayStartMs(day, utcOffsetMinutes) + (24 + SYNC_GRACE_HOURS) * 3_600_000;
}

export const completionDocId = (uid: string, c: Pick<Completion, 'goalId' | 'dayKey'>): string =>
  `${uid}_${c.goalId}_${c.dayKey}`;

/**
 * Points are recalculated when a completion reaches the server: base plus the streak bonus it earned,
 * cut down to what is left of that day's cap (possibly 0). The completion itself is never dropped.
 */
export function recalculate(c: Completion, pointsAlreadyThatDay: number, cap: number): Completion {
  const raw = Math.round(c.basePoints * (1 + c.bonusPct / 100));
  const awardedPoints = Math.max(0, Math.min(raw, cap - pointsAlreadyThatDay));
  return { ...c, awardedPoints, altitude: awardedPoints * METERS_PER_POINT };
}

/** A completion that missed the sync window: personal coins and energy only. */
export const asLate = (c: Completion): Completion => ({ ...c, awardedPoints: 0, altitude: 0, late: true });

/** Winner of a closed week from the final scores; null on a tie or when nobody scored. */
export function weekWinner(scores: Readonly<Record<string, number>>): string | null {
  const entries = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0 || entries[0]![1] === 0) return null;
  if (entries.length > 1 && entries[0]![1] === entries[1]![1]) return null;
  return entries[0]![0];
}
