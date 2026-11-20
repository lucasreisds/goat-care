import { lerp } from '../core/color';

/** Scale/offset applied on top of a sprite, anchored at the feet. */
export interface Pose {
  dy: number;
  sx: number;
  sy: number;
}

export const NEUTRAL_POSE: Readonly<Pose> = { dy: 0, sx: 1, sy: 1 };

/** Idle breathing: gentle vertical stretch, 3.2 s per cycle. */
export function breathPose(tSec: number): Pose {
  const wave = Math.sin((tSec * Math.PI * 2) / 3.2);
  const sy = 1 + 0.018 * wave;
  return { dy: 0, sx: 1 / sy, sy };
}

export const HOP_DURATION = 0.9;
const HOP_HEIGHT = 24;

const squash = (sy: number): Pose => ({ dy: 0, sx: 1 / sy, sy });
const ease = (k: number): number => k * k * (3 - 2 * k);

/**
 * Celebration hop with squash & stretch (volume preserving: sx = 1 / sy).
 * anticipation -> launch -> airborne stretch -> landing squash -> overshoot -> settle.
 */
export function hopPose(tSec: number): Pose {
  if (tSec <= 0 || tSec >= HOP_DURATION) return { ...NEUTRAL_POSE };

  if (tSec < 0.15) {
    return squash(lerp(1, 0.84, ease(tSec / 0.15)));
  }
  if (tSec < 0.6) {
    const k = (tSec - 0.15) / 0.45;
    const launch = lerp(0.84, 1, ease(Math.min(1, k / 0.2)));
    const sy = launch * (1 + 0.1 * Math.sin(k * Math.PI));
    return { dy: -HOP_HEIGHT * 4 * k * (1 - k), sx: 1 / sy, sy };
  }
  if (tSec < 0.68) {
    return squash(lerp(1, 0.86, ease((tSec - 0.6) / 0.08)));
  }
  const k = (tSec - 0.68) / (HOP_DURATION - 0.68);
  const overshoot = 1 + 0.05 * Math.sin(k * Math.PI);
  return squash(lerp(0.86, 1, ease(k)) * overshoot);
}
