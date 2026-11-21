import type { ItemDef } from '../../character/pack/schema';
import { lookup, strings } from '../../i18n';
import { COMMIT_EVENT } from '../context';
import { h, openModal, type Modal } from '../dom';

export const itemName = (item: ItemDef): string => lookup(item.nameKey) ?? item.id;

/** Small pixel-art preview of an item (the same PNG the character wears). */
export function itemPreview(item: ItemDef): HTMLElement {
  return h('img', {
    class: 'item-preview',
    src: `${import.meta.env.BASE_URL}items/${item.file}`,
    alt: '',
    draggable: false,
  });
}

export const slotLabel = (slot: string): string => strings.ui.slots[slot] ?? slot;

/** Groups items by slot, keeping the order slots first appear in the list. */
export function bySlot(items: readonly ItemDef[]): Array<[string, ItemDef[]]> {
  const groups = new Map<string, ItemDef[]>();
  for (const item of items) groups.set(item.slot, [...(groups.get(item.slot) ?? []), item]);
  return [...groups.entries()];
}

/** A modal that redraws itself after every state change (buying and wearing happen inside it). */
export function openLiveModal(title: string, render: (body: HTMLElement, modal: Modal) => void): Modal {
  const modal = openModal(title, { onClose: () => window.removeEventListener(COMMIT_EVENT, redraw) });
  const redraw = (): void => {
    const scroll = modal.body.scrollTop;
    modal.body.replaceChildren();
    render(modal.body, modal);
    modal.body.scrollTop = scroll;
  };
  window.addEventListener(COMMIT_EVENT, redraw);
  render(modal.body, modal);
  return modal;
}
