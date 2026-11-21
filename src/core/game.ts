import { agendaFor, type AgendaItem } from './goals/agenda';
import {
  canAddActiveGoal,
  createGoal,
  latestFields,
  queueChange,
  settleGoals,
  statusPatch,
  validateGoalInput,
  type GoalIssue,
} from './goals/rules';
import type { Completion, GoalFields, GoalInput } from './goals/types';
import { reachedMilestones, rewardFor } from './progression/rewards';
import { awardPoints, type Award } from './scoring';
import { characterNameOf, totalsOf, type GameState, type Mood } from './state';
import { streakThrough } from './streak';
import { summarizeWeek } from './summary';
import { addDays, dayKeyOf, previousWeekKey, weekdayOf, weekKeyOf, type DayKey } from './time/calendar';

export const MAX_CHARACTER_NAME = 16;
export const MAX_DISPLAY_NAME = 30;

export type Failure<R extends string = string> = { ok: false; reason: R; issues?: GoalIssue[] };

const dayOf = (state: GameState, now: Date): DayKey => dayKeyOf(now, state.settings.timezone);

/** Stored goals with every change whose day has come applied. Call before reading or writing goals. */
export function settle(state: GameState, now: Date): GameState {
  const goals = settleGoals(state.goals, dayOf(state, now));
  return goals.some((g, i) => g !== state.goals[i]) ? { ...state, goals } : state;
}

export const agenda = (state: GameState, now: Date): AgendaItem[] =>
  agendaFor(state.goals, state.completions, dayOf(state, now));

export function pointsOnDay(state: GameState, day: DayKey): number {
  return state.completions.filter((c) => c.dayKey === day).reduce((sum, c) => sum + c.awardedPoints, 0);
}

/** Streak that bonuses today's completions: consecutive days up to and including yesterday. */
export const currentStreak = (state: GameState, now: Date): number =>
  streakThrough(addDays(dayOf(state, now), -1), state.goals, state.completions);

// ---------------------------------------------------------------- completing

export interface Completed {
  ok: true;
  state: GameState;
  completion: Completion;
  award: Award;
  streakDays: number;
  /** Altitude milestones crossed by this completion. */
  newMilestones: number[];
}

export function completeGoal(
  input: GameState,
  goalId: string,
  now: Date,
): Completed | Failure<'unknown-goal' | 'not-due' | 'already-done'> {
  const state = settle(input, now);
  const today = dayOf(state, now);
  const goal = state.goals.find((g) => g.id === goalId);
  if (!goal) return { ok: false, reason: 'unknown-goal' };

  const item = agendaFor(state.goals, state.completions, today).find((i) => i.goal.id === goalId);
  if (!item) {
    const done = state.completions.some((c) => c.goalId === goalId && c.dayKey === today);
    return { ok: false, reason: done ? 'already-done' : 'not-due' };
  }
  if (item.state === 'done') return { ok: false, reason: 'already-done' };

  const streakDays = currentStreak(state, now);
  const award = awardPoints({
    difficulty: item.fields.difficulty,
    pointsToday: pointsOnDay(state, today),
    cap: state.settings.dailyCap,
    streakDays,
  });
  const reward = rewardFor({ basePoints: award.base, awardedPoints: award.awarded });
  const completion: Completion = {
    id: `${goalId}_${today}_1`,
    goalId,
    dayKey: today,
    weekKey: weekKeyOf(today),
    difficulty: item.fields.difficulty,
    basePoints: award.base,
    awardedPoints: award.awarded,
    bonusPct: award.bonusPct,
    coins: reward.coins,
    energy: reward.energy,
    altitude: reward.altitude,
    completedAt: now.toISOString(),
  };

  const before = totalsOf(state).altitude;
  const next: GameState = { ...state, completions: [...state.completions, completion] };
  const newMilestones = reachedMilestones(before + reward.altitude).filter((m) => !reachedMilestones(before).includes(m));
  return { ok: true, state: next, completion, award, streakDays, newMilestones };
}

// --------------------------------------------------------------------- goals

type GoalResult = { ok: true; state: GameState } | Failure<'invalid' | 'limit' | 'unknown-goal'>;

export function addGoal(input: GameState, goalInput: GoalInput, now: Date, id: string): GoalResult {
  const state = settle(input, now);
  const issues = validateGoalInput(goalInput);
  if (issues.length > 0) return { ok: false, reason: 'invalid', issues };
  if (!canAddActiveGoal(state.goals)) return { ok: false, reason: 'limit' };
  const goal = createGoal(goalInput, now, state.settings.timezone, id);
  return { ok: true, state: { ...state, goals: [...state.goals, goal] } };
}

/** Edits, pauses and archives apply from the next day. */
export function changeGoal(input: GameState, goalId: string, patch: Partial<GoalFields>, now: Date): GoalResult {
  const state = settle(input, now);
  const goal = state.goals.find((g) => g.id === goalId);
  if (!goal) return { ok: false, reason: 'unknown-goal' };

  const current = latestFields(goal);
  const merged = { ...current, ...patch };
  const { status: _status, ...editable } = merged;
  void _status;
  const issues = validateGoalInput(editable);
  if (issues.length > 0) return { ok: false, reason: 'invalid', issues };

  const reactivating = patch.status === 'active' && current.status !== 'active';
  if (reactivating && !canAddActiveGoal(state.goals)) return { ok: false, reason: 'limit' };

  const updated = queueChange(goal, patch, now, state.settings.timezone);
  return { ok: true, state: { ...state, goals: state.goals.map((g) => (g.id === goalId ? updated : g)) } };
}

export const pauseGoal = (s: GameState, id: string, now: Date): GoalResult => changeGoal(s, id, statusPatch('paused'), now);
export const resumeGoal = (s: GameState, id: string, now: Date): GoalResult => changeGoal(s, id, statusPatch('active'), now);
export const archiveGoal = (s: GameState, id: string, now: Date): GoalResult => changeGoal(s, id, statusPatch('archived'), now);

// ------------------------------------------------------------- weekly review

/** The previous week's Monday when a weekly review should be offered (Mondays, if enabled and not yet handled). */
export function pendingWeeklyReview(state: GameState, now: Date): DayKey | null {
  if (!state.settings.weeklyReviewEnabled || !state.profile.onboarded) return null;
  const today = dayOf(state, now);
  if (weekdayOf(today) !== 1) return null;
  const week = previousWeekKey(weekKeyOf(today));
  if (state.weeklyReviews[week]) return null;
  const summary = summarizeWeek(state.goals, state.completions, week);
  return summary.goals.length > 0 || summary.completions > 0 ? week : null;
}

/** Marks a week's review as done or dismissed. Ignoring it changes nothing about the goals. */
export function recordWeeklyReview(state: GameState, weekKey: DayKey, now: Date): GameState {
  return { ...state, weeklyReviews: { ...state.weeklyReviews, [weekKey]: { at: now.toISOString() } } };
}

// ---------------------------------------------------------------------- mood

export function setMood(state: GameState, mood: Mood, now: Date): GameState {
  return { ...state, moods: { ...state.moods, [dayOf(state, now)]: { mood, at: now.toISOString() } } };
}

export const moodToday = (state: GameState, now: Date): Mood | null => state.moods[dayOf(state, now)]?.mood ?? null;

// ------------------------------------------------------------ names / profile

export type NameIssue = 'empty' | 'too-long';

export function validateCharacterName(name: string): NameIssue | null {
  const trimmed = name.trim();
  if (trimmed.length === 0) return 'empty';
  if ([...trimmed].length > MAX_CHARACTER_NAME) return 'too-long';
  return null;
}

export function validateDisplayName(name: string): NameIssue | null {
  const trimmed = name.trim();
  if (trimmed.length === 0) return 'empty';
  if ([...trimmed].length > MAX_DISPLAY_NAME) return 'too-long';
  return null;
}

/** Picks a suggested name different from the current one. */
export function suggestName(names: readonly string[], rng: () => number, current = ''): string {
  const pool = names.filter((n) => n !== current);
  return pool[Math.floor(rng() * pool.length)] ?? names[0] ?? '';
}

export function renameCharacter(state: GameState, characterId: string, name: string): GameState | NameIssue {
  const issue = validateCharacterName(name);
  if (issue) return issue;
  return {
    ...state,
    profile: { ...state.profile, characters: { ...state.profile.characters, [characterId]: { name: name.trim() } } },
  };
}

export function completeOnboarding(state: GameState, displayName: string, characterName: string): GameState | NameIssue {
  const dn = validateDisplayName(displayName);
  if (dn) return dn;
  const renamed = renameCharacter(state, state.profile.activeCharacterId, characterName);
  if (typeof renamed === 'string') return renamed;
  return { ...renamed, profile: { ...renamed.profile, displayName: displayName.trim(), onboarded: true } };
}

export function renameDisplayName(state: GameState, displayName: string): GameState | NameIssue {
  const issue = validateDisplayName(displayName);
  if (issue) return issue;
  return { ...state, profile: { ...state.profile, displayName: displayName.trim() } };
}

/** Label for the ranking, e.g. "Pico, da Ana" is composed by the UI from these two names. */
export const namesOf = (state: GameState): { character: string; owner: string } => ({
  character: characterNameOf(state),
  owner: state.profile.displayName,
});
