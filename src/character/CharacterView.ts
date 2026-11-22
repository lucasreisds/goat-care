import { Container, Sprite, type Texture } from 'pixi.js';
import { PixelBuffer } from '../render/pixel';
import { AnimationPlayer } from './animation';
import { breathPose, hopPose, type Pose } from './motion';
import type { LoadedItem, LoadedPack } from './pack/loader';
import { getAnchors, isCompatible } from './pack/rules';
import type { Point, SlotLayer, SpringDef } from './pack/schema';
import { SpringFollower, windAt } from './spring';

export interface CharacterViewOptions {
  /** Fixed standing point (feet, bottom center) in scene coordinates. */
  x: number;
  y: number;
  stage?: string;
}

/** What must survive a scene rebuild. */
export interface CharacterSnapshot {
  stage: string;
  animation: string;
  expression: string | null;
  equipped: string[];
}

interface Follower {
  sprite: Sprite;
  spring: SpringDef;
  follower: SpringFollower;
  anchor: string;
  offset: Point;
}

const BLINK_SECONDS = 0.14;

function shadowTexture(): Texture {
  const buf = new PixelBuffer(36, 8);
  buf.ellipse(18, 4, 17, 3.5, 0x1a1030, 0.35);
  return buf.toTexture();
}

const setPivot = (sprite: Sprite, texture: Texture, pivot: Point): void => {
  sprite.anchor.set(pivot[0] / texture.width, pivot[1] / texture.height);
};

/**
 * Layered, data-driven character renderer (knows nothing about any specific character):
 *   body (per stage, per animation frame) > clothing > expression > accessories,
 * with every layer attached by NAMED anchors that change per frame.
 * Parts and spring-flagged items follow their anchors on damped springs plus wind.
 */
export class CharacterView {
  readonly container = new Container();

  private readonly rig = new Container();
  private readonly layers: Record<'body' | SlotLayer | 'expression', Container> = {
    body: new Container(),
    clothing: new Container(),
    expression: new Container(),
    accessory: new Container(),
  };
  private readonly bodySprite = new Sprite();
  private readonly expressionSprite = new Sprite();
  private readonly shadow: Sprite;
  private readonly player: AnimationPlayer;
  private readonly parts: Follower[] = [];
  private readonly equipped = new Map<string, { item: LoadedItem; sprite: Sprite; spring?: Follower }>();
  private readonly itemsById: Map<string, LoadedItem>;

  private stageId: string;
  private expressionOverride: string | null = null;
  private nextBlink = 2.5;
  private blinkUntil = 0;

  constructor(
    private readonly pack: LoadedPack,
    items: readonly LoadedItem[],
    private readonly options: CharacterViewOptions,
  ) {
    const { manifest } = pack;
    this.stageId = options.stage ?? manifest.stages[0]!.id;
    this.itemsById = new Map(items.map((i) => [i.def.id, i]));
    this.player = new AnimationPlayer(manifest.animations);

    this.shadow = new Sprite(shadowTexture());
    this.shadow.anchor.set(0.5);
    this.shadow.position.set(0, -1);

    this.layers.clothing.sortableChildren = true;
    this.layers.accessory.sortableChildren = true;
    this.layers.body.addChild(this.bodySprite);
    this.layers.expression.addChild(this.expressionSprite);
    this.rig.addChild(this.layers.body, this.layers.clothing, this.layers.expression, this.layers.accessory);
    this.container.addChild(this.shadow, this.rig);
    this.container.position.set(options.x, options.y);

    const anchors = getAnchors(manifest, this.stageId, 'idle', 0);
    for (const { def, texture } of pack.parts) {
      const sprite = new Sprite(texture);
      setPivot(sprite, texture, def.pivot);
      this.layers.body.addChild(sprite);
      if (def.spring) {
        const follower = new SpringFollower(def.spring.stiffness, def.spring.damping);
        const [ax, ay] = this.toRig(anchors[def.anchor]!);
        follower.snap(ax, ay);
        this.parts.push({ sprite, spring: def.spring, follower, anchor: def.anchor, offset: [0, 0] });
      } else {
        this.parts.push({ sprite, spring: { stiffness: 0, damping: 0, wind: 0 }, follower: new SpringFollower(0, 0), anchor: def.anchor, offset: [0, 0] });
      }
    }
  }

  // ---------------------------------------------------------------- state API

  get stage(): string {
    return this.stageId;
  }

  get animation(): string {
    return this.player.id;
  }

  get equippedIds(): string[] {
    return [...this.equipped.values()].map((e) => e.item.def.id);
  }

  setStage(id: string): void {
    if (!this.pack.manifest.stages.some((s) => s.id === id)) throw new Error(`Unknown stage "${id}"`);
    this.stageId = id;
    this.applyItemScale();
  }

  play(animation: string): void {
    this.player.play(animation);
  }

  /** Celebration: the pack's `celebrate` animation (hop included) if it has one. */
  celebrate(): void {
    if (this.pack.manifest.animations.celebrate) this.player.play('celebrate');
  }

  /** Forces an expression until cleared with null; otherwise the animation decides. */
  setExpression(id: string | null): void {
    if (id !== null && !this.pack.manifest.expressions[id]) throw new Error(`Unknown expression "${id}"`);
    this.expressionOverride = id;
  }

  get expression(): string | null {
    return this.expressionOverride;
  }

  /** Returns false (and does nothing) if the item does not fit this character. */
  equip(item: LoadedItem): boolean {
    const { manifest } = this.pack;
    if (!isCompatible(item.def, manifest)) return false;
    this.unequip(item.def.slot);

    const slot = manifest.slots[item.def.slot]!;
    const sprite = new Sprite(item.texture);
    setPivot(sprite, item.texture, item.def.pivot);
    sprite.zIndex = slot.z;
    this.layers[slot.layer].addChild(sprite);

    let spring: Follower | undefined;
    if (item.def.spring) {
      const anchors = getAnchors(manifest, this.stageId, this.player.id, this.player.frame);
      const follower = new SpringFollower(item.def.spring.stiffness, item.def.spring.damping);
      const [ax, ay] = this.toRig(anchors[item.def.anchor]!);
      follower.snap(ax, ay);
      spring = { sprite, spring: item.def.spring, follower, anchor: item.def.anchor, offset: [0, 0] };
    }
    this.equipped.set(item.def.slot, { item, sprite, spring });
    this.applyItemScale();
    return true;
  }

  unequip(slot: string): void {
    const entry = this.equipped.get(slot);
    if (!entry) return;
    entry.sprite.destroy();
    this.equipped.delete(slot);
  }

  snapshot(): CharacterSnapshot {
    return { stage: this.stageId, animation: this.player.id, expression: this.expressionOverride, equipped: this.equippedIds };
  }

  restore(snapshot: CharacterSnapshot): void {
    this.setStage(snapshot.stage);
    this.play(snapshot.animation);
    this.setExpression(snapshot.expression);
    for (const id of snapshot.equipped) {
      const item = this.itemsById.get(id);
      if (item) this.equip(item);
    }
  }

  /** Tap target in scene coordinates. */
  contains(x: number, y: number): boolean {
    const { width, height } = this.pack.manifest.frame;
    return Math.abs(x - this.options.x) <= width / 2 && y >= this.options.y - height && y <= this.options.y;
  }

  // ------------------------------------------------------------------- frame

  update(t: number, dt: number, tint: number): void {
    const { manifest } = this.pack;
    this.player.update(dt);
    const animId = this.player.id;
    const anim = this.player.def;
    const frame = this.player.frame;
    const anchors = getAnchors(manifest, this.stageId, animId, frame);

    // body
    this.bodySprite.texture = this.pack.bodies[this.stageId]![animId]![frame]!;
    this.bodySprite.position.set(-manifest.frame.width / 2, -manifest.frame.height);

    // expression (+ blinking)
    const exprId = this.expressionOverride ?? anim.expression;
    const exprDef = manifest.expressions[exprId]!;
    const expr = this.pack.expressions[exprId]!;
    if (anim.canBlink && exprDef.blink && t >= this.nextBlink) {
      this.blinkUntil = t + BLINK_SECONDS;
      this.nextBlink = t + 3 + Math.random() * 3;
    }
    const eyesShut = exprDef.blink && expr.blink && (anim.closedEyes === true || t < this.blinkUntil);
    const exprFrame = exprDef.frames > 1 ? Math.floor(t * (exprDef.fps ?? 6)) % exprDef.frames : 0;
    const exprTexture = eyesShut ? expr.blink! : expr.frames[exprFrame]!;
    this.expressionSprite.texture = exprTexture;
    setPivot(this.expressionSprite, exprTexture, manifest.expressionPivot);
    this.expressionSprite.position.set(...this.toRig(anchors.head!));

    // secondary motion
    const wind = windAt(t);
    for (const p of this.parts) {
      this.followAnchor(p, anchors[p.anchor]!, wind, dt);
    }
    for (const { item, sprite, spring } of this.equipped.values()) {
      if (spring) {
        this.followAnchor(spring, anchors[item.def.anchor]!, wind, dt);
      } else {
        sprite.position.set(...this.toRig(anchors[item.def.anchor]!));
      }
    }

    // pose: code-driven squash & stretch on top of the frames
    const pose: Pose = anim.hop ? hopPose(this.player.time) : breathPose(t);
    this.rig.scale.set(pose.sx, pose.sy);
    this.rig.y = Math.round(pose.dy);
    const lift = Math.min(1, -pose.dy / 24);
    this.shadow.scale.set(1 - 0.35 * lift);
    this.shadow.alpha = 1 - 0.4 * lift;

    // light tint on every sprite
    for (const layer of Object.values(this.layers)) {
      for (const child of layer.children) (child as Sprite).tint = tint;
    }
  }

  // ----------------------------------------------------------------- helpers

  /** Frame pixels -> rig coordinates (rig origin = feet, bottom center). */
  private toRig([x, y]: Point): [number, number] {
    const { width, height } = this.pack.manifest.frame;
    return [x - width / 2, y - height];
  }

  private followAnchor(f: Follower, anchor: Point, wind: number, dt: number): void {
    const [ax, ay] = this.toRig(anchor);
    if (f.spring.stiffness === 0) {
      f.sprite.position.set(ax, ay);
      return;
    }
    f.follower.step(ax + wind * f.spring.wind, ay, dt);
    f.sprite.position.set(Math.round(f.follower.x), Math.round(f.follower.y));
  }

  private applyItemScale(): void {
    const scale = this.pack.manifest.stages.find((s) => s.id === this.stageId)!.itemScale;
    for (const { sprite } of this.equipped.values()) sprite.scale.set(scale);
  }
}
