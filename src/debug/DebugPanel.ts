import type { CharacterView } from '../character/CharacterView';
import { isCompatible } from '../character/pack/rules';
import { localHour, type HourSource } from '../core/time/clock';
import type { CharacterAssets } from '../render/HomeScene';

const formatHour = (hour: number): string => {
  const h = Math.floor(hour);
  const m = Math.floor((hour - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

export interface DebugContext {
  hours: HourSource;
  assets: CharacterAssets;
  /** The CURRENT character view (the scene is rebuilt on resize). */
  character: () => CharacterView;
}

function row(...children: Array<HTMLElement | string>): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'debug-row';
  el.append(...children);
  return el;
}

function select(label: string, options: string[], current: string, onChange: (value: string) => void): HTMLLabelElement {
  const wrap = document.createElement('label');
  const el = document.createElement('select');
  for (const value of options) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = value;
    el.appendChild(opt);
  }
  el.value = current;
  el.addEventListener('change', () => onChange(el.value));
  wrap.append(`${label} `, el);
  return wrap;
}

/** Dev-only overlay: time of day plus character controls. Shown in `npm run dev` or with `?debug`. */
export function mountDebugPanel(ctx: DebugContext): void {
  const enabled = import.meta.env.DEV || new URLSearchParams(location.search).has('debug');
  if (!enabled) return;
  const { hours, assets } = ctx;
  const { manifest } = assets.pack;

  const panel = document.createElement('div');
  panel.className = 'debug';
  panel.hidden = true;
  const toggle = document.createElement('button');
  toggle.className = 'dev-toggle';
  toggle.textContent = 'dev';
  toggle.addEventListener('click', () => (panel.hidden = !panel.hidden));
  document.body.appendChild(toggle);

  // --- time of day
  const auto = document.createElement('input');
  auto.type = 'checkbox';
  auto.checked = !hours.isOverridden;
  const autoLabel = document.createElement('label');
  autoLabel.append(auto, ' auto');
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '0';
  slider.max = '24';
  slider.step = '0.05';
  slider.value = String(hours.get());
  const label = document.createElement('span');
  label.className = 'debug-hour';
  label.textContent = formatHour(hours.get());
  panel.append(row(autoLabel, slider, label));

  slider.addEventListener('input', () => {
    auto.checked = false;
    hours.set(Number(slider.value));
    label.textContent = formatHour(hours.get());
  });
  auto.addEventListener('change', () => hours.set(auto.checked ? null : Number(slider.value)));
  window.setInterval(() => {
    if (!hours.isOverridden) {
      slider.value = String(localHour());
      label.textContent = formatHour(localHour());
    }
  }, 1000);

  // --- character
  const character = ctx.character;
  panel.append(
    row(
      select('stage', manifest.stages.map((s) => s.id), character().stage, (v) => character().setStage(v)),
      select('face', ['auto', ...Object.keys(manifest.expressions)], character().expression ?? 'auto', (v) =>
        character().setExpression(v === 'auto' ? null : v),
      ),
      select('anim', Object.keys(manifest.animations), character().animation, (v) => character().play(v)),
    ),
  );

  const items = row();
  for (const item of assets.items) {
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = character().equippedIds.includes(item.def.id);
    box.disabled = !isCompatible(item.def, manifest);
    box.addEventListener('change', () => {
      if (box.checked) character().equip(item);
      else character().unequip(item.def.slot);
      // another item in the same slot may have been replaced
      for (const other of items.querySelectorAll<HTMLInputElement>('input')) {
        other.checked = character().equippedIds.includes(other.dataset.id ?? '');
      }
    });
    box.dataset.id = item.def.id;
    const wrap = document.createElement('label');
    wrap.append(box, ` ${item.def.id}`);
    items.appendChild(wrap);
  }
  panel.append(items);

  document.body.appendChild(panel);
}
