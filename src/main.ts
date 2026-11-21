import './style.css';
import { loadItems, loadPack } from './character/pack/loader';
import { HourSource, parseHourParam } from './core/time/clock';
import { mountDebugPanel } from './debug/DebugPanel';
import { strings } from './i18n';
import { HomeScene, type CharacterAssets } from './render/HomeScene';
import { createStage } from './render/Stage';

async function main(): Promise<void> {
  const host = document.getElementById('app');
  const hint = document.getElementById('hint');
  if (!host || !hint) throw new Error('Missing #app or #hint element');

  hint.textContent = strings.ui.home.tapHint;
  window.setTimeout(() => hint.classList.add('hidden'), 8000);

  const hours = new HourSource(parseHourParam(location.search));
  const stage = await createStage(host);
  const [pack, items] = await Promise.all([loadPack('mountain-goat'), loadItems()]);
  const assets: CharacterAssets = { pack, items };
  let scene = new HomeScene(stage.app.stage, hours, stage.layout, assets);

  // New screen size (rotation, window resize): rebuild the scene for the new layout.
  stage.onLayoutChange((layout) => {
    const snapshot = scene.character.snapshot();
    scene.destroy();
    scene = new HomeScene(stage.app.stage, hours, layout, assets, snapshot);
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

  mountDebugPanel({ hours, assets, character: () => scene.character });
}

main().catch((error: unknown) => {
  console.error(error);
});
