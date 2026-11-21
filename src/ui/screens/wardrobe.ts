import { equippedIn, equipItem, isOwned, itemsFor, unequipSlot } from '../../core/wardrobe';
import { strings } from '../../i18n';
import type { AppContext } from '../context';
import { add, h } from '../dom';
import { bySlot, itemName, itemPreview, openLiveModal, slotLabel } from './itemList';

const t = strings.ui.wardrobe;

/** "Guarda-roupa": wear or take off the items the player owns, one per slot. */
export function openWardrobe(ctx: AppContext): void {
  openLiveModal(t.title, (body, modal) => {
    const { pack, items } = ctx.assets;
    const owned = itemsFor(
      items.map((i) => i.def),
      pack.manifest,
    ).filter((item) => isOwned(ctx.state, item));

    if (owned.length === 0) add(body, h('p', { class: 'muted' }, t.nothing));
    const worn = equippedIn(ctx.state);

    for (const [slot, group] of bySlot(owned)) {
      add(body, h('h4', {}, slotLabel(slot)));
      for (const item of group) {
        const wearing = worn[slot] === item.id;
        add(
          body,
          h(
            'div',
            { class: 'item-row' },
            itemPreview(item),
            h('div', { class: 'item-info' }, h('strong', {}, itemName(item))),
            h(
              'button',
              {
                class: `btn small${wearing ? '' : ' primary'}`,
                onClick: () => {
                  if (wearing) return ctx.commit(unequipSlot(ctx.state, slot));
                  const result = equipItem(ctx.state, item, pack.manifest);
                  if (result.ok) ctx.commit(result.state);
                },
              },
              wearing ? t.remove : t.wear,
            ),
          ),
        );
      }
    }
    add(body, h('button', { class: 'btn', onClick: () => { modal.close(); ctx.open.shop(); } }, t.toShop));
  });
}
