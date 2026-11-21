import type { AnchorTable, ItemDef, PackManifest, StageDef } from './schema';

/**
 * An item fits a character when it lists that pack (or "*"), the pack has the item's slot,
 * and the pack provides the anchor NAME the item attaches to.
 */
export function isCompatible(item: ItemDef, pack: PackManifest): boolean {
  const listed = item.compatibleWith.includes('*') || item.compatibleWith.includes(pack.id);
  return listed && item.slot in pack.slots && pack.anchors.includes(item.anchor);
}

/** The stage reached at a given altitude (highest stage whose minAltitude <= altitude). */
export function stageForAltitude(stages: readonly StageDef[], altitude: number): StageDef {
  let current = stages[0]!;
  for (const stage of stages) if (altitude >= stage.minAltitude) current = stage;
  return current;
}

export function getAnchors(pack: PackManifest, stage: string, animation: string, frame: number): AnchorTable {
  const table = pack.anchorData[stage]?.[animation]?.[frame];
  if (!table) throw new Error(`No anchors for ${pack.id}/${stage}/${animation}[${frame}]`);
  return table;
}
