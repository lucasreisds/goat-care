import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AnimationPlayer } from '../src/character/animation';
import { getAnchors, isCompatible, stageForAltitude } from '../src/character/pack/rules';
import {
  PackFormatError,
  parseItemCatalog,
  parseManifest,
  type ItemDef,
  type PackManifest,
} from '../src/character/pack/schema';
import { SpringFollower } from '../src/character/spring';
import { lookup } from '../src/i18n';

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf-8'));
const rawManifest = (): Record<string, unknown> => readJson('public/characters/mountain-goat/manifest.json') as Record<string, unknown>;
const manifest: PackManifest = parseManifest(rawManifest());
const catalog = parseItemCatalog(readJson('public/items/items.json'));

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

describe('the shipped mountain-goat pack', () => {
  it('is a valid manifest', () => {
    expect(manifest.id).toBe('mountain-goat');
    expect(manifest.stages.map((s) => s.id)).toEqual(['kid', 'young', 'adult', 'legendary']);
    expect(Object.keys(manifest.expressions).sort()).toEqual(
      ['eating', 'happy', 'love', 'neutral', 'sad', 'sleepy', 'surprised'],
    );
    expect(Object.keys(manifest.animations).sort()).toEqual(['celebrate', 'eat', 'idle', 'sleep']);
    expect(Object.keys(manifest.slots).sort()).toEqual(['feet', 'hand', 'head', 'legs', 'neck', 'torso']);
  });

  it('has altitude thresholds matching the agreed calibration', () => {
    expect(manifest.stages.map((s) => s.minAltitude)).toEqual([0, 700, 3000, 8250]);
  });

  it('puts the hat between the horns via its own anchor', () => {
    const hat = catalog.items.find((i) => i.slot === 'head')!;
    expect(hat.anchor).toBe('betweenHorns');
    const idle = getAnchors(manifest, 'adult', 'idle', 0);
    expect(idle.betweenHorns![1]).toBeLessThan(idle.head![1]);
  });

  it('only references translated names', () => {
    expect(lookup(manifest.nameKey)).toBeTruthy();
    for (const item of catalog.items) expect(lookup(item.nameKey), item.id).toBeTruthy();
  });
});

describe('parseManifest', () => {
  it('lists every problem at once', () => {
    const bad = clone(rawManifest());
    bad.id = '';
    (bad.anchors as string[]).splice(0, 1); // drop "head"
    expect(() => parseManifest(bad)).toThrow(PackFormatError);
    try {
      parseManifest(bad);
    } catch (e) {
      const issues = (e as PackFormatError).issues;
      expect(issues.some((i) => i.startsWith('id'))).toBe(true);
      expect(issues.some((i) => i.includes('"head"'))).toBe(true);
    }
  });

  it('requires anchor data for every stage, animation, frame and anchor', () => {
    const bad = clone(rawManifest()) as { anchorData: Record<string, Record<string, Array<Record<string, unknown>>>> };
    delete bad.anchorData.adult!.idle![2]!.neck;
    expect(() => parseManifest(bad)).toThrow(/anchorData\.adult\.idle\[2\] is missing anchor "neck"/);
  });

  it('requires stages to start at 0 and increase', () => {
    const bad = clone(rawManifest()) as { stages: Array<{ minAltitude: number }> };
    bad.stages[0]!.minAltitude = 5;
    expect(() => parseManifest(bad)).toThrow(/start at minAltitude 0/);
    const unordered = clone(rawManifest()) as { stages: Array<{ minAltitude: number }> };
    unordered.stages[2]!.minAltitude = 100;
    expect(() => parseManifest(unordered)).toThrow(/increasing/);
  });

  it('rejects animations that point at unknown expressions or next animations', () => {
    const bad = clone(rawManifest()) as { animations: Record<string, { expression: string; next?: string }> };
    bad.animations.idle!.expression = 'nope';
    bad.animations.celebrate!.next = 'ghost';
    expect(() => parseManifest(bad)).toThrow(/idle\.expression[\s\S]*celebrate\.next/);
  });

  it('rejects parts attached to an undeclared anchor', () => {
    const bad = clone(rawManifest()) as { parts: Array<{ anchor: string }> };
    bad.parts[0]!.anchor = 'tailBase';
    expect(() => parseManifest(bad)).toThrow(/not a declared anchor/);
  });
});

describe('parseItemCatalog', () => {
  it('rejects duplicate ids and bad pivots', () => {
    const bad = clone(readJson('public/items/items.json')) as { items: Array<Record<string, unknown>> };
    bad.items[1]!.id = bad.items[0]!.id;
    bad.items[2]!.pivot = [1];
    expect(() => parseItemCatalog(bad)).toThrow(/duplicated[\s\S]*pivot/);
  });
});

describe('item compatibility', () => {
  const item = (over: Partial<ItemDef>): ItemDef => ({ ...clone(catalog.items[0]!), ...over });

  it('generic items fit every character', () => {
    for (const generic of catalog.items.filter((i) => i.compatibleWith.includes('*'))) {
      expect(isCompatible(generic, manifest), generic.id).toBe(true);
    }
  });

  it('character-specific items fit only the listed pack', () => {
    const bell = catalog.items.find((i) => i.id === 'bell-collar')!;
    expect(isCompatible(bell, manifest)).toBe(true);
    expect(isCompatible(item({ compatibleWith: ['robot'] }), manifest)).toBe(false);
  });

  it('needs the pack to have the slot and the anchor name', () => {
    expect(isCompatible(item({ slot: 'tail' }), manifest)).toBe(false);
    expect(isCompatible(item({ anchor: 'tailBase' }), manifest)).toBe(false);
  });
});

describe('stageForAltitude', () => {
  it('picks the highest stage reached', () => {
    const { stages } = manifest;
    expect(stageForAltitude(stages, 0).id).toBe('kid');
    expect(stageForAltitude(stages, 699).id).toBe('kid');
    expect(stageForAltitude(stages, 700).id).toBe('young');
    expect(stageForAltitude(stages, 3000).id).toBe('adult');
    expect(stageForAltitude(stages, 8250).id).toBe('legendary');
    expect(stageForAltitude(stages, 99999).id).toBe('legendary');
  });
});

describe('AnimationPlayer', () => {
  const player = (): AnimationPlayer => new AnimationPlayer(manifest.animations);

  it('loops frames', () => {
    const p = player();
    const idle = manifest.animations.idle!;
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) {
      p.update(1 / 30);
      seen.add(p.frame);
    }
    expect(seen.size).toBe(idle.frames);
  });

  it('plays a one-shot and returns to its `next`', () => {
    const p = player();
    p.play('celebrate');
    let switched = false;
    for (let i = 0; i < 60 && !switched; i++) switched = p.update(1 / 30);
    expect(switched).toBe(true);
    expect(p.id).toBe('idle');
  });

  it('holds the last frame when a one-shot has no next', () => {
    const p = new AnimationPlayer({
      once: { frames: 3, fps: 10, loop: false, expression: 'neutral' },
      idle: { frames: 1, fps: 1, loop: true, expression: 'neutral' },
    });
    p.play('once');
    for (let i = 0; i < 30; i++) p.update(0.1);
    expect(p.finished).toBe(true);
    expect(p.frame).toBe(2);
  });

  it('rejects unknown animations', () => {
    expect(() => player().play('dance')).toThrow(/Unknown animation/);
  });
});

describe('SpringFollower', () => {
  it('settles on its target', () => {
    const s = new SpringFollower(140, 8);
    s.snap(0, 0);
    for (let i = 0; i < 180; i++) s.step(5, -3, 1 / 30);
    expect(s.x).toBeCloseTo(5, 1);
    expect(s.y).toBeCloseTo(-3, 1);
  });

  it('overshoots after an impulse, then returns', () => {
    const s = new SpringFollower(140, 4);
    s.snap(0, 0);
    s.impulse(0, -60);
    let min = 0;
    for (let i = 0; i < 90; i++) {
      s.step(0, 0, 1 / 30);
      min = Math.min(min, s.y);
    }
    expect(min).toBeLessThan(-1);
    expect(Math.abs(s.y)).toBeLessThan(0.1);
  });

  it('stays stable with a huge frame time', () => {
    const s = new SpringFollower(140, 8);
    s.snap(0, 0);
    s.step(10, 10, 0.5);
    expect(Number.isFinite(s.x)).toBe(true);
    expect(Math.abs(s.x)).toBeLessThan(50);
  });
});
