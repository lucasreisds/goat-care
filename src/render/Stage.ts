import { Application, TextureStyle } from 'pixi.js';
import { FPS, SCENE_H, SCENE_W } from './constants';

export interface Stage {
  readonly app: Application;
  /** Pointer taps in scene coordinates (0..SCENE_W, 0..SCENE_H). */
  onTap(handler: (x: number, y: number) => void): void;
}

/**
 * Creates the Pixi app at the internal portrait resolution and keeps it
 * scaled by an INTEGER factor in device pixels (crisp pixels on iPhone).
 * Caps at 30 fps and pauses while the page is hidden.
 */
export async function createStage(host: HTMLElement): Promise<Stage> {
  TextureStyle.defaultOptions.scaleMode = 'nearest';

  const app = new Application();
  await app.init({
    width: SCENE_W,
    height: SCENE_H,
    background: 0x1b2340,
    antialias: false,
    resolution: 1,
    autoDensity: false,
    roundPixels: true,
    powerPreference: 'low-power',
    preference: 'webgl',
  });
  app.ticker.maxFPS = FPS;
  host.appendChild(app.canvas);

  const layout = (): void => {
    const dpr = window.devicePixelRatio || 1;
    const scale = Math.max(
      1,
      Math.floor(Math.min((window.innerWidth * dpr) / SCENE_W, (window.innerHeight * dpr) / SCENE_H)),
    );
    app.canvas.style.width = `${(SCENE_W * scale) / dpr}px`;
    app.canvas.style.height = `${(SCENE_H * scale) / dpr}px`;
  };
  layout();
  window.addEventListener('resize', layout);
  window.addEventListener('orientationchange', layout);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) app.ticker.stop();
    else app.ticker.start();
  });

  const handlers: Array<(x: number, y: number) => void> = [];
  app.canvas.addEventListener('pointerdown', (event: PointerEvent) => {
    const rect = app.canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * SCENE_W;
    const y = ((event.clientY - rect.top) / rect.height) * SCENE_H;
    for (const handler of handlers) handler(x, y);
  });

  return {
    app,
    onTap: (handler) => {
      handlers.push(handler);
    },
  };
}
