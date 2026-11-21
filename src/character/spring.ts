/** Damped spring that chases a target; used for secondary motion (ears, beard, scarf). */
export class SpringFollower {
  x = 0;
  y = 0;
  private vx = 0;
  private vy = 0;

  constructor(
    private readonly stiffness: number,
    private readonly damping: number,
  ) {}

  snap(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
  }

  /** Kick it (e.g. an ear flick). */
  impulse(vx: number, vy: number): void {
    this.vx += vx;
    this.vy += vy;
  }

  /** Sub-steps keep the integration stable for any frame time. */
  step(targetX: number, targetY: number, dt: number): void {
    const n = Math.max(1, Math.ceil(dt / (1 / 60)));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      this.vx += (this.stiffness * (targetX - this.x) - this.damping * this.vx) * h;
      this.vy += (this.stiffness * (targetY - this.y) - this.damping * this.vy) * h;
      this.x += this.vx * h;
      this.y += this.vy * h;
    }
  }
}

/** Slow, smooth wind in [-1, 1]. */
export const windAt = (t: number): number => Math.sin(t * 1.1) * 0.6 + Math.sin(t * 0.37 + 1.3) * 0.4;
