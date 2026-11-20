import type { Texture } from 'pixi.js';
import { PixelBuffer } from './pixel';

function paintAlpha(size: [number, number], alphaAt: (x: number, y: number) => number): Texture {
  const [w, h] = size;
  const buf = new PixelBuffer(w, h);
  const img = buf.ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      img.data[i] = 255;
      img.data[i + 1] = 255;
      img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(alphaAt(x, y) * 255);
    }
  }
  buf.ctx.putImageData(img, 0, 0);
  return buf.toTexture();
}

/** White radial glow in discrete bands (pixel-art friendly). Tint it for color. */
export function createGlowTexture(radius: number, bands = 7): Texture {
  return paintAlpha([radius * 2, radius * 2], (x, y) => {
    const d = Math.hypot(x + 0.5 - radius, y + 0.5 - radius) / radius;
    if (d >= 1) return 0;
    const band = Math.ceil((1 - d) * bands) / bands;
    return band * band;
  });
}

/** Thin white ring used by the completion pulse. */
export function createRingTexture(radius: number, thickness = 3): Texture {
  return paintAlpha([radius * 2, radius * 2], (x, y) => {
    const d = Math.hypot(x + 0.5 - radius, y + 0.5 - radius);
    return d <= radius && d >= radius - thickness ? 1 : 0;
  });
}

/** Vertical light beam: bright center, soft edges, fades along its length. */
export function createBeamTexture(w: number, h: number): Texture {
  return paintAlpha([w, h], (x, y) => {
    const across = 1 - Math.abs(2 * ((x + 0.5) / w) - 1);
    const along = 1 - y / h;
    return Math.floor(across * along * 4) / 4;
  });
}

/** Plain white shapes for particles (tint them). */
export function createDotTexture(): Texture {
  return paintAlpha([1, 1], () => 1);
}

export function createSparkleTexture(): Texture {
  return paintAlpha([3, 3], (x, y) => ((x === 1 || y === 1) ? 1 : 0));
}
