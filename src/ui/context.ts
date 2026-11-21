import type { GameState } from '../core/state';
import type { DayKey } from '../core/time/calendar';
import type { CharacterAssets, HomeScene } from '../render/HomeScene';

/** Fired on `window` after every state change so open screens can redraw. */
export const COMMIT_EVENT = 'goat:commit';

/** What every screen can do with the app, without knowing about App itself. */
export interface AppContext {
  readonly state: GameState;
  commit(next: GameState): void;
  now(): Date;
  /** Character speech bubble (labeled with the character's name). */
  speak(text: string, expression?: string): void;
  toast(text: string): void;
  scene(): HomeScene;
  /** The loaded character pack and item catalog. */
  readonly assets: CharacterAssets;
  open: {
    shop(): void;
    wardrobe(): void;
    goalEditor(goalId?: string): void;
    goalsList(): void;
    weeklyReview(weekKey: DayKey): void;
    summary(): void;
    mood(): void;
    settings(): void;
    menu(): void;
  };
}
