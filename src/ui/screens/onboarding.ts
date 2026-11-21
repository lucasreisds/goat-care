import { completeOnboarding, MAX_CHARACTER_NAME, MAX_DISPLAY_NAME, suggestName } from '../../core/game';
import { strings } from '../../i18n';
import type { AppContext } from '../context';
import { h, openModal } from '../dom';

const t = strings.ui.onboarding;

/** Two steps: the player's name, then the name of their character (with a random suggestion). */
export function openOnboarding(ctx: AppContext): void {
  const modal = openModal(t.welcomeTitle, { dismissible: false });
  let displayName = '';

  const showNameStep = (): void => {
    const input = h('input', { type: 'text', maxLength: MAX_DISPLAY_NAME, placeholder: t.yourNamePlaceholder, value: displayName, autocomplete: 'off' });
    const error = h('p', { class: 'error' });
    const next = (): void => {
      const value = input.value.trim();
      if (value.length === 0) {
        error.textContent = t.issues.empty;
        return;
      }
      displayName = value;
      showCharacterStep();
    };
    modal.body.replaceChildren(
      h('p', {}, t.welcomeText),
      h('label', { class: 'field' }, h('span', {}, t.yourNameLabel), input),
      error,
      h('button', { class: 'btn primary', onClick: next }, t.next),
    );
    input.addEventListener('keydown', (e) => e.key === 'Enter' && next());
    input.focus();
  };

  const showCharacterStep = (): void => {
    const input = h('input', {
      type: 'text',
      maxLength: MAX_CHARACTER_NAME,
      value: suggestName(strings.suggestedNames, Math.random),
      autocomplete: 'off',
    });
    const error = h('p', { class: 'error' });
    const finish = (): void => {
      const result = completeOnboarding(ctx.state, displayName, input.value);
      if (typeof result === 'string') {
        error.textContent = t.issues[result];
        return;
      }
      ctx.commit(result);
      modal.close();
      ctx.speak(strings.greetings.firstMeeting(displayName), 'happy');
    };
    modal.body.replaceChildren(
      h('h3', {}, t.characterTitle),
      h('label', { class: 'field' }, h('span', {}, t.characterLabel), input),
      h('button', { class: 'btn', type: 'button', onClick: () => (input.value = suggestName(strings.suggestedNames, Math.random, input.value)) }, `🎲 ${t.random}`),
      error,
      h('button', { class: 'btn primary', onClick: finish }, t.start),
    );
  };

  showNameStep();
}
