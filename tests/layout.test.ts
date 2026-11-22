import { describe, expect, it } from 'vitest';
import { computeFit, createLayout, GROUND_BAND, MAX_H, MAX_W, MIN_H, MIN_W } from '../src/render/layout';

describe('computeFit', () => {
  it('fills a modern tall iPhone (390x844 pt, dpr 3) with an integer scale', () => {
    expect(computeFit(1170, 2532)).toEqual({ scale: 9, width: 130, height: 281 });
  });

  it('fills an iPhone SE (375x667 pt, dpr 2)', () => {
    expect(computeFit(750, 1334)).toEqual({ scale: 5, width: 150, height: 266 });
  });

  it('caps the internal size on big screens', () => {
    const fit = computeFit(1920, 1080);
    expect(fit.scale).toBe(4);
    expect(fit.width).toBe(MAX_W);
    expect(fit.height).toBe(270);
  });

  it('always stays inside the supported range', () => {
    for (const [w, h] of [[750, 1334], [1170, 2532], [1290, 2796], [1536, 2048], [2560, 1440]] as const) {
      const fit = computeFit(w, h);
      expect(fit.width).toBeGreaterThanOrEqual(MIN_W);
      expect(fit.width).toBeLessThanOrEqual(MAX_W);
      expect(fit.height).toBeGreaterThanOrEqual(MIN_H);
      expect(fit.height).toBeLessThanOrEqual(MAX_H);
      expect(fit.scale * fit.width).toBeLessThanOrEqual(w);
    }
  });
});

describe('createLayout', () => {
  it('anchors ground and character to the bottom', () => {
    const l = createLayout(130, 281);
    expect(l.groundY).toBe(281 - GROUND_BAND);
    expect(l.feetY).toBe(l.groundY + 12);
    expect(l.centerX).toBe(65);
  });
});
