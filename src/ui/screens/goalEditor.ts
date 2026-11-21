import { addGoal, archiveGoal, changeGoal, pauseGoal, resumeGoal } from '../../core/game';
import { MAX_TITLE_LENGTH, latestFields } from '../../core/goals/rules';
import type { Difficulty, GoalInput, Recurrence } from '../../core/goals/types';
import { POINTS } from '../../core/scoring';
import { strings } from '../../i18n';
import type { AppContext } from '../context';
import { add, h, newId, openModal } from '../dom';

const t = strings.ui.goal;
type RecType = Recurrence['type'];

/** Create a goal, or edit an existing one. Changes take effect from tomorrow. */
export function openGoalEditor(ctx: AppContext, goalId?: string): void {
  const existing = goalId ? ctx.state.goals.find((g) => g.id === goalId) : undefined;
  const fields = existing ? latestFields(existing) : undefined;
  const modal = openModal(existing ? t.editTitle : t.newTitle);

  // form state
  let difficulty: Difficulty = fields?.difficulty ?? 'easy';
  let recType: RecType = fields?.recurrence.type ?? 'daily';
  const weekdays = new Set<number>(fields?.recurrence.type === 'weekdays' ? fields.recurrence.weekdays : []);
  let times = fields?.recurrence.type === 'timesPerWeek' ? fields.recurrence.times : 3;
  let onceDate = fields?.recurrence.type === 'once' ? (fields.recurrence.date ?? '') : '';

  const title = h('input', { type: 'text', maxLength: MAX_TITLE_LENGTH, placeholder: t.titlePlaceholder, value: fields?.title ?? '', autocomplete: 'off' });
  const reminder = h('input', { type: 'time', value: fields?.reminderTime ?? '' });
  const error = h('p', { class: 'error' });

  const difficultyBox = h('div', { class: 'segmented' });
  const frequencySelect = h('select', {});
  for (const type of ['daily', 'weekdays', 'timesPerWeek', 'once'] as const) {
    frequencySelect.append(h('option', { value: type, selected: type === recType }, t.frequencies[type]));
  }
  const weekdayBox = h('div', { class: 'chips' });
  const timesBox = h('div', { class: 'stepper' });
  const dateInput = h('input', { type: 'date', value: onceDate });
  const dateRow = h('label', { class: 'field' }, h('span', {}, t.dateLabel), dateInput);

  const weekdayRow = h('div', { class: 'field' }, h('span', {}, t.weekdaysLabel), weekdayBox);
  const timesRow = h('div', { class: 'field' }, h('span', {}, t.timesLabel), timesBox);

  const redraw = (): void => {
    difficultyBox.replaceChildren(
      ...(['easy', 'medium', 'hard'] as const).map((d) =>
        h(
          'button',
          { type: 'button', class: `seg${d === difficulty ? ' on' : ''}`, onClick: () => { difficulty = d; redraw(); } },
          strings.ui.difficulty[d],
          h('small', {}, strings.ui.difficulty.points(POINTS[d])),
        ),
      ),
    );
    weekdayBox.replaceChildren(
      ...t.weekdayShort.map((name, i) =>
        h('button', { type: 'button', class: `chip${weekdays.has(i + 1) ? ' on' : ''}`, onClick: () => { weekdays.has(i + 1) ? weekdays.delete(i + 1) : weekdays.add(i + 1); redraw(); } }, name),
      ),
    );
    timesBox.replaceChildren(
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': '-', onClick: () => { times = Math.max(1, times - 1); redraw(); } }, '−'),
      h('strong', {}, String(times)),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': '+', onClick: () => { times = Math.min(7, times + 1); redraw(); } }, '+'),
    );
    weekdayRow.hidden = recType !== 'weekdays';
    timesRow.hidden = recType !== 'timesPerWeek';
    dateRow.hidden = recType !== 'once';
  };
  frequencySelect.addEventListener('change', () => {
    recType = frequencySelect.value as RecType;
    redraw();
  });
  dateInput.addEventListener('change', () => (onceDate = dateInput.value));

  const recurrence = (): Recurrence => {
    switch (recType) {
      case 'daily': return { type: 'daily' };
      case 'weekdays': return { type: 'weekdays', weekdays: [...weekdays].sort() };
      case 'timesPerWeek': return { type: 'timesPerWeek', times };
      case 'once': return onceDate ? { type: 'once', date: onceDate } : { type: 'once' };
    }
  };

  const save = (): void => {
    const input: GoalInput = { title: title.value, difficulty, recurrence: recurrence() };
    if (reminder.value) input.reminderTime = reminder.value;
    const result = existing
      ? changeGoal(ctx.state, existing.id, { ...input, reminderTime: input.reminderTime }, ctx.now())
      : addGoal(ctx.state, input, ctx.now(), newId());
    if (!result.ok) {
      error.textContent = result.reason === 'limit' ? t.limit : t.issues[result.issues?.[0] ?? 'title-empty'];
      return;
    }
    ctx.commit(result.state);
    ctx.toast(strings.ui.toast.startsTomorrow);
    modal.close();
  };

  const status = fields?.status;
  const extra =
    existing &&
    h(
      'div',
      { class: 'row' },
      status === 'active' && h('button', { class: 'btn', onClick: () => act(pauseGoal) }, t.pause),
      status === 'paused' && h('button', { class: 'btn', onClick: () => act(resumeGoal) }, t.resume),
      h('button', { class: 'btn danger', onClick: () => window.confirm(t.confirmArchive) && act(archiveGoal) }, t.archive),
    );
  const act = (fn: typeof pauseGoal): void => {
    if (!existing) return;
    const result = fn(ctx.state, existing.id, ctx.now());
    if (!result.ok) {
      error.textContent = result.reason === 'limit' ? t.limit : '';
      return;
    }
    ctx.commit(result.state);
    ctx.toast(strings.ui.toast.startsTomorrow);
    modal.close();
  };

  add(modal.body, 
    h('label', { class: 'field' }, h('span', {}, t.titleLabel), title),
    h('div', { class: 'field' }, h('span', {}, t.difficultyLabel), difficultyBox),
    h('label', { class: 'field' }, h('span', {}, t.frequencyLabel), frequencySelect),
    weekdayRow,
    timesRow,
    dateRow,
    h('label', { class: 'field' }, h('span', {}, t.reminderLabel), reminder),
    h('p', { class: 'muted' }, t.notice),
    existing?.pending && h('p', { class: 'muted' }, t.pendingNote),
    error,
    h('div', { class: 'row' }, h('button', { class: 'btn', onClick: () => modal.close() }, t.cancel), h('button', { class: 'btn primary', onClick: save }, t.save)),
    extra,
  );
  redraw();
  if (!existing) title.focus();
}
