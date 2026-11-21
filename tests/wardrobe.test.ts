import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { completeGoal } from '../src/core/game';
import { parseItemCatalog, parseManifest, type ItemDef } from '../src/character/pack/schema';
import { initialState, totalsOf, type GameState } from '../src/core/state';
import { loadState, saveState, STORAGE_KEY, type KeyValueStore } from '../src/data/localStore';
import { achievementsMet, FIRST_WEEK_DAYS } from '../src/core/progression/achievements';
import {
  buyItem,
  equipItem,
  equippedIn,
  itemsFor,
  outfitFor,
  statusOf,
  unequipSlot,
} from '../src/core/wardrobe';
import { at, goalInput, stateWith } from './helpers';

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf-8'));
const pack = parseManifest(readJson('public/characters/mountain-goat/manifest.json'));
const catalog = parseItemCatalog(readJson('public/items/items.json')).items;
const item = (id: string): ItemDef => catalog.find((i) => i.id === id)!;

/** A state that earned `coins` by faking one completion. */
function withCoins(coins: number): GameState {
  const base = stateWith('2026-11-01', []);
  return {
    ...base,
    completions: [
      {
        id: 'c1', goalId: 'g', dayKey: '2026-11-02', weekKey: '2026-11-02', difficulty: 'easy', basePoints: 1,
        awardedPoints: 1, bonusPct: 0, coins, energy: 0, altitude: 0, completedAt: '',
      },
    ],
  };
}

const ok = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> => {
  if (!r.ok) throw new Error(`expected ok, got ${JSON.stringify(r)}`);
  return r as Extract<T, { ok: true }>;
};

describe('shop', () => {
  it('buying spends coins and keeps the balance derivable', () => {
    const state = ok(buyItem(withCoins(100), item('scarf-red'), at('2026-11-03'))).state;
    expect(totalsOf(state).coins).toBe(100 - 60);
    expect(statusOf(state, item('scarf-red'))).toEqual({ kind: 'owned' });
  });

  it('refuses when coins are short or the item is already owned', () => {
    expect(buyItem(withCoins(10), item('scarf-red'), at('2026-11-03'))).toEqual({ ok: false, reason: 'insufficient-coins' });
    const bought = ok(buyItem(withCoins(500), item('scarf-red'), at('2026-11-03'))).state;
    expect(buyItem(bought, item('scarf-red'), at('2026-11-03'))).toEqual({ ok: false, reason: 'owned' });
  });

  it('achievement items cannot be bought', () => {
    expect(buyItem(withCoins(9999), item('bell-collar'), at('2026-11-03'))).toEqual({ ok: false, reason: 'not-for-sale' });
  });

  it('reports whether a buyable item is affordable', () => {
    expect(statusOf(withCoins(59), item('scarf-red'))).toEqual({ kind: 'buyable', cost: 60, affordable: false });
    expect(statusOf(withCoins(60), item('scarf-red'))).toEqual({ kind: 'buyable', cost: 60, affordable: true });
  });

  it('completing goals later still adds coins on top of the spending', () => {
    let state = stateWith('2026-11-16', [goalInput({ difficulty: 'medium' })]);
    state = { ...state, inventory: { 'flower-pink': { at: '', paid: 30 } } };
    const done = ok(completeGoal(state, state.goals[0]!.id, at('2026-11-17')));
    expect(totalsOf(done.state).coins).toBe(done.completion.coins - 30);
  });
});

describe('achievements', () => {
  it('"first-week" needs completions on 7 different days', () => {
    const days = Array.from({ length: FIRST_WEEK_DAYS }, (_, i) => `2026-11-${String(i + 1).padStart(2, '0')}`);
    const make = (dayKeys: string[]): GameState => ({
      ...initialState(),
      completions: dayKeys.map((dayKey, i) => ({
        id: `c${i}`, goalId: 'g', dayKey, weekKey: dayKey, difficulty: 'easy' as const, basePoints: 1, awardedPoints: 1,
        bonusPct: 0, coins: 0, energy: 0, altitude: 0, completedAt: '',
      })),
    });
    expect(achievementsMet(make(days.slice(0, 6))).has('first-week')).toBe(false);
    expect(achievementsMet(make([...days.slice(0, 6), days[0]!])).has('first-week')).toBe(false);
    expect(achievementsMet(make(days)).has('first-week')).toBe(true);
  });

  it('unlocks the bell collar once met, without buying', () => {
    expect(statusOf(initialState(), item('bell-collar'))).toEqual({ kind: 'locked', achievementId: 'first-week' });
  });
});

describe('wardrobe', () => {
  it('lists the items that fit the character', () => {
    expect(itemsFor(catalog, pack).map((i) => i.id)).toContain('bell-collar');
    const other = { ...pack, id: 'someone-else' };
    expect(itemsFor(catalog, other).map((i) => i.id)).not.toContain('bell-collar');
    expect(itemsFor(catalog, other).map((i) => i.id)).toContain('scarf-red');
  });

  it('equips only owned items and replaces the one in the same slot', () => {
    const state = withCoins(500);
    expect(equipItem(state, item('scarf-red'), pack)).toEqual({ ok: false, reason: 'not-owned' });

    const bought = ok(buyItem(state, item('scarf-red'), at('2026-11-03'))).state;
    const worn = ok(equipItem(bought, item('scarf-red'), pack)).state;
    expect(equippedIn(worn)).toEqual({ neck: 'scarf-red' });

    const both = ok(buyItem(worn, item('beanie-blue'), at('2026-11-03'))).state;
    expect(equippedIn(ok(equipItem(both, item('beanie-blue'), pack)).state)).toEqual({ neck: 'scarf-red', head: 'beanie-blue' });
  });

  it('rejects items that do not fit the character', () => {
    const other = { ...pack, id: 'someone-else' };
    expect(equipItem(withCoins(0), item('bell-collar'), other)).toEqual({ ok: false, reason: 'incompatible' });
  });

  it('unequips a slot', () => {
    const bought = ok(buyItem(withCoins(500), item('scarf-red'), at('2026-11-03'))).state;
    const worn = ok(equipItem(bought, item('scarf-red'), pack)).state;
    expect(equippedIn(unequipSlot(worn, 'neck'))).toEqual({});
  });

  it('the outfit skips anything not owned (e.g. state edited by hand)', () => {
    const state: GameState = { ...withCoins(0), wardrobe: { 'mountain-goat': { neck: 'scarf-red', hand: 'flower-pink' } } };
    expect(outfitFor(state, catalog, pack)).toEqual([]);
    const owned = { ...state, inventory: { 'flower-pink': { at: '', paid: 0 } } };
    expect(outfitFor(owned, catalog, pack)).toEqual(['flower-pink']);
  });

  it('keeps the wardrobe per character', () => {
    const bought = ok(buyItem(withCoins(500), item('scarf-red'), at('2026-11-03'))).state;
    const worn = ok(equipItem(bought, item('scarf-red'), pack)).state;
    expect(equippedIn(worn, 'another-character')).toEqual({});
  });
});

describe('persistence of purchases', () => {
  const memory = (): KeyValueStore & { data: Map<string, string> } => {
    const data = new Map<string, string>();
    return { data, get: (k) => data.get(k) ?? null, set: (k, v) => void data.set(k, v) };
  };

  it('round-trips inventory and wardrobe', () => {
    const store = memory();
    const bought = ok(buyItem(withCoins(500), item('scarf-red'), at('2026-11-03'))).state;
    const worn = ok(equipItem(bought, item('scarf-red'), pack)).state;
    saveState(store, worn);
    const loaded = loadState(store).state;
    expect(loaded.inventory).toEqual(worn.inventory);
    expect(loaded.wardrobe).toEqual(worn.wardrobe);
  });

  it('loads saves from before the shop existed', () => {
    const store = memory();
    const { inventory: _i, wardrobe: _w, ...old } = initialState();
    void _i;
    void _w;
    store.set(STORAGE_KEY, JSON.stringify(old));
    const result = loadState(store);
    expect(result.recovered).toBe(false);
    expect(result.state.inventory).toEqual({});
    expect(result.state.wardrobe).toEqual({});
  });
});
