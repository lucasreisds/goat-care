import { initialState, STATE_VERSION, type GameState } from '../core/state';

/** Minimal key-value storage so the game state does not care where it lives. */
export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

export const STORAGE_KEY = 'goat-care/state';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Parses stored JSON into a state, filling new settings with defaults. Returns null if it is not usable. */
export function parseState(raw: string): GameState | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObj(data) || data.version !== STATE_VERSION) return null;
  if (!isObj(data.profile) || !isObj(data.settings) || !Array.isArray(data.goals) || !Array.isArray(data.completions)) return null;
  if (!isObj(data.moods) || !isObj(data.weeklyReviews)) return null;

  const defaults = initialState();
  return {
    ...(data as unknown as GameState),
    profile: { ...defaults.profile, ...(data.profile as object) } as GameState['profile'],
    settings: { ...defaults.settings, ...(data.settings as object) } as GameState['settings'],
    // Added in 0.4.0: saves from earlier versions do not have them yet.
    inventory: isObj(data.inventory) ? (data.inventory as GameState['inventory']) : defaults.inventory,
    wardrobe: isObj(data.wardrobe) ? (data.wardrobe as GameState['wardrobe']) : defaults.wardrobe,
  };
}

export interface LoadResult {
  state: GameState;
  /** True when stored data was unreadable and a fresh game was started (the old data is kept under a backup key). */
  recovered: boolean;
}

export function loadState(store: KeyValueStore): LoadResult {
  const raw = store.get(STORAGE_KEY);
  if (raw === null) return { state: initialState(), recovered: false };
  const parsed = parseState(raw);
  if (parsed) return { state: parsed, recovered: false };
  store.set(`${STORAGE_KEY}/backup`, raw);
  return { state: initialState(), recovered: true };
}

export function saveState(store: KeyValueStore, state: GameState): void {
  store.set(STORAGE_KEY, JSON.stringify(state));
}

/** localStorage when available (it can throw in private windows); otherwise memory for this session. */
export function browserStore(): KeyValueStore {
  const memory = new Map<string, string>();
  return {
    get(key) {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return memory.get(key) ?? null;
      }
    },
    set(key, value) {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        memory.set(key, value);
      }
    },
  };
}
