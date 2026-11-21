import { Assets, type Texture } from 'pixi.js';
import { sliceTexture } from '../../render/pixel';
import {
  parseItemCatalog,
  parseManifest,
  type ItemDef,
  type PackManifest,
  type PartDef,
} from './schema';

export interface LoadedPack {
  manifest: PackManifest;
  /** bodies[stage][animation] = frame textures */
  bodies: Record<string, Record<string, Texture[]>>;
  expressions: Record<string, { frames: Texture[]; blink?: Texture }>;
  parts: Array<{ def: PartDef; texture: Texture }>;
}

export interface LoadedItem {
  def: ItemDef;
  texture: Texture;
}

const base = (path: string): string => `${import.meta.env.BASE_URL}${path}`;

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to load ${url} (${response.status})`);
  return response.json();
}

async function loadTexture(url: string): Promise<Texture> {
  const texture = await Assets.load<Texture>(url);
  texture.source.scaleMode = 'nearest';
  return texture;
}

function frames(sheet: Texture, count: number, width: number, height: number): Texture[] {
  return Array.from({ length: count }, (_, i) => sliceTexture(sheet, i * width, 0, width, height));
}

/** Loads and validates a character pack from `characters/<id>/` (placeholder or final art alike). */
export async function loadPack(id: string): Promise<LoadedPack> {
  const root = base(`characters/${id}`);
  const manifest = parseManifest(await fetchJson(`${root}/manifest.json`));
  const { width, height } = manifest.frame;

  const bodies: LoadedPack['bodies'] = {};
  const jobs: Array<Promise<void>> = [];

  for (const stage of manifest.stages) {
    bodies[stage.id] = {};
    for (const [animId, anim] of Object.entries(manifest.animations)) {
      jobs.push(
        loadTexture(`${root}/bodies/${stage.id}/${animId}.png`).then((sheet) => {
          bodies[stage.id]![animId] = frames(sheet, anim.frames, width, height);
        }),
      );
    }
  }

  const expressions: LoadedPack['expressions'] = {};
  for (const [exprId, def] of Object.entries(manifest.expressions)) {
    jobs.push(
      (async () => {
        const sheet = await loadTexture(`${root}/expressions/${exprId}.png`);
        const frameWidth = Math.round(sheet.width / def.frames);
        const entry: LoadedPack['expressions'][string] = {
          frames: frames(sheet, def.frames, frameWidth, sheet.height),
        };
        if (def.blink) entry.blink = await loadTexture(`${root}/expressions/${exprId}-blink.png`);
        expressions[exprId] = entry;
      })(),
    );
  }

  const parts: LoadedPack['parts'] = [];
  manifest.parts.forEach((def, i) => {
    jobs.push(
      loadTexture(`${root}/${def.file}`).then((texture) => {
        parts[i] = { def, texture };
      }),
    );
  });

  await Promise.all(jobs);
  return { manifest, bodies, expressions, parts };
}

/** Loads the shared item catalog (`items/items.json`). Compatibility is decided per character later. */
export async function loadItems(): Promise<LoadedItem[]> {
  const catalog = parseItemCatalog(await fetchJson(base('items/items.json')));
  return Promise.all(
    catalog.items.map(async (def) => ({ def, texture: await loadTexture(base(`items/${def.file}`)) })),
  );
}
