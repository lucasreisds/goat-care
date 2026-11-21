import { MAX_CHARACTER_NAME, MAX_DISPLAY_NAME, renameCharacter, renameDisplayName, suggestName } from '../../core/game';
import { characterNameOf } from '../../core/state';
import { dayKeyOf, previousWeekKey, weekKeyOf } from '../../core/time/calendar';
import { strings } from '../../i18n';
import type { AppContext } from '../context';
import { h, openModal } from '../dom';

const t = strings.ui.settings;
const onb = strings.ui.onboarding;

export function openMenu(ctx: AppContext): void {
  const modal = openModal(strings.ui.menu.title);
  const go = (fn: () => void) => (): void => {
    modal.close();
    fn();
  };
  modal.body.append(
    h('button', { class: 'btn menu-item', onClick: go(() => ctx.open.goalsList()) }, strings.ui.menu.goals),
    h('button', { class: 'btn menu-item', onClick: go(() => ctx.open.ranking()) }, `🏆 ${strings.ui.menu.ranking}`),
    h('button', { class: 'btn menu-item', onClick: go(() => ctx.open.caresses()) }, `💌 ${strings.ui.menu.caresses}`),
    h('button', { class: 'btn menu-item', onClick: go(() => ctx.open.couple()) }, `🐐 ${strings.ui.menu.couple}`),
    h('button', { class: 'btn menu-item', onClick: go(() => ctx.open.shop()) }, `🛍️ ${strings.ui.menu.shop}`),
    h('button', { class: 'btn menu-item', onClick: go(() => ctx.open.wardrobe()) }, `👕 ${strings.ui.menu.wardrobe}`),
    h('button', { class: 'btn menu-item', onClick: go(() => ctx.open.summary()) }, strings.ui.menu.summary),
    h('button', { class: 'btn menu-item', onClick: go(() => ctx.open.weeklyReview(previousWeek(ctx))) }, strings.ui.menu.review),
    h('button', { class: 'btn menu-item', onClick: go(() => ctx.open.settings()) }, strings.ui.menu.settings),
  );
}

const previousWeek = (ctx: AppContext) => previousWeekKey(weekKeyOf(dayKeyOf(ctx.now(), ctx.state.settings.timezone)));

export function openSettings(ctx: AppContext): void {
  const modal = openModal(t.title);
  const ownerInput = h('input', { type: 'text', maxLength: MAX_DISPLAY_NAME, value: ctx.state.profile.displayName });
  const charInput = h('input', { type: 'text', maxLength: MAX_CHARACTER_NAME, value: characterNameOf(ctx.state) });
  const review = h('input', { type: 'checkbox', checked: ctx.state.settings.weeklyReviewEnabled });
  const error = h('p', { class: 'error' });

  const save = (): void => {
    let next = renameDisplayName(ctx.state, ownerInput.value);
    if (typeof next === 'string') return void (error.textContent = onb.issues[next]);
    next = renameCharacter(next, next.profile.activeCharacterId, charInput.value);
    if (typeof next === 'string') return void (error.textContent = onb.issues[next]);
    ctx.commit({ ...next, settings: { ...next.settings, weeklyReviewEnabled: review.checked } });
    ctx.toast(strings.ui.toast.saved);
    modal.close();
  };

  modal.body.append(
    h('label', { class: 'field' }, h('span', {}, t.yourName), ownerInput),
    h('label', { class: 'field' }, h('span', {}, t.characterName), charInput),
    h('button', { class: 'btn', type: 'button', onClick: () => (charInput.value = suggestName(strings.suggestedNames, Math.random, charInput.value)) }, `🎲 ${onb.random}`),
    h('label', { class: 'check' }, review, h('span', {}, t.weeklyReview)),
    h('p', { class: 'muted' }, t.timezoneNote(ctx.state.settings.timezone)),
    h('p', { class: 'muted' }, t.capNote(ctx.state.settings.dailyCap)),
    error,
    h('button', { class: 'btn primary', onClick: save }, t.save),
    h('p', { class: 'muted' }, t.account(ctx.account.email)),
    h('button', {
      class: 'btn danger',
      onClick: () => {
        const warning = ctx.session.pendingSync > 0 ? `${t.pendingSync}\n\n` : '';
        if (window.confirm(`${warning}${t.confirmSignOut}`)) void ctx.account.signOut();
      },
    }, t.signOut),
  );
}
