import { Rectangle, type Renderer } from 'pixi.js';
import { CharacterView } from '../character/CharacterView';
import type { CharacterAssets } from './HomeScene';

/** Room around the 64 px frame for horns, hats and springy parts. */
const PAD_X = 16;
const PAD_TOP = 16;
const PAD_BOTTOM = 6;

/**
 * A still picture of a character at a given stage wearing the given items, as a canvas the DOM can
 * show (ranking, partner card). Uses the same layered renderer as the scene, so it works for any pack.
 */
export function characterPortrait(renderer: Renderer, assets: CharacterAssets, stageId: string, outfit: readonly string[]): HTMLCanvasElement {
  const { width, height } = assets.pack.manifest.frame;
  const stage = assets.pack.manifest.stages.some((s) => s.id === stageId) ? stageId : assets.pack.manifest.stages[0]!.id;
  const view = new CharacterView(assets.pack, assets.items, { x: 0, y: 0, stage });
  for (const id of outfit) {
    const item = assets.items.find((i) => i.def.id === id);
    if (item) view.equip(item);
  }
  view.update(0, 0, 0xffffff);

  const frame = new Rectangle(-width / 2 - PAD_X, -height - PAD_TOP, width + PAD_X * 2, height + PAD_TOP + PAD_BOTTOM);
  const canvas = renderer.extract.canvas({ target: view.container, frame, resolution: 1, antialias: false }) as HTMLCanvasElement;
  view.container.destroy({ children: true });
  canvas.classList.add('portrait');
  return canvas;
}
