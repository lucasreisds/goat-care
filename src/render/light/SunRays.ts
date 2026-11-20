import { Container, Sprite } from 'pixi.js';
import { createRng } from '../../core/random';
import { SCENE_W } from '../constants';
import { createBeamTexture, createDotTexture } from '../textures';

/** Slanted additive sun beams (day only). */
export class SunRays {
  readonly container = new Container();
  private readonly beams: Sprite[] = [];

  constructor() {
    const texture = createBeamTexture(26, 230);
    [14, 52, 96].forEach((x, i) => {
      const beam = new Sprite(texture);
      beam.anchor.set(0.5, 0);
      beam.position.set(x, -8);
      beam.rotation = -0.42 - i * 0.04;
      beam.tint = 0xfff2c0;
      beam.blendMode = 'add';
      beam.alpha = 0;
      this.container.addChild(beam);
      this.beams.push(beam);
    });
  }

  update(t: number, daylight: number): void {
    this.container.visible = daylight > 0.02;
    this.beams.forEach((beam, i) => {
      beam.alpha = daylight * (0.15 + 0.045 * Math.sin(t * 0.6 + i * 1.7));
    });
  }
}

interface Mote {
  sprite: Sprite;
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
}

/** Floating dust particles that catch the sun (day only). */
export class DustMotes {
  readonly container = new Container();
  private readonly motes: Mote[] = [];

  constructor() {
    const rng = createRng(404);
    const dot = createDotTexture();
    for (let i = 0; i < 26; i++) {
      const sprite = new Sprite(dot);
      sprite.tint = 0xfff4cf;
      this.container.addChild(sprite);
      this.motes.push({
        sprite,
        x: rng() * SCENE_W,
        y: 10 + rng() * 210,
        vx: 2 + rng() * 4,
        vy: 1 + rng() * 3,
        phase: rng() * Math.PI * 2,
      });
    }
  }

  update(dt: number, t: number, daylight: number): void {
    this.container.visible = daylight > 0.02;
    for (const mote of this.motes) {
      mote.x += (mote.vx + Math.sin(t * 0.7 + mote.phase) * 2) * dt;
      mote.y += (mote.vy + Math.cos(t * 0.5 + mote.phase) * 1.5) * dt;
      if (mote.x > SCENE_W) mote.x = 0;
      if (mote.y > 230) mote.y = 10;
      mote.sprite.position.set(Math.round(mote.x), Math.round(mote.y));
      mote.sprite.alpha = daylight * (0.25 + 0.5 * (0.5 + 0.5 * Math.sin(t * 1.5 + mote.phase)));
    }
  }
}
