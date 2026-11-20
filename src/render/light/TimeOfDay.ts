import { ambientColorAt, daylightAt } from './ambientCurve';

export interface LightingState {
  hour: number;
  /** Smoothed 0xRRGGBB multiply color. */
  ambient: number;
  /** Smoothed 0..1, 1 = day. */
  daylight: number;
  /** 1 - daylight. */
  night: number;
}

/** Seconds-ish response: higher = snappier. Keeps debug scrubbing from popping. */
const RESPONSE = 3;

/** Turns the (device) hour into smoothed lighting values. */
export class TimeOfDay {
  private ready = false;
  private r = 255;
  private g = 255;
  private b = 255;
  private daylight = 1;

  readonly state: LightingState = { hour: 12, ambient: 0xffffff, daylight: 1, night: 0 };

  update(hour: number, dtSec: number): LightingState {
    const target = ambientColorAt(hour);
    const targetDaylight = daylightAt(hour);
    const k = this.ready ? 1 - Math.exp(-RESPONSE * dtSec) : 1;
    this.ready = true;

    this.r += (((target >> 16) & 255) - this.r) * k;
    this.g += (((target >> 8) & 255) - this.g) * k;
    this.b += ((target & 255) - this.b) * k;
    this.daylight += (targetDaylight - this.daylight) * k;

    this.state.hour = hour;
    this.state.ambient =
      (Math.round(this.r) << 16) | (Math.round(this.g) << 8) | Math.round(this.b);
    this.state.daylight = this.daylight;
    this.state.night = 1 - this.daylight;
    return this.state;
  }
}
