import { localHour, type HourSource } from '../core/time/clock';

const formatHour = (hour: number): string => {
  const h = Math.floor(hour);
  const m = Math.floor((hour - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

/** Dev-only overlay to scrub the time of day. Shown in `npm run dev` or with `?debug`. */
export function mountDebugPanel(hours: HourSource): void {
  const enabled = import.meta.env.DEV || new URLSearchParams(location.search).has('debug');
  if (!enabled) return;

  const panel = document.createElement('div');
  panel.className = 'debug';

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

  panel.append(autoLabel, slider, label);
  document.body.appendChild(panel);

  slider.addEventListener('input', () => {
    auto.checked = false;
    hours.set(Number(slider.value));
    label.textContent = formatHour(hours.get());
  });
  auto.addEventListener('change', () => {
    hours.set(auto.checked ? null : Number(slider.value));
  });

  window.setInterval(() => {
    if (!hours.isOverridden) {
      slider.value = String(localHour());
      label.textContent = formatHour(localHour());
    }
  }, 1000);
}
