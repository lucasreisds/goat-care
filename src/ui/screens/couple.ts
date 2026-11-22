import { dayKeyOf } from '../../core/time/calendar';
import { INVITE_TTL_MINUTES, MAX_DAILY_CAP, MIN_DAILY_CAP } from '../../online/model';
import { strings } from '../../i18n';
import type { AppContext } from '../context';
import { add, h } from '../dom';
import { formatDay } from '../format';
import { openLiveModal } from './itemList';

const t = strings.ui.couple;

/** "Dupla": invite the partner (while alone) and agree on the daily cap together. */
export function openCouple(ctx: AppContext): void {
  const { session } = ctx;
  // kept across redraws (the modal redraws whenever the couple changes)
  let invite: { code: string; expiresAt: Date } | null = null;
  let draftCap = ctx.state.settings.dailyCap;

  const guard = async (button: HTMLButtonElement, task: () => Promise<void>, failed: string): Promise<void> => {
    button.disabled = true;
    try {
      await task();
    } catch (error) {
      console.error(error);
      ctx.toast(failed);
      button.disabled = false;
    }
  };

  openLiveModal(t.title, (body, modal) => {
    const redraw = (): void => {
      body.replaceChildren();
      draw();
    };

    const drawInvite = (): void => {
      add(body, h('p', {}, t.alone));
      if (invite && invite.expiresAt.getTime() > Date.now()) {
        const code = invite.code;
        add(
          body,
          h('div', { class: 'invite-code', 'aria-label': code }, code),
          h('p', { class: 'muted' }, t.codeNote(INVITE_TTL_MINUTES)),
          h('button', {
            class: 'btn',
            onClick: () => {
              navigator.clipboard?.writeText(code).then(
                () => ctx.toast(t.copied),
                () => undefined,
              );
            },
          }, t.copy),
        );
      }
      const generate = h('button', { class: `btn${invite ? '' : ' primary'}` }, invite ? t.anotherCode : t.newCode);
      generate.addEventListener('click', () =>
        void guard(generate, async () => {
          invite = await session.createInvite();
          redraw();
        }, t.codeFailed),
      );
      add(body, generate);
    };

    const drawCap = (): void => {
      const couple = session.couple;
      const partner = session.partner;
      add(body, h('h4', {}, t.capTitle), h('p', {}, t.capCurrent(ctx.state.settings.dailyCap)));
      const today = dayKeyOf(ctx.now(), ctx.state.settings.timezone);
      if (couple.capNext && couple.capNext.from > today) add(body, h('p', {}, t.capNext(couple.capNext.value, formatDay(couple.capNext.from))));
      add(body, h('p', { class: 'muted' }, t.capExplain));

      if (!session.partnerUid) {
        add(body, h('p', { class: 'muted' }, t.capNeedsPartner));
        return;
      }

      const proposal = couple.capProposal;
      if (proposal && proposal.by !== session.uid) {
        const accept = h('button', { class: 'btn primary' }, t.capAccept);
        accept.addEventListener('click', () => void guard(accept, async () => { await session.acceptCap(); ctx.toast(t.capAccepted); }, t.capFailed));
        const decline = h('button', { class: 'btn' }, t.capDecline);
        decline.addEventListener('click', () => void guard(decline, () => session.declineCap(), t.capFailed));
        add(body, h('p', {}, t.capTheirs(partner?.displayName ?? strings.ui.ranking.partnerFallback, proposal.value)), h('div', { class: 'row' }, decline, accept));
        return;
      }
      if (proposal) {
        const withdraw = h('button', { class: 'btn' }, t.capWithdraw);
        withdraw.addEventListener('click', () => void guard(withdraw, () => session.declineCap(), t.capFailed));
        add(body, h('p', {}, t.capMine(proposal.value)), withdraw);
        return;
      }

      const value = h('strong', {}, String(draftCap));
      const send = h('button', { class: 'btn primary' }, t.capProposeSend(draftCap));
      const step = (delta: number) => (): void => {
        draftCap = Math.max(MIN_DAILY_CAP, Math.min(MAX_DAILY_CAP, draftCap + delta));
        value.textContent = String(draftCap);
        send.textContent = t.capProposeSend(draftCap);
        send.disabled = draftCap === ctx.state.settings.dailyCap;
      };
      send.disabled = draftCap === ctx.state.settings.dailyCap;
      send.addEventListener('click', () => void guard(send, async () => { await session.proposeCap(draftCap); ctx.toast(t.capProposed); }, t.capFailed));
      add(
        body,
        h('div', { class: 'stepper' }, h('button', { class: 'btn small', onClick: step(-1) }, '−'), value, h('button', { class: 'btn small', onClick: step(1) }, '+')),
        send,
      );
    };

    const draw = (): void => {
      const partner = session.partner;
      if (!session.partnerUid) drawInvite();
      else if (partner) add(body, h('p', { class: 'partner-line' }, `🐐 ${t.partner(partner.characterName, partner.displayName)}`));
      else add(body, h('p', { class: 'muted' }, t.partnerPending));
      drawCap();
      if (session.partnerUid) {
        add(
          body,
          h('div', { class: 'row' },
            h('button', { class: 'btn', onClick: () => { modal.close(); ctx.open.ranking(); } }, `🏆 ${strings.ui.menu.ranking}`),
            h('button', { class: 'btn', onClick: () => { modal.close(); ctx.open.caresses(); } }, `💌 ${strings.ui.menu.caresses}`),
          ),
        );
      }
    };
    draw();
  });
}
