import { Application, TextureStyle } from 'pixi.js';
import { computeFit, createLayout, FPS, type Layout } from './layout';

export interface Stage {
  readonly app: Application;
  /** Current internal layout (changes when the screen size changes). */
  readonly layout: Layout;
  /** Pointer taps in scene coordinates. */
  onTap(handler: (x: number, y: number) => void): void;
  /** Fires when the internal resolution changes (rotation, window resize): rebuild the scene. */
  onLayoutChange(handler: (layout: Layout) => void): void;
}

const viewportPx = (): { w: number; h: number; dpr: number } => {
  const dpr = window.devicePixelRatio || 1;
  return { w: window.innerWidth * dpr, h: window.innerHeight * dpr, dpr };
};

/**
 * Creates the Pixi app with an internal resolution derived from the screen and keeps it
 * scaled by an INTEGER factor in device pixels (crisp pixels, no empty bars on tall phones).
 * Caps at 30 fps and pauses while the page is hidden.
 */
export async function createStage(host: HTMLElement): Promise<Stage> {
  TextureStyle.defaultOptions.scaleMode = 'nearest';

  const first = viewportPx();
  const initialFit = computeFit(first.w, first.h);
  let layout = createLayout(initialFit.width, initialFit.height);

  const app = new Application();
  await app.init({
    width: layout.width,
    height: layout.height,
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

  const layoutHandlers: Array<(layout: Layout) => void> = [];

  const refit = (): void => {
    const { w, h, dpr } = viewportPx();
    const fit = computeFit(w, h);
    app.canvas.style.width = `${(fit.width * fit.scale) / dpr}px`;
    app.canvas.style.height = `${(fit.height * fit.scale) / dpr}px`;
    if (fit.width !== layout.width || fit.height !== layout.height) {
      layout = createLayout(fit.width, fit.height);
      app.renderer.resize(layout.width, layout.height);
      for (const handler of layoutHandlers) handler(layout);
    }
  };
  refit();

  // iOS reports the new size a moment after rotation, so re-check shortly after too.
  let timer = 0;
  const scheduleRefit = (): void => {
    refit();
    window.clearTimeout(timer);
    timer = window.setTimeout(refit, 200);
  };
  window.addEventListener('resize', scheduleRefit);
  window.addEventListener('orientationchange', scheduleRefit);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) app.ticker.stop();
    else app.ticker.start();
  });

  const tapHandlers: Array<(x: number, y: number) => void> = [];
  app.canvas.addEventListener('pointerdown', (event: PointerEvent) => {
    const rect = app.canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * layout.width;
    const y = ((event.clientY - rect.top) / rect.height) * layout.height;
    for (const handler of tapHandlers) handler(x, y);
  });

  return {
    app,
    get layout() {
      return layout;
    },
    onTap: (handler) => {
      tapHandlers.push(handler);
    },
    onLayoutChange: (handler) => {
      layoutHandlers.push(handler);
    },
  };
}
