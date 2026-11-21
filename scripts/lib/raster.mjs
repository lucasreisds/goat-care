// Tiny RGBA raster used to draw placeholder pixel art from code (no canvas needed).
import { encodePng } from './png.mjs';

const rgb = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];

export class Raster {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.data = new Uint8ClampedArray(width * height * 4);
  }

  inside(x, y) {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  alphaAt(x, y) {
    return this.inside(x, y) ? this.data[(y * this.width + x) * 4 + 3] : 0;
  }

  /** Source-over blend of one pixel. */
  px(x, y, color, alpha = 1) {
    x = Math.round(x);
    y = Math.round(y);
    if (!this.inside(x, y)) return;
    const [r, g, b] = rgb(color);
    const i = (y * this.width + x) * 4;
    const da = this.data[i + 3] / 255;
    const oa = alpha + da * (1 - alpha);
    if (oa <= 0) return;
    this.data[i] = (r * alpha + this.data[i] * da * (1 - alpha)) / oa;
    this.data[i + 1] = (g * alpha + this.data[i + 1] * da * (1 - alpha)) / oa;
    this.data[i + 2] = (b * alpha + this.data[i + 2] * da * (1 - alpha)) / oa;
    this.data[i + 3] = oa * 255;
  }

  rect(x, y, w, h, color, alpha = 1) {
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) this.px(x + xx, y + yy, color, alpha);
  }

  ellipse(cx, cy, rx, ry, color, alpha = 1) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.px(x, y, color, alpha);
      }
    }
  }

  /** Draws another raster on top of this one at (dx, dy). */
  blit(src, dx, dy) {
    for (let y = 0; y < src.height; y++) {
      for (let x = 0; x < src.width; x++) {
        const i = (y * src.width + x) * 4;
        const a = src.data[i + 3];
        if (a === 0) continue;
        this.px(dx + x, dy + y, (src.data[i] << 16) | (src.data[i + 1] << 8) | src.data[i + 2], a / 255);
      }
    }
  }

  /** Paints `color` ONLY over already-opaque pixels (keeps the silhouette). */
  shade(x0, y0, x1, y1, color, alpha = 1) {
    const [r, g, b] = rgb(color);
    for (let y = Math.max(0, y0); y < Math.min(this.height, y1); y++) {
      for (let x = Math.max(0, x0); x < Math.min(this.width, x1); x++) {
        const i = (y * this.width + x) * 4;
        if (this.data[i + 3] === 0) continue;
        this.data[i] += (r - this.data[i]) * alpha;
        this.data[i + 1] += (g - this.data[i + 1]) * alpha;
        this.data[i + 2] += (b - this.data[i + 2]) * alpha;
      }
    }
  }

  /** Colored 1px contour (hi-bit style, never pure black). */
  outline(color) {
    const src = new Uint8ClampedArray(this.data);
    const a = (x, y) => (x < 0 || y < 0 || x >= this.width || y >= this.height ? 0 : src[(y * this.width + x) * 4 + 3]);
    const [r, g, b] = rgb(color);
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (a(x, y) > 0) continue;
        if (a(x - 1, y) > 0 || a(x + 1, y) > 0 || a(x, y - 1) > 0 || a(x, y + 1) > 0) {
          const i = (y * this.width + x) * 4;
          this.data[i] = r;
          this.data[i + 1] = g;
          this.data[i + 2] = b;
          this.data[i + 3] = 255;
        }
      }
    }
  }

  flipX() {
    const out = new Raster(this.width, this.height);
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const s = (y * this.width + x) * 4;
        const d = (y * this.width + (this.width - 1 - x)) * 4;
        for (let k = 0; k < 4; k++) out.data[d + k] = this.data[s + k];
      }
    }
    return out;
  }

  /** Nearest-neighbor upscale (for preview sheets). */
  scaled(k) {
    const out = new Raster(this.width * k, this.height * k);
    for (let y = 0; y < out.height; y++) {
      for (let x = 0; x < out.width; x++) {
        const s = (Math.floor(y / k) * this.width + Math.floor(x / k)) * 4;
        const d = (y * out.width + x) * 4;
        for (let c = 0; c < 4; c++) out.data[d + c] = this.data[s + c];
      }
    }
    return out;
  }

  toPng() {
    return encodePng(this.width, this.height, this.data, 4);
  }
}

/** Horizontal strip of equally sized frames. */
export function strip(frames) {
  const out = new Raster(frames[0].width * frames.length, frames[0].height);
  frames.forEach((f, i) => out.blit(f, i * f.width, 0));
  return out;
}
