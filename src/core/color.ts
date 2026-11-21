export const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/** Linear interpolation between two 0xRRGGBB colors. */
export function lerpColor(a: number, b: number, t: number): number {
  const k = clamp01(t);
  const r = Math.round(lerp((a >> 16) & 255, (b >> 16) & 255, k));
  const g = Math.round(lerp((a >> 8) & 255, (b >> 8) & 255, k));
  const bl = Math.round(lerp(a & 255, b & 255, k));
  return (r << 16) | (g << 8) | bl;
}
