import { describe, expect, it } from 'vitest';
import { breathPose, HOP_DURATION, hopPose } from '../src/character/motion';

describe('hopPose', () => {
  it('is neutral outside the hop', () => {
    expect(hopPose(0)).toEqual({ dy: 0, sx: 1, sy: 1 });
    expect(hopPose(HOP_DURATION)).toEqual({ dy: 0, sx: 1, sy: 1 });
    expect(hopPose(5)).toEqual({ dy: 0, sx: 1, sy: 1 });
  });

  it('squashes before launch and leaves the ground mid-hop', () => {
    expect(hopPose(0.149).sy).toBeLessThan(0.9);
    expect(hopPose(0.375).dy).toBeLessThan(-20);
  });

  it('preserves volume and stays finite for the whole hop', () => {
    for (let t = 0; t <= HOP_DURATION; t += 0.01) {
      const p = hopPose(t);
      expect(Number.isFinite(p.dy) && Number.isFinite(p.sx) && Number.isFinite(p.sy)).toBe(true);
      expect(p.sx * p.sy).toBeCloseTo(1, 5);
    }
  });
});

describe('breathPose', () => {
  it('stays within a subtle range', () => {
    for (let t = 0; t < 10; t += 0.1) {
      const p = breathPose(t);
      expect(p.sy).toBeGreaterThan(0.98);
      expect(p.sy).toBeLessThan(1.02);
    }
  });
});
