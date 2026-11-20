import { Rectangle, Texture } from 'pixi.js';

export const css = (color: number): string => `#${color.toString(16).padStart(6, '0')}`;

/** A tiny canvas we paint pixel by pixel; becomes a nearest-filtered texture. */
export class PixelBuffer {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    const ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('2D canvas is not available');
    ctx.imageSmoothingEnabled = false;
    this.ctx = ctx;
  }

  rect(x: number, y: number, w: number, h: number, color: number, alpha = 1): void {
    this.ctx.globalAlpha = alpha;
    this.ctx.fillStyle = css(color);
    this.ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    this.ctx.globalAlpha = 1;
  }

  px(x: number, y: number, color: number, alpha = 1): void {
    this.rect(x, y, 1, 1, color, alpha);
  }

  /** Pixel-perfect (no antialiasing) filled ellipse. */
  ellipse(cx: number, cy: number, rx: number, ry: number, color: number, alpha = 1): void {
    this.ctx.globalAlpha = alpha;
    this.ctx.fillStyle = css(color);
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.ctx.fillRect(x, y, 1, 1);
      }
    }
    this.ctx.globalAlpha = 1;
  }

  /** Colored 1px contour around every opaque pixel (hi-bit style, never pure black). */
  outline(color: number): void {
    const { width: w, height: h } = this;
    const img = this.ctx.getImageData(0, 0, w, h);
    const src = new Uint8ClampedArray(img.data);
    const alphaAt = (x: number, y: number): number =>
      x < 0 || y < 0 || x >= w || y >= h ? 0 : src[(y * w + x) * 4 + 3]!;
    const r = (color >> 16) & 255;
    const g = (color >> 8) & 255;
    const b = color & 255;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (alphaAt(x, y) > 0) continue;
        if (alphaAt(x - 1, y) > 0 || alphaAt(x + 1, y) > 0 || alphaAt(x, y - 1) > 0 || alphaAt(x, y + 1) > 0) {
          const i = (y * w + x) * 4;
          img.data[i] = r;
          img.data[i + 1] = g;
          img.data[i + 2] = b;
          img.data[i + 3] = 255;
        }
      }
    }
    this.ctx.putImageData(img, 0, 0);
  }

  toTexture(): Texture {
    const texture = Texture.from(this.canvas);
    texture.source.scaleMode = 'nearest';
    return texture;
  }
}

/** A sub-rectangle of a texture (for sprite sheets). */
export function sliceTexture(base: Texture, x: number, y: number, w: number, h: number): Texture {
  return new Texture({ source: base.source, frame: new Rectangle(x, y, w, h) });
}
