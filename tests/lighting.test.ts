import { describe, expect, it } from 'vitest';
import { lerpColor, smoothstep } from '../src/core/color';
import { parseHourParam, wrapHour } from '../src/core/time/clock';
import { ambientColorAt, daylightAt } from '../src/render/light/ambientCurve';
import { TimeOfDay } from '../src/render/light/TimeOfDay';

describe('color helpers', () => {
  it('lerps between colors', () => {
    expect(lerpColor(0x000000, 0xffffff, 0)).toBe(0x000000);
    expect(lerpColor(0x000000, 0xffffff, 1)).toBe(0xffffff);
    expect(lerpColor(0xff0000, 0x0000ff, 0.5)).toBe(0x800080);
  });

  it('smoothsteps and clamps', () => {
    expect(smoothstep(0, 1, -1)).toBe(0);
    expect(smoothstep(0, 1, 2)).toBe(1);
    expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5);
  });
});

describe('clock helpers', () => {
  it('wraps hours into [0, 24)', () => {
    expect(wrapHour(24)).toBe(0);
    expect(wrapHour(-1)).toBe(23);
    expect(wrapHour(25.5)).toBe(1.5);
  });

  it('parses the hour query param', () => {
    expect(parseHourParam('?hour=21.5')).toBe(21.5);
    expect(parseHourParam('?hour=26')).toBe(2);
    expect(parseHourParam('?hour=abc')).toBeNull();
    expect(parseHourParam('?debug')).toBeNull();
  });
});

describe('ambient curve', () => {
  it('is full white at noon and wraps around midnight', () => {
    expect(ambientColorAt(12)).toBe(0xffffff);
    expect(ambientColorAt(24)).toBe(ambientColorAt(0));
    expect(ambientColorAt(-1)).toBe(ambientColorAt(23));
  });

  it('is darker at night than at noon', () => {
    const lum = (c: number) => ((c >> 16) & 255) + ((c >> 8) & 255) + (c & 255);
    expect(lum(ambientColorAt(2))).toBeLessThan(lum(ambientColorAt(12)));
  });

  it('daylight is 0 at night, 1 at midday and between at dusk', () => {
    expect(daylightAt(2)).toBe(0);
    expect(daylightAt(12)).toBe(1);
    expect(daylightAt(19)).toBeGreaterThan(0);
    expect(daylightAt(19)).toBeLessThan(1);
    expect(daylightAt(6.5)).toBeGreaterThan(0);
    expect(daylightAt(6.5)).toBeLessThan(1);
  });
});

describe('TimeOfDay smoothing', () => {
  it('snaps on the first update then eases toward the target', () => {
    const tod = new TimeOfDay();
    expect(tod.update(12, 0.033).daylight).toBe(1);
    const afterOne = tod.update(2, 0.033).daylight;
    expect(afterOne).toBeLessThan(1);
    expect(afterOne).toBeGreaterThan(0);
    for (let i = 0; i < 200; i++) tod.update(2, 0.033);
    expect(tod.state.daylight).toBeLessThan(0.01);
  });
});
