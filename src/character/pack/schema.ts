/**
 * Character pack format. A pack is DATA: a manifest plus PNG files named by convention
 *   bodies/<stage>/<animation>.png     horizontal strips, one frame per `frame.width`
 *   expressions/<id>.png               strip (>1 frame animates), anchored at `head`
 *   expressions/<id>-blink.png         optional eyes-closed variant (`blink: true`)
 *   parts/*.png                        secondary-motion parts (ears, beard...), see `parts`
 * The engine knows nothing about any specific character.
 */
export type Point = readonly [number, number];

export type UnlockDef =
  | { type: 'default' }
  | { type: 'coins'; cost: number }
  | { type: 'achievement'; id: string };

export interface StageDef {
  id: string;
  /** Altitude (m) at which this stage is reached. The first stage must start at 0. */
  minAltitude: number;
  /** Scale applied to equipped items (art is authored at 1). */
  itemScale: number;
}

export type SlotLayer = 'clothing' | 'accessory';

export interface SlotDef {
  layer: SlotLayer;
  /** Draw order inside the layer. */
  z: number;
}

export interface AnimationDef {
  frames: number;
  fps: number;
  loop: boolean;
  /** Animation to switch to when a non-looping animation ends. */
  next?: string;
  /** Expression shown unless one is forced from outside. */
  expression: string;
  canBlink?: boolean;
  /** Keep the eyes shut (uses the expression's blink variant). */
  closedEyes?: boolean;
  /** Apply the squash & stretch hop on top of the frames. */
  hop?: boolean;
}

export interface ExpressionDef {
  frames: number;
  fps?: number;
  blink: boolean;
}

/** Secondary motion: the sprite follows its anchor on a damped spring and drifts with the wind. */
export interface SpringDef {
  stiffness: number;
  damping: number;
  wind: number;
}

export interface PartDef {
  id: string;
  file: string;
  /** Pixel of the image that sits on the anchor. */
  pivot: Point;
  anchor: string;
  layer: 'body';
  spring?: SpringDef;
}

export type AnchorTable = Readonly<Record<string, Point>>;

export interface PackManifest {
  schemaVersion: 1;
  id: string;
  nameKey: string;
  unlock: UnlockDef;
  frame: { width: number; height: number };
  /** Pixel of an expression image that sits on the `head` anchor. */
  expressionPivot: Point;
  /** Every anchor name this pack provides, for every frame of every animation. */
  anchors: string[];
  stages: StageDef[];
  slots: Record<string, SlotDef>;
  animations: Record<string, AnimationDef>;
  expressions: Record<string, ExpressionDef>;
  parts: PartDef[];
  /** anchorData[stage][animation][frame][anchorName] = [x, y] in frame pixels. */
  anchorData: Record<string, Record<string, AnchorTable[]>>;
}

export interface ItemDef {
  id: string;
  slot: string;
  /** Anchor NAME the item attaches to. */
  anchor: string;
  /** Pack ids this item works on; "*" = every character. */
  compatibleWith: string[];
  file: string;
  pivot: Point;
  nameKey: string;
  unlock: UnlockDef;
  spring?: SpringDef;
}

export interface ItemCatalog {
  schemaVersion: 1;
  items: ItemDef[];
}

export class PackFormatError extends Error {
  constructor(
    readonly what: string,
    readonly issues: string[],
  ) {
    super(`Invalid ${what}:\n- ${issues.join('\n- ')}`);
    this.name = 'PackFormatError';
  }
}

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isPoint = (v: unknown): v is Point =>
  Array.isArray(v) && v.length === 2 && v.every((n) => isNum(n));

function checkUnlock(v: unknown, path: string, issues: string[]): void {
  if (!isObj(v)) return void issues.push(`${path} must be an object`);
  if (v.type === 'default') return;
  if (v.type === 'coins' && isNum(v.cost) && v.cost >= 0) return;
  if (v.type === 'achievement' && isStr(v.id)) return;
  issues.push(`${path} must be {type:"default"} | {type:"coins",cost} | {type:"achievement",id}`);
}

function checkSpring(v: unknown, path: string, issues: string[]): void {
  if (v === undefined) return;
  if (!isObj(v) || !isNum(v.stiffness) || !isNum(v.damping) || !isNum(v.wind)) {
    issues.push(`${path} must have numeric stiffness, damping and wind`);
  }
}

/** Validates a parsed manifest.json and returns it typed, or throws listing EVERY problem. */
export function parseManifest(raw: unknown): PackManifest {
  const issues: string[] = [];
  if (!isObj(raw)) throw new PackFormatError('pack manifest', ['root must be an object']);

  if (raw.schemaVersion !== 1) issues.push('schemaVersion must be 1');
  if (!isStr(raw.id)) issues.push('id must be a non-empty string');
  if (!isStr(raw.nameKey)) issues.push('nameKey must be a non-empty string');
  checkUnlock(raw.unlock, 'unlock', issues);

  const frame = raw.frame;
  if (!isObj(frame) || !isNum(frame.width) || !isNum(frame.height) || frame.width < 1 || frame.height < 1) {
    issues.push('frame must have positive width and height');
  }
  if (!isPoint(raw.expressionPivot)) issues.push('expressionPivot must be [x, y]');

  const anchors = Array.isArray(raw.anchors) && raw.anchors.every(isStr) ? (raw.anchors as string[]) : null;
  if (!anchors || anchors.length === 0) issues.push('anchors must be a non-empty list of names');
  else if (!anchors.includes('head')) issues.push('anchors must include "head" (expressions attach to it)');

  const stages = Array.isArray(raw.stages) ? raw.stages : [];
  if (stages.length === 0) issues.push('stages must be a non-empty list');
  stages.forEach((s, i) => {
    if (!isObj(s) || !isStr(s.id) || !isNum(s.minAltitude) || !isNum(s.itemScale) || s.itemScale <= 0) {
      issues.push(`stages[${i}] needs id, minAltitude and itemScale > 0`);
    }
  });
  if (stages.length > 0) {
    const alt = stages.map((s) => (isObj(s) && isNum(s.minAltitude) ? s.minAltitude : NaN));
    if (alt[0] !== 0) issues.push('the first stage must start at minAltitude 0');
    if (alt.some((a, i) => i > 0 && !(a > alt[i - 1]!))) issues.push('stages must be in strictly increasing minAltitude order');
  }

  const slots = isObj(raw.slots) ? raw.slots : {};
  if (Object.keys(slots).length === 0) issues.push('slots must define at least one slot');
  for (const [name, def] of Object.entries(slots)) {
    if (!isObj(def) || (def.layer !== 'clothing' && def.layer !== 'accessory') || !isNum(def.z)) {
      issues.push(`slots.${name} needs layer ("clothing"|"accessory") and numeric z`);
    }
  }

  const animations = isObj(raw.animations) ? raw.animations : {};
  const expressions = isObj(raw.expressions) ? raw.expressions : {};
  if (!isObj(animations.idle)) issues.push('animations.idle is required');
  for (const [name, def] of Object.entries(animations)) {
    if (!isObj(def) || !isNum(def.frames) || def.frames < 1 || !isNum(def.fps) || def.fps <= 0 || typeof def.loop !== 'boolean') {
      issues.push(`animations.${name} needs frames >= 1, fps > 0 and loop`);
      continue;
    }
    if (!isStr(def.expression) || !(def.expression in expressions)) issues.push(`animations.${name}.expression must be a defined expression`);
    if (def.next !== undefined && !(isStr(def.next) && def.next in animations)) issues.push(`animations.${name}.next must be a defined animation`);
    if (!def.loop && def.next === undefined) {
      // allowed: it simply holds its last frame
    }
  }
  for (const [name, def] of Object.entries(expressions)) {
    if (!isObj(def) || !isNum(def.frames) || def.frames < 1 || typeof def.blink !== 'boolean') {
      issues.push(`expressions.${name} needs frames >= 1 and blink`);
    } else if (def.frames > 1 && !isNum(def.fps)) {
      issues.push(`expressions.${name} has several frames and needs fps`);
    }
  }

  const parts = Array.isArray(raw.parts) ? raw.parts : [];
  parts.forEach((p, i) => {
    if (!isObj(p) || !isStr(p.id) || !isStr(p.file) || !isPoint(p.pivot) || !isStr(p.anchor) || p.layer !== 'body') {
      issues.push(`parts[${i}] needs id, file, pivot, anchor and layer "body"`);
      return;
    }
    if (anchors && !anchors.includes(p.anchor)) issues.push(`parts[${i}].anchor "${p.anchor}" is not a declared anchor`);
    checkSpring(p.spring, `parts[${i}].spring`, issues);
  });

  // anchorData must cover every stage x animation x frame x anchor
  const anchorData = isObj(raw.anchorData) ? raw.anchorData : {};
  if (anchors) {
    for (const s of stages) {
      if (!isObj(s) || !isStr(s.id)) continue;
      const perStage = anchorData[s.id];
      if (!isObj(perStage)) {
        issues.push(`anchorData.${s.id} is missing`);
        continue;
      }
      for (const [animName, anim] of Object.entries(animations)) {
        if (!isObj(anim) || !isNum(anim.frames)) continue;
        const frames = perStage[animName];
        if (!Array.isArray(frames) || frames.length !== anim.frames) {
          issues.push(`anchorData.${s.id}.${animName} must have ${anim.frames} frame(s)`);
          continue;
        }
        frames.forEach((table, f) => {
          for (const a of anchors) {
            if (!isObj(table) || !isPoint(table[a])) issues.push(`anchorData.${s.id}.${animName}[${f}] is missing anchor "${a}"`);
          }
        });
      }
    }
  }

  if (issues.length > 0) throw new PackFormatError('pack manifest', issues);
  return raw as unknown as PackManifest;
}

/** Validates items.json against the item format. Pack compatibility is checked separately. */
export function parseItemCatalog(raw: unknown): ItemCatalog {
  const issues: string[] = [];
  if (!isObj(raw)) throw new PackFormatError('item catalog', ['root must be an object']);
  if (raw.schemaVersion !== 1) issues.push('schemaVersion must be 1');
  const items = Array.isArray(raw.items) ? raw.items : [];
  const seen = new Set<string>();
  items.forEach((it, i) => {
    if (!isObj(it)) return void issues.push(`items[${i}] must be an object`);
    if (!isStr(it.id)) issues.push(`items[${i}].id must be a string`);
    else if (seen.has(it.id)) issues.push(`items[${i}].id "${it.id}" is duplicated`);
    else seen.add(it.id);
    if (!isStr(it.slot)) issues.push(`items[${i}].slot must be a string`);
    if (!isStr(it.anchor)) issues.push(`items[${i}].anchor must be a string`);
    if (!Array.isArray(it.compatibleWith) || it.compatibleWith.length === 0 || !it.compatibleWith.every(isStr)) {
      issues.push(`items[${i}].compatibleWith must be a non-empty list of pack ids or "*"`);
    }
    if (!isStr(it.file)) issues.push(`items[${i}].file must be a string`);
    if (!isPoint(it.pivot)) issues.push(`items[${i}].pivot must be [x, y]`);
    if (!isStr(it.nameKey)) issues.push(`items[${i}].nameKey must be a string`);
    checkUnlock(it.unlock, `items[${i}].unlock`, issues);
    checkSpring(it.spring, `items[${i}].spring`, issues);
  });
  if (issues.length > 0) throw new PackFormatError('item catalog', issues);
  return raw as unknown as ItemCatalog;
}
