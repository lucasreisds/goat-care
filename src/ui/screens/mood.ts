import { moodToday, setMood } from '../../core/game';
import { MOODS, type Mood } from '../../core/state';
import { strings } from '../../i18n';
import type { AppContext } from '../context';
import { add, h, openModal } from '../dom';

const t = strings.ui.mood;

function pick<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)]!;
}

/** Daily mood check-in; the character answers by name, with a matching expression. */
export function openMood(ctx: AppContext): void {
  const modal = openModal(t.title);
  const current = moodToday(ctx.state, ctx.now());

  const choose = (mood: Mood): void => {
    ctx.commit(setMood(ctx.state, mood, ctx.now()));
    modal.close();
    const reply = pick(strings.moodReplies[mood])(ctx.state.profile.displayName);
    ctx.speak(reply, strings.moodExpression[mood]);
  };

  add(modal.body, 
    h(
      'div',
      { class: 'moods' },
      ...MOODS.map((mood) =>
        h('button', { class: `mood${mood === current ? ' on' : ''}`, onClick: () => choose(mood), 'aria-label': t.labels[mood] }, h('span', {}, t.emoji[mood]), h('small', {}, t.labels[mood])),
      ),
    ),
    current && h('p', { class: 'muted' }, t.done),
  );
}
