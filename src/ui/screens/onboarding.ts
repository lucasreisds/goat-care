import { MAX_CHARACTER_NAME, MAX_DISPLAY_NAME, suggestName, validateCharacterName } from '../../core/game';
import { strings } from '../../i18n';
import { h, openModal } from '../dom';

const t = strings.ui.onboarding;

export interface Names {
  displayName: string;
  characterName: string;
}

/** Two steps: the player's name, then the name of their character (with a random suggestion). */
export function askNames(): Promise<Names> {
  return new Promise((resolve) => {
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
        const issue = validateCharacterName(input.value);
        if (issue) {
          error.textContent = t.issues[issue];
          return;
        }
        modal.close();
        resolve({ displayName, characterName: input.value.trim() });
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
  });
}
