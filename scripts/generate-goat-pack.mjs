// Generates the PLACEHOLDER art + manifest for the "mountain-goat" character pack and the
// generic item catalog, drawn from code (palette + pixels). The runtime only reads the
// resulting files, so hand-made PNGs with the same names replace these with no code change.
//
//   npm run generate:goat                 -> writes public/characters/mountain-goat and public/items
//   node scripts/generate-goat-pack.mjs --preview <file.png>   -> also writes a zoomed contact sheet
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { Raster, strip } from './lib/raster.mjs';

const OUT = 'public/characters/mountain-goat';
const ITEMS_OUT = 'public/items';
const FRAME = 64;

const C = {
  fur: 0xf6f1e8,
  furShade: 0xd7cde0,
  belly: 0xfffbf2,
  snout: 0xfffaf0,
  hoof: 0x4a3f5c,
  hoofLight: 0x6a5f80,
  earInner: 0xf2a8b0,
  eye: 0xf2d36b,
  pupil: 0x2a1f3a,
  nose: 0x6c6190,
  mouth: 0x7a5a6a,
  beard: 0xf0e8f6,
  beardShade: 0xcfc4dc,
  outline: 0x4a3f78,
};

// ---------------------------------------------------------------- stages
const STAGES = {
  kid: {
    minAltitude: 0,
    scale: 0.8,
    horn: { points: [[27, 11], [26, 9], [26, 8]], width: 2, color: 0xdcc08a, shade: 0xb8955a, tip: 0xf6e8c0 },
  },
  young: {
    minAltitude: 700,
    scale: 0.9,
    horn: { points: [[26, 11], [25, 9], [24, 7], [24, 5], [25, 4], [27, 4]], width: 2, color: 0xdcc08a, shade: 0xb8955a, tip: 0xf6e8c0 },
  },
  adult: {
    minAltitude: 3000,
    scale: 0.97,
    horn: { points: [[26, 11], [24, 9], [22, 7], [21, 4], [21, 1], [23, 0], [25, 0]], width: 3, color: 0xc9a86a, shade: 0x9a7a44, tip: 0xf0dcae },
  },
  legendary: {
    minAltitude: 8250,
    scale: 1,
    horn: { points: [[26, 11], [23, 10], [20, 8], [18, 5], [17, 2], [19, 0], [21, 0]], width: 3, color: 0xf2c94c, shade: 0xc99a2a, tip: 0xfff3b0, sparkle: true },
  },
};

// ------------------------------------------------------------ animations
// by = upper-body vertical offset, hd = extra head offset, arms = 'down' | 'up'
const ANIMATIONS = {
  idle: {
    fps: 3,
    loop: true,
    expression: 'neutral',
    canBlink: true,
    poses: [{ by: 0, hd: 0 }, { by: -1, hd: 0 }, { by: -1, hd: -1 }, { by: 0, hd: 0 }],
  },
  celebrate: {
    fps: 3.333,
    loop: false,
    next: 'idle',
    expression: 'happy',
    hop: true,
    poses: [{ by: 3, hd: 0, arms: 'down' }, { by: -2, hd: -1, arms: 'up' }, { by: 2, hd: 0, arms: 'down' }],
  },
  eat: {
    fps: 5,
    loop: true,
    expression: 'eating',
    poses: [{ by: 0, hd: 0 }, { by: 0, hd: 1 }],
  },
  sleep: {
    fps: 1.5,
    loop: true,
    expression: 'sleepy',
    closedEyes: true,
    poses: [{ by: 2, hd: 4 }, { by: 2, hd: 5 }],
  },
};

// ------------------------------------------------------------ body art
/** Draws in "design space" (feet at y=63, center x=32) scaled around the feet. */
function makeDrawer(s) {
  const T = (x, y) => [32 + (x - 32) * s, 63 + (y - 63) * s];
  return {
    T,
    rect(r, x, y, w, h, c, a = 1) {
      const [px, py] = T(x, y);
      r.rect(Math.round(px), Math.round(py), Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s)), c, a);
    },
    ellipse(r, cx, cy, rx, ry, c, a = 1) {
      const [px, py] = T(cx, cy);
      r.ellipse(px, py, Math.max(0.6, rx * s), Math.max(0.6, ry * s), c, a);
    },
    px(r, x, y, c, a = 1) {
      const [px, py] = T(x, y);
      r.px(Math.round(px), Math.round(py), c, a);
    },
  };
}

function strokeHorn(d, r, horn) {
  const { points, width, color, shade, tip, sparkle } = horn;
  const drawAt = (x, y, w, c, mirror) => {
    const left = mirror ? 64 - x - w : x;
    d.rect(r, left, y, w, 1, c);
    d.px(r, mirror ? left + w - 1 : left, y, shade);
  };
  for (const mirror of [false, true]) {
    for (let i = 0; i < points.length - 1; i++) {
      const [x0, y0] = points[i];
      const [x1, y1] = points[i + 1];
      const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
      for (let k = 0; k <= steps; k++) {
        const x = Math.round(x0 + ((x1 - x0) * k) / steps);
        const y = Math.round(y0 + ((y1 - y0) * k) / steps);
        const w = i < points.length / 2 ? width : Math.max(1, width - 1);
        drawAt(x, y, w, color, mirror);
      }
    }
    const [tx, ty] = points[points.length - 1];
    drawAt(tx, ty, 1, tip, mirror);
    if (sparkle) {
      const px = mirror ? 63 - tx : tx;
      d.px(r, px, ty - 1, 0xffffff);
      d.px(r, px + (mirror ? 1 : -1), ty, 0xfff3b0);
    }
  }
}

function drawBody(stage, pose) {
  const s = STAGES[stage].scale;
  const d = makeDrawer(s);
  const { by, hd } = pose;
  const up = pose.arms === 'up';

  const fur = new Raster(FRAME, FRAME);
  d.rect(fur, 22, 50, 7, 10, C.fur); // legs
  d.rect(fur, 35, 50, 7, 10, C.fur);
  d.ellipse(fur, 32, 40 + by, 13, 12, C.fur); // torso
  if (up) {
    d.ellipse(fur, 14, 29 + by, 3.3, 8, C.fur);
    d.ellipse(fur, 50, 29 + by, 3.3, 8, C.fur);
  } else {
    d.ellipse(fur, 17, 39 + by, 3.5, 9, C.fur);
    d.ellipse(fur, 47, 39 + by, 3.5, 9, C.fur);
  }
  d.rect(fur, 28, 27 + by, 8, 5 + hd, C.fur); // neck
  d.ellipse(fur, 32, 19 + by + hd, 10, 9, C.fur); // head
  d.ellipse(fur, 32, 42 + by, 7, 8, C.belly);
  d.ellipse(fur, 32, 24 + by + hd, 6, 4.5, C.snout);

  const [shadeX] = d.T(37, 0);
  const sx = Math.round(shadeX);
  fur.shade(sx, 0, FRAME, FRAME, C.furShade);
  for (let y = 0; y < FRAME; y++) fur.shade(sx - 2 + (y & 1), y, sx - 1 + (y & 1), y + 1, C.furShade);
  const [, chinY] = d.T(0, 27 + by + hd);
  fur.shade(0, Math.round(chinY), FRAME, Math.round(chinY) + 2, C.furShade, 0.6);

  const body = new Raster(FRAME, FRAME);
  body.blit(fur, 0, 0);
  d.rect(body, 21, 60, 9, 3, C.hoof); // hooves
  d.rect(body, 34, 60, 9, 3, C.hoof);
  d.rect(body, 22, 60, 7, 1, C.hoofLight);
  d.rect(body, 35, 60, 7, 1, C.hoofLight);
  if (up) {
    d.ellipse(body, 13, 20 + by, 3, 2.5, C.hoof);
    d.ellipse(body, 51, 20 + by, 3, 2.5, C.hoof);
  } else {
    d.ellipse(body, 17, 48 + by, 3, 2.5, C.hoof);
    d.ellipse(body, 47, 48 + by, 3, 2.5, C.hoof);
  }
  strokeHorn({ ...d, rect: (r, x, y, w, h, c) => d.rect(r, x, y + by + hd, w, h, c), px: (r, x, y, c) => d.px(r, x, y + by + hd, c) }, body, STAGES[stage].horn);
  body.outline(C.outline);
  return body;
}

function anchorsFor(stage, pose) {
  const s = STAGES[stage].scale;
  const d = makeDrawer(s);
  const { by, hd } = pose;
  const up = pose.arms === 'up';
  const at = (x, y) => d.T(x, y).map(Math.round);
  return {
    head: at(32, 20 + by + hd),
    betweenHorns: at(32, 11 + by + hd),
    headTop: at(32, 10 + by + hd),
    neck: at(32, 29 + by + Math.round(hd / 2)),
    torso: at(32, 40 + by),
    hand: up ? at(51, 20 + by) : at(47, 48 + by),
    legs: at(32, 51),
    feet: at(32, 62),
    earL: at(22, 17 + by + hd),
    earR: at(42, 17 + by + hd),
    chin: at(32, 28 + by + hd),
  };
}

// ----------------------------------------------------------- expressions
const EXPR_W = 24;
const EXPR_H = 16;
const EXPR_PIVOT = [12, 6]; // = the `head` anchor (face center)
const EYE_L = [7, 5];
const EYE_R = [17, 5];

function nostrils(r) {
  r.px(10, 9, C.nose);
  r.px(13, 9, C.nose);
}

function eyeOpen(r, [cx, cy], lookUp = 0) {
  r.rect(cx - 2, cy - 1, 5, 2, C.eye);
  r.rect(cx - 1, cy - 2, 3, 4, C.eye);
  r.rect(cx - 1, cy - lookUp, 3, 1, C.pupil);
  r.px(cx - 1, cy - 1, 0xffffff);
}

const eyeClosedLine = (r, [cx, cy]) => r.rect(cx - 2, cy, 5, 1, C.pupil);

function eyeArc(r, [cx, cy]) {
  r.px(cx - 2, cy + 1, C.pupil);
  r.rect(cx - 1, cy, 3, 1, C.pupil);
  r.px(cx + 2, cy + 1, C.pupil);
}

function eyeHeart(r, [cx, cy]) {
  const pink = 0xff6b9a;
  r.rect(cx - 2, cy - 1, 2, 2, pink);
  r.rect(cx + 1, cy - 1, 2, 2, pink);
  r.rect(cx - 2, cy, 5, 1, pink);
  r.rect(cx - 1, cy + 1, 3, 1, pink);
  r.px(cx, cy + 2, pink);
  r.px(cx - 1, cy - 1, 0xffd0e0);
}

const smile = (r) => {
  r.px(10, 12, C.mouth);
  r.rect(11, 13, 2, 1, C.mouth);
  r.px(13, 12, C.mouth);
};

const blush = (r) => {
  r.ellipse(5, 9, 1.8, 1.2, 0xf5a0b0, 0.6);
  r.ellipse(19, 9, 1.8, 1.2, 0xf5a0b0, 0.6);
};

function expression(id, variant = 'normal', frame = 0) {
  const r = new Raster(EXPR_W, EXPR_H);
  nostrils(r);
  const blink = variant === 'blink';
  const eyes = (open, closed) => {
    for (const e of [EYE_L, EYE_R]) (blink ? closed : open)(r, e);
  };
  switch (id) {
    case 'neutral':
      eyes((rr, e) => eyeOpen(rr, e), eyeClosedLine);
      smile(r);
      break;
    case 'happy':
      eyes(eyeArc, eyeArc);
      for (const x of [9, 10, 11, 12, 13, 14]) r.px(x, x === 9 || x === 14 ? 11 : x === 10 || x === 13 ? 12 : 13, C.mouth);
      blush(r);
      break;
    case 'sleepy':
      eyes(
        (rr, [cx, cy]) => {
          rr.rect(cx - 2, cy, 5, 1, C.eye);
          rr.px(cx, cy, C.pupil);
          rr.rect(cx - 2, cy - 1, 5, 1, C.pupil);
        },
        (rr, [cx, cy]) => {
          rr.rect(cx - 2, cy, 5, 1, C.pupil);
          rr.px(cx - 2, cy + 1, C.pupil);
          rr.px(cx + 2, cy + 1, C.pupil);
        },
      );
      r.rect(11, 12, 2, 1, C.mouth);
      break;
    case 'sad':
      eyes((rr, e) => eyeOpen(rr, e, 2), eyeClosedLine);
      r.px(5, 3, C.pupil);
      r.px(6, 2, C.pupil);
      r.px(18, 2, C.pupil);
      r.px(19, 3, C.pupil);
      r.px(4, 8, 0x8ec9f5);
      r.px(4, 9, 0x8ec9f5);
      r.px(10, 13, C.mouth);
      r.rect(11, 12, 2, 1, C.mouth);
      r.px(13, 13, C.mouth);
      break;
    case 'love':
      eyes(eyeHeart, eyeHeart);
      smile(r);
      blush(r);
      break;
    case 'eating':
      eyes(eyeArc, eyeArc);
      if (frame === 0) {
        r.rect(10, 12, 4, 1, C.mouth);
        r.ellipse(6, 10, 1.5, 1.2, C.snout, 0.9);
        r.ellipse(18, 10, 1.5, 1.2, C.snout, 0.9);
      } else {
        r.rect(11, 12, 2, 2, 0x7a3a4a);
        r.px(11, 13, C.earInner);
      }
      break;
    case 'surprised':
      eyes(
        (rr, [cx, cy]) => {
          rr.ellipse(cx + 0.5, cy + 0.5, 3, 3, 0xffffff);
          rr.ellipse(cx + 0.5, cy + 0.5, 3, 3, C.eye, 0.35);
          rr.rect(cx, cy, 2, 1, C.pupil);
        },
        eyeClosedLine,
      );
      r.ellipse(12, 13, 1.5, 2, 0x7a3a4a);
      break;
    default:
      throw new Error(`unknown expression ${id}`);
  }
  return r;
}

const EXPRESSIONS = {
  neutral: { frames: 1, blink: true },
  happy: { frames: 1, blink: false },
  sleepy: { frames: 1, blink: true },
  sad: { frames: 1, blink: true },
  love: { frames: 1, blink: false },
  eating: { frames: 2, fps: 5, blink: false },
  surprised: { frames: 1, blink: true },
};

// ---------------------------------------------------------------- parts
function earLeft() {
  const r = new Raster(10, 7);
  r.ellipse(6, 3, 4.5, 2.2, C.fur);
  r.ellipse(3, 4, 3, 2, C.fur);
  r.ellipse(5, 3, 2.5, 1, C.earInner);
  r.shade(0, 4, 10, 7, C.furShade, 0.7);
  r.outline(C.outline);
  return r;
}

function beard() {
  const r = new Raster(6, 9);
  for (const [x0, x1, y] of [[1, 4, 0], [1, 4, 1], [2, 3, 2], [2, 3, 3], [2, 3, 4], [2, 2, 5]]) r.rect(x0, y, x1 - x0 + 1, 1, C.beard);
  r.px(4, 0, C.beardShade);
  r.px(4, 1, C.beardShade);
  r.px(3, 3, C.beardShade);
  r.px(3, 4, C.beardShade);
  r.outline(C.outline);
  return r;
}

// ----------------------------------------------------------------- items
const darken = (c, k = 0.7) => (Math.round(((c >> 16) & 255) * k) << 16) | (Math.round(((c >> 8) & 255) * k) << 8) | Math.round((c & 255) * k);

function beanie() {
  const r = new Raster(14, 12);
  r.ellipse(7, 7, 6, 5, 0x4a78d0);
  r.shade(8, 0, 14, 12, 0x3a5ca8, 0.9);
  r.rect(1, 8, 12, 3, 0x3a5ca8);
  r.rect(1, 9, 12, 1, 0x7aa0ea);
  r.ellipse(7, 1.5, 2, 1.8, 0xf6f1e8);
  r.outline(darken(0x3a5ca8, 0.6));
  return r;
}

function scarf() {
  const r = new Raster(22, 12);
  r.rect(1, 0, 20, 4, 0xd24a4a);
  r.rect(1, 0, 20, 1, 0xf07a6a);
  r.rect(15, 3, 5, 3, 0xa83a3a);
  r.rect(15, 5, 4, 6, 0xd24a4a);
  r.rect(15, 7, 4, 1, 0xf6f1e8);
  r.rect(15, 9, 4, 1, 0xf6f1e8);
  r.outline(darken(0xa83a3a, 0.6));
  return r;
}

function sweater() {
  const r = new Raster(30, 24);
  r.ellipse(15, 12, 13, 11, 0x4aa86a);
  for (let y = 4; y < 22; y += 5) r.shade(0, y, 30, y + 2, 0x7ad49a, 0.6);
  r.shade(20, 0, 30, 24, 0x2f8a52, 0.8);
  r.rect(10, 1, 10, 3, 0x2f8a52);
  r.outline(darken(0x2f8a52, 0.55));
  return r;
}

function pants() {
  const r = new Raster(22, 11);
  r.rect(0, 0, 9, 9, 0x8a6a4a);
  r.rect(13, 0, 9, 9, 0x8a6a4a);
  r.rect(0, 0, 22, 2, 0x6a4f35);
  r.shade(6, 0, 9, 9, 0x6a4f35, 0.7);
  r.shade(19, 0, 22, 9, 0x6a4f35, 0.7);
  r.outline(darken(0x6a4f35, 0.55));
  return r;
}

function boots() {
  const r = new Raster(24, 7);
  for (const x of [0, 13]) {
    r.rect(x, 1, 11, 6, 0x8a5a3a);
    r.rect(x, 1, 11, 2, 0xb07a52);
    r.rect(x, 6, 11, 1, 0x4a2f22);
  }
  r.outline(darken(0x4a2f22, 0.8));
  return r;
}

function flower() {
  const r = new Raster(7, 11);
  r.rect(3, 4, 1, 7, 0x4f9a52);
  r.px(4, 7, 0x78c25c);
  r.rect(2, 1, 3, 3, 0xf58aa8);
  r.px(3, 0, 0xf58aa8);
  r.px(3, 4, 0xf58aa8);
  r.px(1, 2, 0xf58aa8);
  r.px(5, 2, 0xf58aa8);
  r.px(3, 2, 0xfff2a8);
  r.outline(darken(0x4f9a52, 0.6));
  return r;
}

function bellCollar() {
  const r = new Raster(12, 8);
  r.rect(0, 0, 12, 2, 0xc03a3a);
  r.rect(0, 0, 12, 1, 0xe0645a);
  r.ellipse(6, 5, 2.5, 2.5, 0xf2c94c);
  r.px(5, 4, 0xfff3b0);
  r.px(6, 7, 0xc99a2a);
  r.outline(darken(0x8a2a2a, 0.7));
  return r;
}

const ITEMS = [
  { id: 'beanie-blue', slot: 'head', anchor: 'betweenHorns', compatibleWith: ['*'], art: beanie, pivot: [7, 11], nameKey: 'item.beanieBlue', unlock: { type: 'coins', cost: 80 } },
  { id: 'scarf-red', slot: 'neck', anchor: 'neck', compatibleWith: ['*'], art: scarf, pivot: [11, 2], nameKey: 'item.scarfRed', unlock: { type: 'coins', cost: 60 }, spring: { stiffness: 90, damping: 9, wind: 1.2 } },
  { id: 'sweater-green', slot: 'torso', anchor: 'torso', compatibleWith: ['*'], art: sweater, pivot: [15, 12], nameKey: 'item.sweaterGreen', unlock: { type: 'coins', cost: 150 } },
  { id: 'pants-brown', slot: 'legs', anchor: 'legs', compatibleWith: ['*'], art: pants, pivot: [11, 0], nameKey: 'item.pantsBrown', unlock: { type: 'coins', cost: 100 } },
  { id: 'boots-brown', slot: 'feet', anchor: 'feet', compatibleWith: ['*'], art: boots, pivot: [12, 6], nameKey: 'item.bootsBrown', unlock: { type: 'coins', cost: 90 } },
  { id: 'flower-pink', slot: 'hand', anchor: 'hand', compatibleWith: ['*'], art: flower, pivot: [3, 10], nameKey: 'item.flowerPink', unlock: { type: 'coins', cost: 30 } },
  { id: 'bell-collar', slot: 'neck', anchor: 'neck', compatibleWith: ['mountain-goat'], art: bellCollar, pivot: [6, 1], nameKey: 'item.bellCollar', unlock: { type: 'achievement', id: 'first-week' }, spring: { stiffness: 120, damping: 7, wind: 0.5 } },
];

// ----------------------------------------------------------------- write
const write = (path, data) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, data);
};

const sheets = [];

const anchorData = {};
for (const stage of Object.keys(STAGES)) {
  anchorData[stage] = {};
  for (const [animId, anim] of Object.entries(ANIMATIONS)) {
    const frames = anim.poses.map((pose) => drawBody(stage, pose));
    anchorData[stage][animId] = anim.poses.map((pose) => anchorsFor(stage, pose));
    write(`${OUT}/bodies/${stage}/${animId}.png`, strip(frames).toPng());
    if (animId === 'idle') sheets.push(frames[0]);
  }
}

const exprFiles = [];
for (const [id, def] of Object.entries(EXPRESSIONS)) {
  const frames = Array.from({ length: def.frames }, (_, f) => expression(id, 'normal', f));
  write(`${OUT}/expressions/${id}.png`, strip(frames).toPng());
  exprFiles.push(frames[0]);
  if (def.blink) write(`${OUT}/expressions/${id}-blink.png`, expression(id, 'blink').toPng());
}

const left = earLeft();
write(`${OUT}/parts/ear-left.png`, left.toPng());
write(`${OUT}/parts/ear-right.png`, left.flipX().toPng());
write(`${OUT}/parts/beard.png`, beard().toPng());

const manifest = {
  schemaVersion: 1,
  id: 'mountain-goat',
  nameKey: 'character.mountainGoat',
  unlock: { type: 'default' },
  frame: { width: FRAME, height: FRAME },
  expressionPivot: EXPR_PIVOT,
  anchors: ['head', 'betweenHorns', 'headTop', 'neck', 'torso', 'hand', 'legs', 'feet', 'earL', 'earR', 'chin'],
  stages: Object.entries(STAGES).map(([id, st]) => ({ id, minAltitude: st.minAltitude, itemScale: st.scale })),
  slots: {
    legs: { layer: 'clothing', z: 0 },
    feet: { layer: 'clothing', z: 1 },
    torso: { layer: 'clothing', z: 2 },
    neck: { layer: 'clothing', z: 3 },
    head: { layer: 'accessory', z: 0 },
    hand: { layer: 'accessory', z: 1 },
  },
  animations: Object.fromEntries(
    Object.entries(ANIMATIONS).map(([id, a]) => {
      const { poses, ...rest } = a;
      return [id, { frames: poses.length, ...rest }];
    }),
  ),
  expressions: EXPRESSIONS,
  parts: [
    { id: 'ear-left', file: 'parts/ear-left.png', pivot: [9, 3], anchor: 'earL', layer: 'body', spring: { stiffness: 140, damping: 8, wind: 0.6 } },
    { id: 'ear-right', file: 'parts/ear-right.png', pivot: [0, 3], anchor: 'earR', layer: 'body', spring: { stiffness: 140, damping: 8, wind: 0.6 } },
    { id: 'beard', file: 'parts/beard.png', pivot: [3, 0], anchor: 'chin', layer: 'body', spring: { stiffness: 110, damping: 7, wind: 1 } },
  ],
  anchorData,
};
write(`${OUT}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);

const catalog = {
  schemaVersion: 1,
  items: ITEMS.map(({ art, ...item }) => ({ ...item, file: `generic/${item.id}.png` })),
};
for (const item of ITEMS) write(`${ITEMS_OUT}/generic/${item.id}.png`, item.art().toPng());
write(`${ITEMS_OUT}/items.json`, `${JSON.stringify(catalog, null, 2)}\n`);

const previewIdx = process.argv.indexOf('--preview');
if (previewIdx !== -1) {
  const zoom = 5;
  const rows = [sheets, exprFiles, [left, beard(), ...ITEMS.map((i) => i.art())]];
  const w = 64 * 8;
  const h = rows.length * 70;
  const out = new Raster(w, h);
  out.rect(0, 0, w, h, 0x8fb4d9);
  rows.forEach((row, ri) => {
    let x = 2;
    for (const r of row) {
      out.blit(r, x, ri * 70 + 2);
      x += r.width + 4;
    }
  });
  write(process.argv[previewIdx + 1], out.scaled(zoom).toPng());
}

console.log('goat pack + items written');
