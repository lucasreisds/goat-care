import { MAX_CHARACTER_NAME, MAX_DISPLAY_NAME, renameCharacter, renameDisplayName, suggestName } from '../../core/game';
import { STORAGE_KEY } from '../../data/localStore';
import { characterNameOf } from '../../core/state';
import { dayKeyOf, previousWeekKey, weekKeyOf } from '../../core/time/calendar';
import { strings } from '../../i18n';
import type { AppContext } from '../context';
import { h, openModal } from '../dom';

const t = strings.ui.settings;
const onb = strings.ui.onboarding;

const TIMEZONES = ['America/Sao_Paulo', 'America/Manaus', 'America/Fortaleza', 'America/Rio_Branco', 'America/Noronha', 'Europe/Lisbon'];

export function openMenu(ctx: AppContext): void {
  const modal = openModal(strings.ui.menu.title);
  const go = (fn: () => void) => (): void => {
    modal.close();
    fn();
  };
  modal.body.append(
    h('button', { class: 'btn menu-item', onClick: go(() => ctx.open.goalsList()) }, strings.ui.menu.goals),
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
  const zone = h('select', {});
  for (const tz of TIMEZONES) zone.append(h('option', { value: tz, selected: tz === ctx.state.settings.timezone }, tz));
  const error = h('p', { class: 'error' });

  const save = (): void => {
    let next = renameDisplayName(ctx.state, ownerInput.value);
    if (typeof next === 'string') return void (error.textContent = onb.issues[next]);
    next = renameCharacter(next, next.profile.activeCharacterId, charInput.value);
    if (typeof next === 'string') return void (error.textContent = onb.issues[next]);
    ctx.commit({ ...next, settings: { ...next.settings, weeklyReviewEnabled: review.checked, timezone: zone.value } });
    ctx.toast(strings.ui.toast.saved);
    modal.close();
  };

  modal.body.append(
    h('label', { class: 'field' }, h('span', {}, t.yourName), ownerInput),
    h('label', { class: 'field' }, h('span', {}, t.characterName), charInput),
    h('button', { class: 'btn', type: 'button', onClick: () => (charInput.value = suggestName(strings.suggestedNames, Math.random, charInput.value)) }, `🎲 ${onb.random}`),
    h('label', { class: 'check' }, review, h('span', {}, t.weeklyReview)),
    h('label', { class: 'field' }, h('span', {}, t.timezone), zone),
    h('p', { class: 'muted' }, t.capNote(ctx.state.settings.dailyCap)),
    error,
    h('button', { class: 'btn primary', onClick: save }, t.save),
    h('button', { class: 'btn danger', onClick: () => { if (window.confirm(t.confirmReset)) { try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* storage unavailable */ } window.location.reload(); } } }, t.reset),
  );
}
