import { isCompatible } from '../character/pack/rules';
import type { ItemDef, PackManifest } from '../character/pack/schema';
import { achievementsMet } from './progression/achievements';
import { totalsOf, type GameState } from './state';

export type ItemStatus =
  | { kind: 'owned' }
  | { kind: 'buyable'; cost: number; affordable: boolean }
  | { kind: 'locked'; achievementId: string };

/** Whether the player has the item: free ones always, achievement ones once met, the rest once bought. */
export function statusOf(state: GameState, item: ItemDef): ItemStatus {
  const { unlock } = item;
  if (unlock.type === 'default') return { kind: 'owned' };
  if (unlock.type === 'achievement') {
    return achievementsMet(state).has(unlock.id) ? { kind: 'owned' } : { kind: 'locked', achievementId: unlock.id };
  }
  if (state.inventory[item.id]) return { kind: 'owned' };
  return { kind: 'buyable', cost: unlock.cost, affordable: totalsOf(state).coins >= unlock.cost };
}

export const isOwned = (state: GameState, item: ItemDef): boolean => statusOf(state, item).kind === 'owned';

/** Items that fit this character, in catalog order. */
export const itemsFor = (items: readonly ItemDef[], pack: PackManifest): ItemDef[] =>
  items.filter((item) => isCompatible(item, pack));

export type BuyResult =
  | { ok: true; state: GameState }
  | { ok: false; reason: 'owned' | 'not-for-sale' | 'insufficient-coins' };

export function buyItem(state: GameState, item: ItemDef, now: Date): BuyResult {
  if (item.unlock.type !== 'coins') return { ok: false, reason: item.unlock.type === 'default' ? 'owned' : 'not-for-sale' };
  if (state.inventory[item.id]) return { ok: false, reason: 'owned' };
  if (totalsOf(state).coins < item.unlock.cost) return { ok: false, reason: 'insufficient-coins' };
  const inventory = { ...state.inventory, [item.id]: { at: now.toISOString(), paid: item.unlock.cost } };
  return { ok: true, state: { ...state, inventory } };
}

export const equippedIn = (state: GameState, characterId = state.profile.activeCharacterId): Record<string, string> =>
  state.wardrobe[characterId] ?? {};

export type EquipResult = { ok: true; state: GameState } | { ok: false; reason: 'not-owned' | 'incompatible' };

/** Puts an owned, compatible item on the character, replacing whatever was in that slot. */
export function equipItem(state: GameState, item: ItemDef, pack: PackManifest): EquipResult {
  if (!isCompatible(item, pack)) return { ok: false, reason: 'incompatible' };
  if (!isOwned(state, item)) return { ok: false, reason: 'not-owned' };
  const id = state.profile.activeCharacterId;
  return { ok: true, state: { ...state, wardrobe: { ...state.wardrobe, [id]: { ...equippedIn(state, id), [item.slot]: item.id } } } };
}

export function unequipSlot(state: GameState, slot: string): GameState {
  const id = state.profile.activeCharacterId;
  const { [slot]: _removed, ...rest } = equippedIn(state, id);
  void _removed;
  return { ...state, wardrobe: { ...state.wardrobe, [id]: rest } };
}

/** The item ids the character should be wearing now (ignores anything no longer owned or compatible). */
export function outfitFor(state: GameState, items: readonly ItemDef[], pack: PackManifest): string[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  return Object.values(equippedIn(state)).filter((id) => {
    const item = byId.get(id);
    return item !== undefined && isCompatible(item, pack) && isOwned(state, item);
  });
}
