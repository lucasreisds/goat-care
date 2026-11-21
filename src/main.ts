import './style.css';
import './ui/app.css';
import { loadItems, loadPack } from './character/pack/loader';
import { HourSource, parseHourParam } from './core/time/clock';
import { mountDebugPanel } from './debug/DebugPanel';
import { browserStore } from './data/localStore';
import { HomeScene, type CharacterAssets } from './render/HomeScene';
import { createStage } from './render/Stage';
import { App } from './ui/App';

async function main(): Promise<void> {
  const host = document.getElementById('app');
  if (!host) throw new Error('Missing #app element');

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
    scene.handleTap(x, y);
  });

  let t = 0;
  stage.app.ticker.add((ticker) => {
    const dt = Math.min(ticker.deltaMS / 1000, 0.1);
    t += dt;
    scene.update(dt, t);
  });

  const overlay = document.getElementById('ui');
  if (!overlay) throw new Error('Missing #ui element');
  new App(overlay, { store: browserStore(), assets, scene: () => scene });

  mountDebugPanel({ hours, assets, character: () => scene.character });
}

main().catch((error: unknown) => {
  console.error(error);
});
