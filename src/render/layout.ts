/**
 * The scene is NOT a fixed size. The canvas keeps an integer pixel scale (crisp pixel art)
 * and the internal resolution is derived from the screen, so tall phones get a taller scene
 * instead of empty bars. Width stays near 180 and height near 320-460.
 */
export const FPS = 30;

export const MIN_W = 170;
export const MAX_W = 200;
export const MIN_H = 300;
export const MAX_H = 460;

/** Height of the grass/floor strip at the bottom; sky and walls take the rest. */
export const GROUND_BAND = 84;
/** The character's feet sit this far below the ground line. */
export const FEET_OFFSET = 10;

export interface Layout {
  width: number;
  height: number;
  /** Where grass/floor begins. */
  groundY: number;
  /** The character stands on a FIXED point; animations happen in place. */
  centerX: number;
  feetY: number;
}

export function createLayout(width: number, height: number): Layout {
  const groundY = height - GROUND_BAND;
  return { width, height, groundY, centerX: Math.round(width / 2), feetY: groundY + FEET_OFFSET };
}

export interface Fit {
  /** Integer canvas scale, in DEVICE pixels. */
  scale: number;
  width: number;
  height: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Picks the biggest integer scale that still leaves a usable internal resolution. */
export function computeFit(viewportWidthPx: number, viewportHeightPx: number): Fit {
  const scale = Math.max(
    1,
    Math.min(Math.floor(viewportWidthPx / MIN_W), Math.floor(viewportHeightPx / MIN_H)),
  );
  return {
    scale,
    width: clamp(Math.floor(viewportWidthPx / scale), MIN_W, MAX_W),
    height: clamp(Math.floor(viewportHeightPx / scale), MIN_H, MAX_H),
  };
}
