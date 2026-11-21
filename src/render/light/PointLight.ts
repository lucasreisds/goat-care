import { Sprite } from 'pixi.js';
import { createGlowTexture } from '../textures';

export interface PointLightConfig {
  x: number;
  y: number;
  radius: number;
  color: number;
  /** Max sprite alpha at level 1. */
  intensity: number;
  /** 0..1 flicker depth. */
  flicker: number;
  /** Flicker speed (rad/s of the base wave). */
  speed: number;
}

/** Additive, banded glow that flickers (lantern, fireplace). */
export class PointLight {
  readonly sprite: Sprite;
  /** Current flicker multiplier (~1), including `enabled`; other layers read it. */
  level = 0;
  private noise = 0;

  constructor(private readonly config: PointLightConfig) {
    this.sprite = new Sprite(createGlowTexture(config.radius, 7));
    this.sprite.anchor.set(0.5);
    this.sprite.position.set(config.x, config.y);
    this.sprite.tint = config.color;
    this.sprite.blendMode = 'add';
    this.sprite.visible = false;
  }

  /** `enabled` is 0..1 (e.g. how night-like it is). */
  update(t: number, enabled: number): void {
    const { flicker, speed, intensity } = this.config;
    this.noise += (Math.random() * 2 - 1 - this.noise) * 0.3;
    const wave = Math.sin(t * speed) * 0.45 + Math.sin(t * speed * 2.7 + 1.3) * 0.25 + this.noise * 0.3;
    const base = Math.max(0, 1 + flicker * wave);
    this.level = base * enabled;
    this.sprite.visible = enabled > 0.01;
    this.sprite.alpha = Math.min(1, intensity * this.level);
    this.sprite.scale.set(1 + 0.02 * wave);
  }
}
