import { totalsOf } from '../../core/state';
import { itemsFor } from '../../core/wardrobe';
import { strings } from '../../i18n';
import type { AppContext } from '../context';
import { add, h } from '../dom';
import { itemName, itemPreview, openLiveModal } from './itemList';

const t = strings.ui.caresses;

/**
 * "Carinhos": quick predefined messages and item gifts for the partner, delivered in real time.
 * There is no free text on purpose.
 */
export function openCaresses(ctx: AppContext): void {
  const { session } = ctx;
  let sending = false;

  const send = async (task: () => Promise<void>): Promise<void> => {
    if (sending) return;
    sending = true;
    try {
      await task();
    } catch (error) {
      console.error(error);
      ctx.toast(t.failed);
    } finally {
      sending = false;
    }
  };

  openLiveModal(t.title, (body, modal) => {
    const partner = session.partner;
    if (!session.partnerUid || !partner) {
      add(body, h('p', { class: 'muted' }, t.noPartner), h('button', { class: 'btn primary', onClick: () => { modal.close(); ctx.open.couple(); } }, strings.ui.ranking.invite));
      return;
    }
    const name = partner.displayName;

    add(body, h('p', { class: 'partner-line' }, `💌 ${t.to(strings.ui.couple.partner(partner.characterName, name))}`), h('h4', {}, t.messagesTitle));
    const grid = h('div', { class: 'caress-grid' });
    for (const [id, text] of Object.entries(strings.caressMessages)) {
      grid.append(
        h('button', {
          class: 'btn caress',
          onClick: () =>
            void send(async () => {
              await session.sendCaress('message', id);
              ctx.toast(t.sent);
              modal.close();
            }),
        }, text),
      );
    }
    add(body, grid);

    // Gifts: shop items the partner does not have yet, paid with my coins.
    const { pack, items } = ctx.assets;
    const alreadySent = new Set(Object.values(ctx.state.giftsSent).map((g) => g.itemId));
    const gifts = itemsFor(items.map((i) => i.def), pack.manifest).filter(
      (item) => item.unlock.type === 'coins' && !partner.owned.includes(item.id) && !alreadySent.has(item.id),
    );
    add(body, h('h4', {}, t.giftsTitle), h('p', { class: 'balance' }, strings.ui.shop.balance(totalsOf(ctx.state).coins)));
    if (gifts.length === 0) add(body, h('p', { class: 'muted' }, t.giftsEmpty(name)));
    for (const item of gifts) {
      const cost = item.unlock.type === 'coins' ? item.unlock.cost : 0;
      const missing = cost - totalsOf(ctx.state).coins;
      add(
        body,
        h(
          'div',
          { class: 'item-row' },
          itemPreview(item),
          h('div', { class: 'item-info' }, h('strong', {}, itemName(item))),
          h('button', {
            class: 'btn small primary',
            disabled: missing > 0,
            onClick: () =>
              void send(async () => {
                const id = await session.sendCaress('gift', item.id);
                ctx.commit({ ...ctx.state, giftsSent: { ...ctx.state.giftsSent, [id]: { itemId: item.id, at: ctx.now().toISOString(), paid: cost } } });
                ctx.toast(t.giftSent(itemName(item), name));
              }),
          }, missing > 0 ? strings.ui.shop.missing(missing) : t.gift(cost)),
        ),
      );
    }
  });
}
