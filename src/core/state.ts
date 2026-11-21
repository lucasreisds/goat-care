import type { Completion, Goal } from './goals/types';
import { DEFAULT_DAILY_CAP } from './scoring';
import { DEFAULT_TIMEZONE, type DayKey } from './time/calendar';

export type Mood = 'great' | 'good' | 'okay' | 'low' | 'bad';
export const MOODS: readonly Mood[] = ['great', 'good', 'okay', 'low', 'bad'];

export interface MoodEntry {
  mood: Mood;
  at: string;
}

export interface CharacterProfile {
  /** The name this person gave THIS character (separate from their own display name). */
  name: string;
}

export interface Profile {
  displayName: string;
  activeCharacterId: string;
  /** Per character, never inside the character pack, so many characters can coexist. */
  characters: Record<string, CharacterProfile>;
  onboarded: boolean;
}

export interface Settings {
  timezone: string;
  /** Daily ranking-point cap. The pair confirms changes together in stage 5. */
  dailyCap: number;
  weeklyReviewEnabled: boolean;
}

export const STATE_VERSION = 1;

export interface GameState {
  version: typeof STATE_VERSION;
  profile: Profile;
  settings: Settings;
  goals: Goal[];
  completions: Completion[];
  /** One check-in per day. */
  moods: Record<DayKey, MoodEntry>;
  /** Monday of weeks whose review was done or dismissed. */
  weeklyReviews: Record<DayKey, { at: string }>;
  /** Items bought with coins (what was paid is kept so the balance is always derivable). */
  inventory: Record<string, { at: string; paid: number }>;
  /** What each character wears: wardrobe[characterId][slot] = itemId. */
  wardrobe: Record<string, Record<string, string>>;
}

export const DEFAULT_CHARACTER_ID = 'mountain-goat';

export function initialState(): GameState {
  return {
    version: STATE_VERSION,
    profile: { displayName: '', activeCharacterId: DEFAULT_CHARACTER_ID, characters: {}, onboarded: false },
    settings: { timezone: DEFAULT_TIMEZONE, dailyCap: DEFAULT_DAILY_CAP, weeklyReviewEnabled: true },
    goals: [],
    completions: [],
    moods: {},
    weeklyReviews: {},
    inventory: {},
    wardrobe: {},
  };
}

export interface Totals {
  coins: number;
  energy: number;
  /** Total meters climbed. */
  altitude: number;
}

/** Totals are derived from completions and purchases, so they can never drift. */
export function totalsOf(state: GameState): Totals {
  const earned = state.completions.reduce<Totals>(
    (t, c) => ({ coins: t.coins + c.coins, energy: t.energy + c.energy, altitude: t.altitude + c.altitude }),
    { coins: 0, energy: 0, altitude: 0 },
  );
  const spent = Object.values(state.inventory).reduce((sum, entry) => sum + entry.paid, 0);
  return { ...earned, coins: earned.coins - spent };
}

export const characterNameOf = (state: GameState): string =>
  state.profile.characters[state.profile.activeCharacterId]?.name ?? '';
