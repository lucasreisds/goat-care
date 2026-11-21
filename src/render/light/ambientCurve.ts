import { lerpColor, smoothstep } from '../../core/color';
import { wrapHour } from '../../core/time/clock';

/**
 * Ambient light as a MULTIPLY color per hour of the day (device time).
 * Hue-shifted on purpose: pink dawn, golden dusk, violet twilight, blue night.
 * First and last keys must match so the day wraps seamlessly.
 */
export const AMBIENT_KEYS: ReadonlyArray<readonly [hour: number, color: number]> = [
  [0, 0x4a5890],
  [5, 0x4f5d96],
  [6.25, 0xd99a86],
  [7.5, 0xffe3c4],
  [9, 0xfff6e6],
  [12, 0xffffff],
  [15.5, 0xfff4de],
  [17.5, 0xffd09a],
  [18.75, 0xf09a62],
  [19.75, 0x8a6aa0],
  [21, 0x56649e],
  [24, 0x4a5890],
];

export function ambientColorAt(hour: number): number {
  const h = wrapHour(hour);
  for (let i = 1; i < AMBIENT_KEYS.length; i++) {
    const [h0, c0] = AMBIENT_KEYS[i - 1]!;
    const [h1, c1] = AMBIENT_KEYS[i]!;
    if (h <= h1) return lerpColor(c0, c1, (h - h0) / (h1 - h0));
  }
  return AMBIENT_KEYS[AMBIENT_KEYS.length - 1]![1];
}

/**
 * 0 = full night (cabin), 1 = full day (mountain peak).
 * Dawn crossfade 05:30-07:30, dusk crossfade 18:00-20:00.
 */
export function daylightAt(hour: number): number {
  const h = wrapHour(hour);
  return Math.min(smoothstep(5.5, 7.5, h), 1 - smoothstep(18, 20, h));
}
