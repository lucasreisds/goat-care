import { describe, expect, it } from 'vitest';
import { computeFit, createLayout, GROUND_BAND, MAX_H, MAX_W, MIN_H, MIN_W } from '../src/render/layout';

describe('computeFit', () => {
  it('fills a modern tall iPhone (390x844 pt, dpr 3) with an integer scale', () => {
    expect(computeFit(1170, 2532)).toEqual({ scale: 6, width: 195, height: 422 });
  });

  it('fills an iPhone SE (375x667 pt, dpr 2)', () => {
    expect(computeFit(750, 1334)).toEqual({ scale: 4, width: 187, height: 333 });
  });

  it('caps the internal size on big screens', () => {
    const fit = computeFit(1920, 1080);
    expect(fit.scale).toBe(3);
    expect(fit.width).toBe(MAX_W);
    expect(fit.height).toBe(360);
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
    const l = createLayout(195, 422);
    expect(l.groundY).toBe(422 - GROUND_BAND);
    expect(l.feetY).toBe(l.groundY + 10);
    expect(l.centerX).toBe(98);
  });
});
