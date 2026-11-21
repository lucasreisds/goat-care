import { totalsOf } from '../../core/state';
import { buyItem, itemsFor, statusOf } from '../../core/wardrobe';
import { strings } from '../../i18n';
import type { AppContext } from '../context';
import { add, h } from '../dom';
import { bySlot, itemName, itemPreview, openLiveModal, slotLabel } from './itemList';

const t = strings.ui.shop;

/** "Loja": spend coins on items that fit the active character; achievement items show what unlocks them. */
export function openShop(ctx: AppContext): void {
  openLiveModal(t.title, (body, modal) => {
    const { pack, items } = ctx.assets;
    const catalog = itemsFor(
      items.map((i) => i.def),
      pack.manifest,
    );
    add(body, h('p', { class: 'balance' }, t.balance(totalsOf(ctx.state).coins)));
    if (catalog.length === 0) add(body, h('p', { class: 'muted' }, t.empty));

    for (const [slot, group] of bySlot(catalog)) {
      add(body, h('h4', {}, slotLabel(slot)));
      for (const item of group) {
        const status = statusOf(ctx.state, item);
        let action: HTMLElement;
        let note: string | null = null;

        if (status.kind === 'owned') {
          action = h('span', { class: 'badge ok' }, t.owned);
        } else if (status.kind === 'locked') {
          const achievement = strings.ui.achievements[status.achievementId];
          action = h('span', { class: 'badge' }, `🔒 ${achievement?.name ?? status.achievementId}`);
          note = achievement?.hint ?? null;
        } else {
          const missing = status.cost - totalsOf(ctx.state).coins;
          action = h(
            'button',
            {
              class: 'btn small primary',
              disabled: !status.affordable,
              onClick: () => {
                const result = buyItem(ctx.state, item, ctx.now());
                if (!result.ok) return;
                ctx.commit(result.state);
                ctx.toast(t.bought(itemName(item)));
              },
            },
            status.affordable ? t.buy(status.cost) : t.missing(missing),
          );
        }

        add(
          body,
          h(
            'div',
            { class: 'item-row' },
            itemPreview(item),
            h('div', { class: 'item-info' }, h('strong', {}, itemName(item)), note && h('small', {}, note)),
            action,
          ),
        );
      }
    }
    add(body, h('button', { class: 'btn', onClick: () => { modal.close(); ctx.open.wardrobe(); } }, t.toWardrobe));
  });
}
