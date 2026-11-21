import type { AnimationDef } from './pack/schema';

/** Frame clock for a pack's animations. Looping, or one-shot with an optional `next`. */
export class AnimationPlayer {
  id: string;
  /** Seconds since the current animation started. */
  time = 0;
  frame = 0;
  /** True once a non-looping animation without `next` has reached its last frame. */
  finished = false;

  constructor(
    private readonly defs: Readonly<Record<string, AnimationDef>>,
    initial = 'idle',
  ) {
    if (!defs[initial]) throw new Error(`Unknown animation "${initial}"`);
    this.id = initial;
  }

  get def(): AnimationDef {
    return this.defs[this.id]!;
  }

  play(id: string, restart = true): void {
    if (!this.defs[id]) throw new Error(`Unknown animation "${id}"`);
    if (!restart && id === this.id) return;
    this.id = id;
    this.time = 0;
    this.frame = 0;
    this.finished = false;
  }

  /** Advances the clock. Returns true when the animation switched (e.g. via `next`). */
  update(dt: number): boolean {
    if (this.finished) return false;
    this.time += dt;
    const def = this.def;
    const raw = Math.floor(this.time * def.fps);
    if (def.loop) {
      this.frame = raw % def.frames;
      return false;
    }
    if (raw >= def.frames) {
      if (def.next) {
        this.play(def.next);
        return true;
      }
      this.frame = def.frames - 1;
      this.finished = true;
      return false;
    }
    this.frame = raw;
    return false;
  }
}
