import { Container, Sprite, type Texture } from 'pixi.js';
import { createRng } from '../../core/random';
import { GROUND_BAND, type Layout } from '../layout';
import { PixelBuffer } from '../pixel';
import { createDotTexture, createSparkleTexture } from '../textures';

const WIN_W = 48;
const WIN_H = 62;
/** Where the snowy field starts inside the glass; snowflakes stop here. */
const FIELD_Y = WIN_H - 12;

const WOOD_DARK = 0x2c1c26;
const WOOD_MID = 0x4a3033;
const WOOD_LIGHT = 0x7a5750;

/** Floor to tie beam: about 2.5 characters tall, whatever the screen height. */
const ROOM_H = 136;
const BEAM_H = 8;
const HEARTH_X = -6;
const HEARTH_W = 46;
const HEARTH_H = 44;
const CHIMNEY_W = 28;

function paintWall(L: Layout): Texture {
  const buf = new PixelBuffer(L.width, L.groundY);
  const rng = createRng(7);
  const planks = [0x6b4a44, 0x75504a, 0x62443f];
  const pw = 12;
  for (let i = 0, x = 0; x < L.width; i++, x += pw) {
    buf.rect(x, 0, pw, L.groundY, planks[i % 3]!);
    buf.rect(x + pw - 1, 0, 1, L.groundY, 0x3d2a36);
    buf.rect(x, 0, 1, L.groundY, 0x8a6054, 0.45);
    for (let k = 0; k < 24; k++) {
      buf.rect(x + 1 + Math.floor(rng() * (pw - 3)), Math.floor(rng() * L.groundY), 1, 2 + Math.floor(rng() * 4), 0x57393a);
    }
  }
  // gable above the tie beam: darker wall, roof underside outside the rafters, king post.
  // Extra height on tall screens goes here, so the room itself never stretches.
  const beamY = L.groundY - ROOM_H;
  const apexY = 4;
  const cx = L.centerX;
  buf.rect(0, 0, L.width, beamY, 0x2a1a30, 0.4);
  for (let y = 0; y < beamY; y++) {
    const half = Math.round(((y - apexY) / (beamY - apexY)) * (L.width / 2 + 8));
    for (const side of [-1, 1]) {
      const edge = cx + side * half;
      const out0 = side < 0 ? 0 : edge;
      const outW = side < 0 ? edge : L.width - edge;
      if (half < 0) continue;
      if (outW > 0) buf.rect(out0, y, outW, 1, (y >> 2) % 2 === 0 ? 0x21151f : 0x1c121b);
      const r0 = side < 0 ? edge : edge - 5;
      buf.rect(r0, y, 6, 1, WOOD_MID);
      buf.px(side < 0 ? edge + 5 : edge - 5, y, WOOD_DARK);
      buf.px(side < 0 ? edge : edge, y, WOOD_LIGHT, 0.6);
    }
    if (half < 0) buf.rect(0, y, L.width, 1, 0x1c121b);
  }
  buf.rect(cx - 3, apexY + 6, 6, beamY - apexY - 6, WOOD_MID);
  buf.rect(cx - 3, apexY + 6, 1, beamY - apexY - 6, WOOD_LIGHT, 0.6);
  buf.rect(cx + 2, apexY + 6, 1, beamY - apexY - 6, WOOD_DARK);
  // tie beam
  buf.rect(0, beamY, L.width, BEAM_H, WOOD_MID);
  buf.rect(0, beamY, L.width, 1, WOOD_LIGHT);
  buf.rect(0, beamY + BEAM_H - 1, L.width, 1, WOOD_DARK);
  // soft shade under the beam, stepped
  buf.rect(0, beamY + BEAM_H, L.width, 8, 0x2a1a30, 0.3);
  buf.rect(0, beamY + BEAM_H + 8, L.width, 8, 0x2a1a30, 0.2);
  buf.rect(0, beamY + BEAM_H + 16, L.width, 8, 0x2a1a30, 0.1);
  // baseboard
  buf.rect(0, L.groundY - 6, L.width, 6, WOOD_MID);
  buf.rect(0, L.groundY - 6, L.width, 1, WOOD_LIGHT);
  return buf.toTexture();
}

function paintFloor(L: Layout): Texture {
  const h = GROUND_BAND;
  const buf = new PixelBuffer(L.width, h);
  const rowH = 11;
  for (let i = 0; i * rowH < h; i++) {
    const y0 = i * rowH;
    buf.rect(0, y0, L.width, rowH, i % 2 === 0 ? 0x7a5a48 : 0x6d4f42);
    buf.rect(0, y0 + rowH - 1, L.width, 1, 0x3d2a36);
    for (let x = (i * 23) % 60; x < L.width; x += 60) buf.rect(x, y0, 1, rowH, 0x3d2a36);
  }
  buf.rect(0, 0, L.width, 2, 0x2c1c26, 0.5);
  return buf.toTexture();
}

function paintWindowFrame(): Texture {
  const buf = new PixelBuffer(WIN_W + 8, WIN_H + 8);
  buf.rect(0, 0, buf.width, buf.height, WOOD_MID);
  buf.rect(0, 0, buf.width, 1, WOOD_LIGHT);
  buf.rect(0, 0, 1, buf.height, 0x6a4640);
  buf.rect(buf.width - 1, 0, 1, buf.height, WOOD_DARK);
  buf.rect(0, buf.height - 1, buf.width, 1, WOOD_DARK);
  buf.ctx.clearRect(4, 4, WIN_W, WIN_H);
  buf.rect(3, 3, WIN_W + 2, 1, WOOD_DARK);
  buf.rect(3, 3, 1, WIN_H + 2, WOOD_DARK);
  return buf.toTexture();
}

function paintSill(): Texture {
  const buf = new PixelBuffer(WIN_W + 16, 6);
  buf.rect(0, 2, buf.width, 4, 0x5f423f);
  buf.rect(0, 2, buf.width, 1, WOOD_LIGHT);
  buf.rect(0, 5, buf.width, 1, WOOD_DARK);
  // snow piled on the sill
  buf.rect(6, 1, buf.width - 12, 1, 0xe8f0ff);
  buf.rect(14, 0, 20, 1, 0xe8f0ff);
  buf.rect(38, 0, 12, 1, 0xffffff);
  return buf.toTexture();
}

function paintGlass(): Texture {
  const rng = createRng(99);
  const buf = new PixelBuffer(WIN_W, WIN_H);
  const bands = [0x0b1030, 0x101a40, 0x16255a, 0x1d316b, 0x25407c];
  const bh = Math.ceil(WIN_H / bands.length);
  bands.forEach((color, i) => {
    buf.rect(0, i * bh, WIN_W, bh, color);
    const next = bands[i + 1];
    if (next === undefined) return;
    for (let y = bh - 2; y < bh; y++) {
      for (let x = 0; x < WIN_W; x++) if (((x + y) & 1) === 0) buf.px(x, i * bh + y, next);
    }
  });
  // faint static stars
  for (let i = 0; i < 16; i++) {
    buf.px(Math.floor(rng() * WIN_W), Math.floor(rng() * (FIELD_Y - 14)), i % 3 === 0 ? 0xaec4ff : 0xdfe8ff, 0.7);
  }
  // moon
  const mx = WIN_W - 16;
  const my = 18;
  buf.ellipse(mx, my, 13, 13, 0xffffff, 0.05);
  buf.ellipse(mx, my, 11, 11, 0xffffff, 0.08);
  buf.ellipse(mx, my, 8, 8, 0xf4eecb);
  buf.ctx.globalCompositeOperation = 'source-atop';
  buf.ellipse(mx + 5, my + 3, 8, 8, 0xd8d3a8);
  buf.ctx.globalCompositeOperation = 'source-over';
  buf.ellipse(mx - 2, my - 2, 2, 1.5, 0xe0dbb2);
  buf.ellipse(mx + 2, my + 4, 1.5, 1, 0xe0dbb2);
  // snowy field and pine silhouettes
  buf.rect(0, FIELD_Y, WIN_W, WIN_H - FIELD_Y, 0x2a3b78);
  buf.rect(0, FIELD_Y, WIN_W, 1, 0x8aa0d8);
  for (const px of [5, 11, 37, 43, 28]) {
    const ph = 9 + (px % 5);
    for (let r = 0; r < ph; r++) {
      buf.rect(px - Math.floor(r / 3), FIELD_Y - ph + r, Math.floor(r / 3) * 2 + 1, 1, 0x0e1638);
    }
  }
  // mullions (dark so they read against the lit glass)
  buf.rect(WIN_W / 2 - 1, 0, 2, WIN_H, 0x2f2030);
  buf.rect(0, WIN_H / 2 - 1, WIN_W, 2, 0x2f2030);
  return buf.toTexture();
}

function paintLanternBody(): Texture {
  const buf = new PixelBuffer(14, 20);
  buf.rect(6, 0, 2, 3, 0x2a2a35);
  buf.rect(2, 3, 10, 3, 0x2a2a35);
  buf.rect(3, 3, 8, 1, 0x55556a);
  buf.rect(3, 6, 8, 10, 0x7a4a2a);
  buf.rect(2, 6, 1, 10, 0x2a2a35);
  buf.rect(11, 6, 1, 10, 0x2a2a35);
  buf.rect(1, 16, 12, 3, 0x2a2a35);
  buf.rect(2, 16, 10, 1, 0x55556a);
  return buf.toTexture();
}

function paintLanternBulb(): Texture {
  const buf = new PixelBuffer(8, 10);
  buf.rect(0, 0, 8, 10, 0xffd27a);
  buf.rect(2, 2, 4, 6, 0xfff1b0);
  buf.rect(3, 3, 2, 3, 0xffffff);
  return buf.toTexture();
}

function paintHearth(): Texture {
  const rng = createRng(31);
  const buf = new PixelBuffer(HEARTH_W, HEARTH_H);
  const stones = [0x6a6475, 0x5f5a6e, 0x746e80];
  for (let r = 0; r < 5; r++) {
    const y = 4 + r * 8;
    for (let x = r % 2 === 0 ? 0 : -6; x < 46; x += 14) {
      buf.rect(x, y, 13, 7, stones[Math.floor(rng() * 3)]!);
      buf.rect(x + 12, y, 1, 7, 0x3a3750);
      buf.rect(x, y + 7, 13, 1, 0x3a3750);
      buf.px(x + 1, y + 1, 0x9a94a8);
    }
  }
  buf.rect(0, 0, 46, 5, WOOD_MID);
  buf.rect(0, 0, 46, 1, WOOD_LIGHT);
  buf.rect(0, 4, 46, 1, WOOD_DARK);
  // dark arched opening
  buf.rect(8, 14, 30, 30, 0x1a1218);
  buf.rect(10, 12, 26, 2, 0x1a1218);
  buf.rect(13, 10, 20, 2, 0x1a1218);
  // logs and embers
  buf.rect(12, 38, 22, 4, 0x4a2a22);
  buf.rect(14, 36, 18, 3, 0x5f3a2c);
  for (let x = 14; x < 32; x += 3) buf.px(x, 37, 0xff7a2f);
  return buf.toTexture();
}

/** Stone chimney breast from the mantel up to the tie beam. */
function paintChimney(height: number): Texture {
  const rng = createRng(53);
  const buf = new PixelBuffer(CHIMNEY_W, height);
  const stones = [0x6a6475, 0x5f5a6e, 0x746e80];
  buf.rect(0, 0, CHIMNEY_W, height, 0x3a3750);
  for (let r = 0; r * 8 < height; r++) {
    const y = height - (r + 1) * 8;
    for (let x = r % 2 === 0 ? 0 : -6; x < CHIMNEY_W; x += 14) {
      buf.rect(x, y, 13, 7, stones[Math.floor(rng() * 3)]!);
      buf.px(x + 1, y + 1, 0x9a94a8);
    }
  }
  buf.rect(CHIMNEY_W - 1, 0, 1, height, 0x3a3750);
  buf.rect(0, 0, 1, height, 0x3a3750);
  return buf.toTexture();
}

function paintFlames(): Texture[] {
  const shapes = [
    { main: 20, left: 12, right: 14 },
    { main: 22, left: 10, right: 13 },
    { main: 18, left: 14, right: 10 },
  ];
  return shapes.map((shape, f) => {
    const buf = new PixelBuffer(24, 26);
    const tongue = (cx: number, h: number, w: number, color: number, wob: number): void => {
      for (let r = 0; r < h; r++) {
        const half = Math.round(w * Math.pow(1 - r / h, 0.8));
        const shift = Math.round(Math.sin(r * 0.5 + f * 2 + wob) * 1.2);
        buf.rect(cx - half + shift, 25 - r, half * 2 + 1, 1, color);
      }
    };
    for (const [cx, h, w, wob] of [
      [7, shape.left, 4, 1],
      [17, shape.right, 4, 2],
      [12, shape.main, 7, 0],
    ] as const) {
      tongue(cx, h, w, 0xe8452c, wob);
      tongue(cx, Math.round(h * 0.8), Math.round(w * 0.75), 0xff8a2a, wob);
      tongue(cx, Math.round(h * 0.55), Math.round(w * 0.5), 0xffd35a, wob);
      tongue(cx, Math.round(h * 0.3), Math.round(w * 0.3), 0xfff2b0, wob);
    }
    return buf.toTexture();
  });
}

function paintHay(): Texture {
  const rng = createRng(77);
  const buf = new PixelBuffer(54, 40);
  buf.ellipse(27, 31, 25, 8, 0xa97a2c);
  buf.ellipse(27, 24, 22, 14, 0xc99a3a);
  const colors = [0xe0b84a, 0xf0d070, 0xa97a2c, 0xc99a3a];
  for (let i = 0; i < 110; i++) {
    const x = 6 + rng() * 42;
    const y = 8 + rng() * 26;
    const len = 3 + Math.floor(rng() * 4);
    const color = colors[Math.floor(rng() * colors.length)]!;
    for (let k = 0; k < len; k++) buf.px(x + k, y - k * 0.6, color);
  }
  buf.outline(0x7a5428);
  return buf.toTexture();
}

function paintRug(): Texture {
  const buf = new PixelBuffer(76, 18);
  buf.rect(3, 0, 70, 18, 0xf0dcb0);
  for (let y = 2; y < 16; y++) {
    for (let x = 5; x < 71; x++) buf.px(x, y, ((x + y) >> 2) % 2 === 0 ? 0xb83a4a : 0x9a2d41);
  }
  for (let y = 1; y < 18; y += 2) {
    buf.px(1, y, 0xf0dcb0);
    buf.px(2, y, 0xf0dcb0);
    buf.px(73, y, 0xf0dcb0);
    buf.px(74, y, 0xf0dcb0);
  }
  return buf.toTexture();
}

function paintMoonPatch(): Texture {
  const buf = new PixelBuffer(88, 46);
  buf.ctx.fillStyle = '#ffffff';
  buf.ctx.beginPath();
  buf.ctx.moveTo(10, 0);
  buf.ctx.lineTo(60, 0);
  buf.ctx.lineTo(88, 46);
  buf.ctx.lineTo(34, 46);
  buf.ctx.closePath();
  buf.ctx.fill();
  // mullion shadows inside the patch
  buf.ctx.globalCompositeOperation = 'destination-out';
  buf.rect(33, 0, 3, 46, 0xffffff, 0.8);
  buf.rect(0, 20, 88, 3, 0xffffff, 0.8);
  buf.ctx.globalCompositeOperation = 'source-over';
  return buf.toTexture();
}

/** NIGHT: cozy mountain cabin with a moonlit window, lantern, hearth, hay and a blanket. */
export class NightScene {
  /** Furniture and walls: darkened by the ambient light. */
  readonly back = new Container();
  /** Light sources that must stay bright above the ambient multiply. */
  readonly emissive = new Container();

  private readonly stars: Array<{ sprite: Sprite; phase: number; speed: number }> = [];
  private readonly flakes: Array<{ sprite: Sprite; speed: number; sway: number; phase: number; x: number; y: number }> = [];
  private readonly flames: Texture[];
  private readonly flameSprite: Sprite;
  private readonly bulb: Sprite;
  private readonly winX: number;
  private readonly winY: number;

  /** Light anchors: the light layer places its point lights on these. */
  readonly lanternPos: { x: number; y: number };
  readonly firePos: { x: number; y: number };

  constructor(layout: Layout) {
    const L = layout;
    const rng = createRng(5);
    // Everything hangs off the floor line and the tie beam, so the room keeps its proportions
    // on any screen: hearth and chimney on the left, window above the character, hay on the right.
    const beamY = L.groundY - ROOM_H;
    const winX = L.centerX - WIN_W / 2 + 4;
    const winY = beamY + BEAM_H + 14;
    this.winX = winX;
    this.winY = winY;
    this.lanternPos = { x: L.width - 14, y: beamY + BEAM_H + 34 };
    this.firePos = { x: HEARTH_X + HEARTH_W / 2, y: L.groundY - 18 };
    const lantern = this.lanternPos;
    const fire = this.firePos;

    const add = (target: Container, texture: Texture, x: number, y: number): Sprite => {
      const sprite = new Sprite(texture);
      sprite.position.set(x, y);
      target.addChild(sprite);
      return sprite;
    };

    add(this.back, paintWall(L), 0, 0);
    add(this.back, paintFloor(L), 0, L.groundY);
    const chimneyH = ROOM_H - BEAM_H - HEARTH_H + 2;
    add(this.back, paintChimney(chimneyH), HEARTH_X + (HEARTH_W - CHIMNEY_W) / 2, beamY + BEAM_H);
    add(this.back, paintWindowFrame(), winX - 4, winY - 4);
    add(this.back, paintSill(), winX - 8, winY + WIN_H + 2);
    add(this.back, paintHearth(), HEARTH_X, L.groundY - HEARTH_H + 2);
    add(this.back, paintHay(), L.width - 44, L.groundY - 24);
    add(this.back, paintRug(), L.centerX - 38, L.groundY + 4);
    // lantern rope (from the tie beam) + body
    const ropeTop = beamY + BEAM_H;
    const ropeLength = lantern.y - 10 - ropeTop;
    const rope = new PixelBuffer(1, ropeLength);
    rope.rect(0, 0, 1, ropeLength, 0x2a1c26);
    add(this.back, rope.toTexture(), lantern.x, ropeTop);
    add(this.back, paintLanternBody(), lantern.x - 7, lantern.y - 10);

    // --- emissive layer ---
    const moonPatch = add(this.emissive, paintMoonPatch(), winX - 12, L.groundY);
    moonPatch.tint = 0x9fb4ff;
    moonPatch.alpha = 0.1;
    moonPatch.blendMode = 'add';

    add(this.emissive, paintGlass(), winX, winY);

    const sparkle = createSparkleTexture();
    for (let i = 0; i < 6; i++) {
      const sprite = add(
        this.emissive,
        sparkle,
        winX + 4 + Math.floor(rng() * (WIN_W - 8)),
        winY + 3 + Math.floor(rng() * (FIELD_Y - 20)),
      );
      sprite.tint = 0xdfe8ff;
      this.stars.push({ sprite, phase: rng() * Math.PI * 2, speed: 1 + rng() * 2 });
    }

    const dot = createDotTexture();
    for (let i = 0; i < 30; i++) {
      const sprite = new Sprite(dot);
      sprite.tint = 0xeaf2ff;
      const size = rng() < 0.3 ? 2 : 1;
      sprite.scale.set(size);
      this.emissive.addChild(sprite);
      this.flakes.push({
        sprite,
        speed: 8 + rng() * 14,
        sway: 2 + rng() * 3,
        phase: rng() * Math.PI * 2,
        x: rng() * WIN_W,
        y: rng() * FIELD_Y,
      });
    }

    this.flames = paintFlames();
    this.flameSprite = add(this.emissive, this.flames[0]!, fire.x - 12, fire.y - 14);
    this.bulb = add(this.emissive, paintLanternBulb(), lantern.x - 4, lantern.y - 4);
  }

  /** `lanternLevel` / `fireLevel` come from the point lights' flicker. */
  update(t: number, dt: number, lanternLevel: number, fireLevel: number): void {
    for (const star of this.stars) {
      star.sprite.alpha = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(t * star.speed + star.phase));
    }
    for (const flake of this.flakes) {
      flake.y += flake.speed * dt;
      if (flake.y > FIELD_Y) {
        flake.y = 0;
        flake.x = Math.random() * WIN_W;
      }
      const x = flake.x + Math.sin(t * 0.8 + flake.phase) * flake.sway;
      flake.sprite.position.set(
        this.winX + Math.max(0, Math.min(WIN_W - 2, Math.round(x))),
        this.winY + Math.round(flake.y),
      );
    }
    this.flameSprite.texture = this.flames[Math.floor(t * 9) % this.flames.length]!;
    this.flameSprite.alpha = Math.min(1, 0.55 + 0.45 * fireLevel);
    this.bulb.alpha = Math.min(1, 0.6 + 0.4 * lanternLevel);
  }
}
