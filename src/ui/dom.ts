type Child = Node | string | null | undefined | false;
type Attrs = Record<string, unknown>;

/** Tiny hyperscript helper: h('button', { class: 'x', onClick: fn }, 'Text'). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') el.className = String(value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    else if (key in el) (el as unknown as Record<string, unknown>)[key] = value;
    else el.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children) if (child) el.append(child);
  return el;
}

/** Appends children, skipping falsy ones (so `cond && node` works). */
export function add(parent: HTMLElement, ...children: Child[]): void {
  for (const child of children) if (child) parent.append(child);
}

let openModals = 0;
export const isModalOpen = (): boolean => openModals > 0;

export interface Modal {
  el: HTMLElement;
  body: HTMLElement;
  close(): void;
}

/** A bottom-sheet style dialog. `dismissible: false` removes the close button and backdrop dismissal. */
export function openModal(title: string, opts: { dismissible?: boolean; onClose?: () => void } = {}): Modal {
  const dismissible = opts.dismissible !== false;
  const body = h('div', { class: 'modal-body' });
  const card = h(
    'div',
    { class: 'modal-card', role: 'dialog', 'aria-label': title },
    h('div', { class: 'modal-head' }, h('h2', {}, title), dismissible && h('button', { class: 'icon-btn', 'aria-label': '×', onClick: () => close() }, '×')),
    body,
  );
  const el = h('div', { class: 'modal' }, card);
  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    openModals--;
    el.remove();
    opts.onClose?.();
  };
  if (dismissible) el.addEventListener('pointerdown', (e) => e.target === el && close());
  document.body.appendChild(el);
  openModals++;
  return { el, body, close };
}

export function toast(text: string, ms = 3200): void {
  let host = document.getElementById('toasts');
  if (!host) {
    host = h('div', { id: 'toasts', 'aria-live': 'polite' });
    document.body.appendChild(host);
  }
  const el = h('div', { class: 'toast' }, text);
  host.appendChild(el);
  window.setTimeout(() => el.classList.add('out'), ms);
  window.setTimeout(() => el.remove(), ms + 400);
}

export const newId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `g-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
