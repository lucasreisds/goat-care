import { Container, Sprite, type Texture } from 'pixi.js';
import { PixelBuffer } from '../render/pixel';
import { breathPose, HOP_DURATION, hopPose } from './motion';

export interface CharacterViewOptions {
  idle: Texture;
  /** Optional eyes-closed frame used for blinking. */
  blink?: Texture;
  /** Fixed standing point (feet, bottom center). */
  x: number;
  y: number;
}

export function createShadowTexture(): Texture {
  const buf = new PixelBuffer(36, 8);
  buf.ellipse(18, 4, 17, 3.5, 0x1a1030, 0.35);
  return buf.toTexture();
}

/**
 * Generic character renderer: knows nothing about goats.
 * Stage 2 grows this into the layered (body > clothing > expression > accessories) view.
 */
export class CharacterView {
  readonly container = new Container();
  private readonly sprite: Sprite;
  private readonly shadow: Sprite;
  private hopStart = -Infinity;
  private nextBlink = 2.5;
  private blinkUntil = 0;

  constructor(private readonly options: CharacterViewOptions) {
    this.shadow = new Sprite(createShadowTexture());
    this.shadow.anchor.set(0.5);
    this.shadow.position.set(options.x, options.y - 1);

    this.sprite = new Sprite(options.idle);
    this.sprite.anchor.set(0.5, 1);
    this.sprite.position.set(options.x, options.y);

    this.container.addChild(this.shadow, this.sprite);
  }

  /** Tap target in scene coordinates. */
  contains(x: number, y: number): boolean {
    const w = this.options.idle.width;
    const h = this.options.idle.height;
    return Math.abs(x - this.options.x) <= w / 2 && y >= this.options.y - h && y <= this.options.y;
  }

  celebrate(t: number): void {
    this.hopStart = t;
  }

  update(t: number, tint: number): void {
    const hopT = t - this.hopStart;
    const hopping = hopT >= 0 && hopT < HOP_DURATION;
    const pose = hopping ? hopPose(hopT) : breathPose(t);

    this.sprite.scale.set(pose.sx, pose.sy);
    this.sprite.y = this.options.y + Math.round(pose.dy);
    this.sprite.tint = tint;

    // shadow shrinks while airborne
    const lift = Math.min(1, -pose.dy / 24);
    this.shadow.scale.set(1 - 0.35 * lift);
    this.shadow.alpha = 1 - 0.4 * lift;

    if (this.options.blink) {
      if (t >= this.nextBlink) {
        this.blinkUntil = t + 0.14;
        this.nextBlink = t + 3 + Math.random() * 3;
      }
      this.sprite.texture = t < this.blinkUntil ? this.options.blink : this.options.idle;
    }
  }
}
