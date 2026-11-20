import { Container, Sprite, type Texture } from 'pixi.js';
import { createRng, type Rng } from '../../core/random';
import { GROUND_Y, SCENE_H, SCENE_W } from '../constants';
import { PixelBuffer } from '../pixel';

const RIDGE_W = SCENE_W + 8;
const GRASS_TOP = GROUND_Y - 3;

interface RidgeSpec {
  base: number;
  amp: number;
  seed: number;
  f1: number;
  f2: number;
  rock: number;
  rockShade: number;
  outline: number;
  snow?: { color: number; shade: number; top: number };
}

function paintSky(): Texture {
  const buf = new PixelBuffer(SCENE_W, GROUND_Y);
  const bands = [0x3f6fc4, 0x4a82d0, 0x5b96dc, 0x70aae4, 0x8cc0ec, 0xa9d3f0, 0xc6e3f2, 0xe2efe6, 0xf6f0d2];
  const bh = Math.ceil(GROUND_Y / bands.length);
  bands.forEach((color, i) => {
    buf.rect(0, i * bh, SCENE_W, bh, color);
    const next = bands[i + 1];
    if (next === undefined) return;
    // 2 rows of checker dithering blend this band into the next one.
    for (let y = bh - 2; y < bh; y++) {
      for (let x = 0; x < SCENE_W; x++) {
        if (((x + y) & 1) === 0) buf.px(x, i * bh + y, next);
      }
    }
  });
  return buf.toTexture();
}

/** Faceted snowy ridge: sun comes from the upper left, right-facing slopes are shaded. */
function paintRidge(spec: RidgeSpec): Texture {
  const buf = new PixelBuffer(RIDGE_W, GROUND_Y);
  const rng = createRng(spec.seed);
  const p1 = rng() * Math.PI * 2;
  const p2 = rng() * Math.PI * 2;
  const p3 = rng() * Math.PI * 2;
  const height = (x: number): number =>
    spec.base -
    spec.amp *
      (0.62 * (1 - Math.abs(Math.sin(x * spec.f1 + p1))) +
        0.28 * (1 - Math.abs(Math.sin(x * spec.f2 + p2))) +
        0.1 * (0.5 + 0.5 * Math.sin(x * 0.9 + p3)));

  for (let x = 0; x < RIDGE_W; x++) {
    const top = Math.round(height(x));
    const shaded = height(x + 4) - height(x - 4) > 0;
    const snowLine = spec.snow
      ? spec.snow.top + Math.floor(3 * Math.abs(Math.sin(x * 0.5)) + 2 * Math.abs(Math.sin(x * 1.3)))
      : -1;
    for (let y = top; y < GROUND_Y; y++) {
      const isSnow = spec.snow !== undefined && y < snowLine;
      let color = isSnow
        ? shaded ? spec.snow!.shade : spec.snow!.color
        : shaded ? spec.rockShade : spec.rock;
      if (!isSnow && rng() < 0.035) color = shaded ? spec.rock : spec.rockShade;
      buf.px(x, y, color);
    }
    buf.px(x, top, spec.outline);
  }
  return buf.toTexture();
}

function drawPine(buf: PixelBuffer, x: number, baseY: number, h: number): void {
  const tiers = 3;
  buf.rect(x - 1, baseY - 3, 2, 3, 0x4a3030);
  for (let i = 0; i < tiers; i++) {
    const tierH = Math.ceil(h / tiers) + 2;
    const topY = baseY - 3 - h + Math.round((i * h) / tiers);
    const halfMax = 3 + i * 2;
    for (let r = 0; r < tierH; r++) {
      const half = Math.max(0, Math.floor(((r + 1) * halfMax) / tierH));
      buf.rect(x - half, topY + r, half + 1, 1, 0x3f8a5f);
      buf.rect(x + 1, topY + r, half, 1, 0x2a5a45);
    }
    if (i === 0) {
      buf.rect(x - 1, topY, 2, 2, 0xf2f8ff);
    }
  }
}

function paintHills(rng: Rng): Texture {
  const buf = new PixelBuffer(RIDGE_W, GROUND_Y);
  const tops: number[] = [];
  for (let x = 0; x < RIDGE_W; x++) {
    const top = Math.round(214 + 7 * Math.sin(x * 0.045 + 1) + 4 * Math.sin(x * 0.11));
    tops.push(top);
    for (let y = top; y < GROUND_Y; y++) {
      buf.px(x, y, y < top + 3 ? 0x5fae6c : 0x4f9a6a);
    }
    buf.px(x, top, 0x2d6a4c);
  }
  for (let x = 6; x < RIDGE_W - 6; x += 9 + Math.floor(rng() * 8)) {
    drawPine(buf, x, tops[x]! + 3, 14 + Math.floor(rng() * 8));
  }
  return buf.toTexture();
}

function paintCloud(w: number, h: number): Texture {
  const buf = new PixelBuffer(w, h);
  buf.ellipse(w * 0.25, h * 0.65, w * 0.22, h * 0.32, 0xffffff);
  buf.ellipse(w * 0.5, h * 0.45, w * 0.28, h * 0.42, 0xffffff);
  buf.ellipse(w * 0.76, h * 0.64, w * 0.21, h * 0.32, 0xffffff);
  buf.rect(w * 0.15, h * 0.62, w * 0.7, h * 0.3, 0xffffff);
  buf.ctx.globalCompositeOperation = 'source-atop';
  buf.rect(0, Math.round(h * 0.62), w, h, 0xc4d8ef);
  buf.ctx.globalCompositeOperation = 'source-over';
  return buf.toTexture();
}

function paintGround(rng: Rng): Texture {
  const h = SCENE_H - GRASS_TOP;
  const buf = new PixelBuffer(SCENE_W, h);
  // ragged blades along the top edge
  for (let x = 0; x < SCENE_W; x++) {
    const blade = Math.floor(rng() * 4);
    if (blade > 0) buf.rect(x, 3 - blade, 1, blade, 0x9ed36a);
  }
  buf.rect(0, 3, SCENE_W, 2, 0xb4e07a);
  buf.rect(0, 5, SCENE_W, 7, 0x78c25c);
  for (let y = 12; y < 15; y++) {
    for (let x = 0; x < SCENE_W; x++) buf.px(x, y, ((x + y) & 1) === 0 ? 0x56a655 : 0x78c25c);
  }
  buf.rect(0, 15, SCENE_W, 4, 0x56a655);
  buf.rect(0, 19, SCENE_W, 1, 0x3f8548);
  for (let y = 20; y < h; y++) {
    buf.rect(0, y, SCENE_W, 1, (y >> 2) % 2 === 0 ? 0x8a6650 : 0x7d5b49);
  }
  for (let i = 0; i < 12; i++) {
    const cx = 8 + rng() * (SCENE_W - 16);
    const cy = 28 + rng() * (h - 36);
    const rx = 4 + rng() * 5;
    const ry = 2 + rng() * 2.5;
    buf.ellipse(cx, cy + 1, rx, ry, 0x6d687c);
    buf.ellipse(cx, cy, rx, ry, 0x9a95a8);
    buf.px(cx - rx * 0.4, cy - ry * 0.4, 0xc4bfd0);
  }
  return buf.toTexture();
}

/** 3 lean frames (left, center, right) so wind is pixel-snapped, never smeared. */
function paintTuftFrames(): Texture[] {
  return [-1, 0, 1].map((lean) => {
    const buf = new PixelBuffer(13, 9);
    for (const blade of [
      { dx: -3, h: 5 },
      { dx: -1, h: 8 },
      { dx: 1, h: 7 },
      { dx: 3, h: 5 },
    ]) {
      for (let r = 0; r < blade.h; r++) {
        const x = 6 + blade.dx + Math.round(lean * (r / (blade.h - 1)) * 2);
        const color = r >= blade.h - 2 ? 0xb4e07a : r >= blade.h / 2 ? 0x78c25c : 0x4f9a52;
        buf.px(x, 8 - r, color);
      }
    }
    return buf.toTexture();
  });
}

function paintFlowerFrames(petal: number): Texture[] {
  return [-1, 0, 1].map((lean) => {
    const buf = new PixelBuffer(9, 11);
    for (let r = 0; r < 7; r++) {
      buf.px(4 + Math.round(lean * (r / 6) * 2), 10 - r, 0x4f9a52);
    }
    const hx = 4 + lean * 2;
    buf.rect(hx - 1, 2, 3, 3, petal);
    buf.px(hx, 3, 0xfff2a8);
    buf.px(hx, 1, petal);
    buf.px(hx, 5, petal);
    return buf.toTexture();
  });
}

interface Swayer {
  sprite: Sprite;
  frames: Texture[];
  x: number;
}

interface ParallaxLayer {
  sprite: Sprite;
  amp: number;
  phase: number;
}

const windAt = (t: number, x: number): number =>
  Math.sin(t * 1.4 + x * 0.045) * 0.6 + Math.sin(t * 0.45 + x * 0.02) * 0.4;

/** DAY: open mountain peak with parallax ridges, drifting clouds and wind-blown grass. */
export class DayScene {
  /** Behind the character. */
  readonly back = new Container();
  /** In front of the character (foreground grass). */
  readonly front = new Container();

  private readonly layers: ParallaxLayer[] = [];
  private readonly clouds: Array<{ sprite: Sprite; x: number; speed: number }> = [];
  private readonly swayers: Swayer[] = [];

  constructor() {
    const rng = createRng(2024);

    this.back.addChild(new Sprite(paintSky()));

    [
      { y: 36, w: 46, h: 14, x: 12, speed: 3 },
      { y: 68, w: 38, h: 12, x: 110, speed: 5 },
      { y: 100, w: 52, h: 15, x: 60, speed: 2 },
    ].forEach((c) => {
      const sprite = new Sprite(paintCloud(c.w, c.h));
      sprite.y = c.y;
      sprite.alpha = 0.95;
      this.back.addChild(sprite);
      this.clouds.push({ sprite, x: c.x, speed: c.speed });
    });

    const ridges: Array<{ spec: RidgeSpec; amp: number }> = [
      {
        amp: 1,
        spec: {
          base: 168, amp: 96, seed: 11, f1: 0.034, f2: 0.071,
          rock: 0x8aa4d4, rockShade: 0x6f8abf, outline: 0x5d78b0,
          snow: { color: 0xf2f8ff, shade: 0xc9d8f0, top: 120 },
        },
      },
      {
        amp: 2,
        spec: {
          base: 198, amp: 62, seed: 29, f1: 0.052, f2: 0.093,
          rock: 0x5f86a8, rockShade: 0x4b6f96, outline: 0x3f6288,
          snow: { color: 0xe6f2fb, shade: 0xb9cfe6, top: 160 },
        },
      },
    ];
    ridges.forEach(({ spec, amp }, i) => {
      const sprite = new Sprite(paintRidge(spec));
      sprite.x = -4;
      this.back.addChild(sprite);
      this.layers.push({ sprite, amp, phase: i * 1.9 });
    });

    const hills = new Sprite(paintHills(rng));
    hills.x = -4;
    this.back.addChild(hills);
    this.layers.push({ sprite: hills, amp: 3, phase: 3.7 });

    const ground = new Sprite(paintGround(rng));
    ground.y = GRASS_TOP;
    this.back.addChild(ground);

    const tuftFrames = paintTuftFrames();
    const flowerSets = [0xe8505b, 0xf6d84a, 0xfff6f0, 0xb58be8].map(paintFlowerFrames);

    const scatter = (target: Container, count: number, yMin: number, yMax: number, flowers: number): void => {
      for (let i = 0; i < count; i++) {
        const isFlower = i < flowers;
        const frames = isFlower ? flowerSets[i % flowerSets.length]! : tuftFrames;
        const sprite = new Sprite(frames[1]);
        sprite.anchor.set(0.5, 1);
        sprite.x = Math.round(6 + rng() * (SCENE_W - 12));
        sprite.y = Math.round(yMin + rng() * (yMax - yMin));
        target.addChild(sprite);
        this.swayers.push({ sprite, frames, x: sprite.x });
      }
    };
    scatter(this.back, 22, GROUND_Y + 2, 244, 8);
    scatter(this.front, 16, 255, 312, 6);
  }

  update(t: number, dt: number): void {
    for (const layer of this.layers) {
      layer.sprite.x = -4 + Math.round(Math.sin(t * 0.07 + layer.phase) * layer.amp);
    }
    for (const cloud of this.clouds) {
      cloud.x += cloud.speed * dt;
      if (cloud.x > SCENE_W) cloud.x = -cloud.sprite.width;
      cloud.sprite.x = Math.round(cloud.x);
    }
    for (const swayer of this.swayers) {
      const wind = windAt(t, swayer.x);
      const index = wind < -0.3 ? 0 : wind > 0.3 ? 2 : 1;
      swayer.sprite.texture = swayer.frames[index]!;
    }
  }
}
