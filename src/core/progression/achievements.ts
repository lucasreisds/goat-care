import type { GameState } from '../state';

/** An achievement is derived from the state, so it can never drift or be lost. */
export interface AchievementDef {
  id: string;
  isMet(state: GameState): boolean;
}

/** Days with at least one completion needed for the "first-week" achievement. */
export const FIRST_WEEK_DAYS = 7;

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  {
    id: 'first-week',
    isMet: (state) => new Set(state.completions.map((c) => c.dayKey)).size >= FIRST_WEEK_DAYS,
  },
];

export const achievementsMet = (state: GameState): Set<string> =>
  new Set(ACHIEVEMENTS.filter((a) => a.isMet(state)).map((a) => a.id));
