// Generates placeholder PWA icons (pixel-art goat head) with zero dependencies.
// Run: npm run icons   -> writes PNGs to public/icons/
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const GRID = 32;

const hex = (n) => [(n >> 16) & 255, (n >> 8) & 255, n & 255];

// --- tiny PNG encoder ---
const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const body = Buffer.concat([Buffer.from(type), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), body.length + 4);
  return out;
};
const encodePng = (size, rgb) => {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB, opaque (iOS dislikes transparent home-screen icons)
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    rgb.copy(raw, y * (size * 3 + 1) + 1, y * size * 3, (y + 1) * size * 3);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};

// --- 32x32 art ---
const goat = new Array(GRID * GRID).fill(null);
const set = (x, y, color) => {
  if (x >= 0 && y >= 0 && x < GRID && y < GRID) goat[y * GRID + x] = color;
};
const ellipse = (cx, cy, rx, ry, color) => {
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1) set(x, y, color);
    }
  }
};

const FUR = 0xf6f1e8;
const SHADE = 0xd7cde0;
ellipse(7, 14, 4, 2, FUR);
ellipse(25, 14, 4, 2, FUR);
ellipse(16, 17, 9, 9, FUR);
for (let y = 0; y < GRID; y++) {
  for (let x = 20; x < GRID; x++) if (goat[y * GRID + x] === FUR && x >= 20) set(x, y, SHADE);
}
ellipse(7, 14, 2, 1, 0xf2a8b0);
ellipse(25, 14, 2, 1, 0xf2a8b0);
ellipse(16, 21, 5, 3.5, 0xfffaf0);
for (const [x, y] of [[11, 9], [10, 7], [10, 5], [11, 3], [13, 3]]) {
  set(x, y, 0xdcc08a);
  set(x + 1, y, 0xdcc08a);
  set(31 - x, y, 0xdcc08a);
  set(30 - x, y, 0xdcc08a);
}
for (const ex of [11, 19]) {
  for (let x = 0; x < 3; x++) {
    set(ex + x, 15, 0xf2d36b);
    set(ex + x, 16, 0xf2d36b);
  }
  set(ex, 16, 0x2a1f3a);
  set(ex + 1, 16, 0x2a1f3a);
  set(ex + 2, 16, 0x2a1f3a);
}
set(14, 20, 0x6c6190);
set(17, 20, 0x6c6190);
for (const [x, y] of [[15, 24], [16, 24], [15, 25], [16, 25], [15, 26]]) set(x, y, 0xf0e8f6);

// 1px colored outline around the goat only
const outlined = goat.slice();
for (let y = 0; y < GRID; y++) {
  for (let x = 0; x < GRID; x++) {
    if (goat[y * GRID + x] !== null) continue;
    const near = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].some(
      ([nx, ny]) => nx >= 0 && ny >= 0 && nx < GRID && ny < GRID && goat[ny * GRID + nx] !== null,
    );
    if (near) outlined[y * GRID + x] = 0x4a3f78;
  }
}

// background: night sky bands + snowy peak (extends past the goat for maskable padding)
const bg = (u, v) => {
  const cu = Math.min(GRID - 1, Math.max(0, u));
  const cv = Math.min(GRID - 1, Math.max(0, v));
  const peak = 22 + Math.abs(cu - 16) * 0.9;
  if (cv > peak) return cv > peak + 1 ? 0x3a4f86 : 0xf2f8ff;
  return [0x1b2340, 0x232e58, 0x2c3a6c][Math.min(2, Math.floor(cv / 11))];
};

// margin: fraction of the icon kept as padding around the 32x32 art
const render = (size, margin) => {
  const rgb = Buffer.alloc(size * size * 3);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = Math.floor(((x + 0.5) / size - margin) / (1 - 2 * margin) * GRID);
      const v = Math.floor(((y + 0.5) / size - margin) / (1 - 2 * margin) * GRID);
      const inside = u >= 0 && v >= 0 && u < GRID && v < GRID;
      const color = (inside && outlined[v * GRID + u]) ?? bg(u, v);
      rgb.set(hex(color), (y * size + x) * 3);
    }
  }
  return encodePng(size, rgb);
};

mkdirSync('public/icons', { recursive: true });
const targets = [
  ['public/icons/apple-touch-icon.png', 180, 0.06],
  ['public/icons/icon-192.png', 192, 0.06],
  ['public/icons/icon-512.png', 512, 0.06],
  ['public/icons/icon-512-maskable.png', 512, 0.2],
  ['public/icons/favicon-32.png', 32, 0.04],
];
for (const [path, size, margin] of targets) {
  writeFileSync(path, render(size, margin));
  console.log('wrote', path);
}
