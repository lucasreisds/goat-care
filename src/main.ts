import './style.css';
import { HourSource, parseHourParam } from './core/time/clock';
import { mountDebugPanel } from './debug/DebugPanel';
import { strings } from './i18n';
import { HomeScene } from './render/HomeScene';
import { createStage } from './render/Stage';

async function main(): Promise<void> {
  const host = document.getElementById('app');
  const hint = document.getElementById('hint');
  if (!host || !hint) throw new Error('Missing #app or #hint element');

  hint.textContent = strings.ui.home.tapHint;
  window.setTimeout(() => hint.classList.add('hidden'), 8000);

  const hours = new HourSource(parseHourParam(location.search));
  const stage = await createStage(host);
  let scene = new HomeScene(stage.app.stage, hours, stage.layout);

  // New screen size (rotation, window resize): rebuild the scene for the new layout.
  stage.onLayoutChange((layout) => {
    scene.destroy();
    scene = new HomeScene(stage.app.stage, hours, layout);
  });

  stage.onTap((x, y) => {
    if (scene.handleTap(x, y)) hint.classList.add('hidden');
  });

  let t = 0;
  stage.app.ticker.add((ticker) => {
    const dt = Math.min(ticker.deltaMS / 1000, 0.1);
    t += dt;
    scene.update(dt, t);
  });

  mountDebugPanel(hours);
}

main().catch((error: unknown) => {
  console.error(error);
});
