import { Container, Sprite } from 'pixi.js';
import { createRng } from '../../core/random';
import { createGlowTexture, createRingTexture, createSparkleTexture } from '../textures';

interface Particle {
  sprite: Sprite;
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
}

const PARTICLE_COUNT = 36;
const FLASH_DURATION = 0.9;
const RING_DURATION = 0.7;
const COLORS = [0xfff2a8, 0xffd36b, 0xffb3d1, 0xffffff];

/** Light pulse + sparkles fired when a goal is completed. Pooled: no allocations at runtime. */
export class CompletionBurst {
  readonly container = new Container();
  private readonly flash: Sprite;
  private readonly ring: Sprite;
  private readonly particles: Particle[] = [];
  private age = Infinity;
  private readonly rng = createRng(1234);

  constructor() {
    this.flash = new Sprite(createGlowTexture(60, 7));
    this.flash.anchor.set(0.5);
    this.flash.tint = 0xffe49a;
    this.flash.blendMode = 'add';
    this.flash.visible = false;

    this.ring = new Sprite(createRingTexture(40, 2));
    this.ring.anchor.set(0.5);
    this.ring.tint = 0xfff2c0;
    this.ring.blendMode = 'add';
    this.ring.visible = false;

    this.container.addChild(this.flash, this.ring);

    const sparkle = createSparkleTexture();
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const sprite = new Sprite(sparkle);
      sprite.anchor.set(0.5);
      sprite.visible = false;
      sprite.blendMode = 'add';
      this.container.addChild(sprite);
      this.particles.push({ sprite, x: 0, y: 0, vx: 0, vy: 0, age: Infinity, life: 1 });
    }
  }

  trigger(x: number, y: number): void {
    this.age = 0;
    this.flash.position.set(x, y);
    this.ring.position.set(x, y);
    for (const p of this.particles) {
      const angle = this.rng() * Math.PI * 2;
      const speed = 35 + this.rng() * 55;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed - 25;
      p.age = 0;
      p.life = 0.8 + this.rng() * 0.5;
      p.sprite.tint = COLORS[Math.floor(this.rng() * COLORS.length)]!;
    }
  }

  update(dt: number): void {
    this.age += dt;

    const flashK = this.age / FLASH_DURATION;
    this.flash.visible = flashK < 1;
    if (this.flash.visible) {
      this.flash.alpha = 0.85 * Math.sin(Math.PI * flashK);
      this.flash.scale.set(0.8 + 0.5 * flashK);
    }

    const ringK = this.age / RING_DURATION;
    this.ring.visible = ringK < 1;
    if (this.ring.visible) {
      this.ring.alpha = 0.9 * (1 - ringK);
      this.ring.scale.set(0.2 + 1.2 * ringK);
    }

    for (const p of this.particles) {
      p.age += dt;
      const alive = p.age < p.life;
      p.sprite.visible = alive;
      if (!alive) continue;
      p.vy += 70 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const remaining = p.life - p.age;
      p.sprite.position.set(Math.round(p.x), Math.round(p.y));
      p.sprite.alpha = Math.min(1, remaining / 0.4);
      // twinkle out
      if (remaining < 0.3) p.sprite.visible = Math.floor(p.age * 24) % 2 === 0;
    }
  }
}
