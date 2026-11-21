import { countActiveGoals, latestFields } from '../../core/goals/rules';
import type { Goal } from '../../core/goals/types';
import { POINTS } from '../../core/scoring';
import { dayKeyOf } from '../../core/time/calendar';
import { strings } from '../../i18n';
import type { AppContext } from '../context';
import { add, h, openModal } from '../dom';
import { describeRecurrence } from '../format';

const t = strings.ui.goal;

export function goalRow(ctx: AppContext, goal: Goal, extra?: HTMLElement | false): HTMLElement {
  const fields = latestFields(goal);
  const today = dayKeyOf(ctx.now(), ctx.state.settings.timezone);
  return h(
    'div',
    { class: 'goal-row' },
    h(
      'button',
      { class: 'goal-main', onClick: () => ctx.open.goalEditor(goal.id) },
      h('strong', {}, fields.title),
      h(
        'small',
        {},
        `${describeRecurrence(fields.recurrence)} · ${strings.ui.difficulty[fields.difficulty]} (${strings.ui.difficulty.points(POINTS[fields.difficulty])})`,
      ),
      fields.status === 'paused' && h('span', { class: 'badge' }, t.pausedBadge),
      goal.effectiveFrom > today && h('span', { class: 'badge' }, t.startsTomorrowBadge),
    ),
    extra,
  );
}

/** "Minhas metas": every goal that is active or paused (archived ones are hidden). */
export function openGoalsList(ctx: AppContext): void {
  const modal = openModal(t.listTitle);
  const goals = ctx.state.goals.filter((g) => latestFields(g).status !== 'archived');

  const active = goals.filter((g) => latestFields(g).status === 'active');
  const paused = goals.filter((g) => latestFields(g).status === 'paused');

  add(modal.body, 
    h('p', { class: 'muted' }, t.activeCount(countActiveGoals(ctx.state.goals))),
    goals.length === 0 && h('p', {}, t.listEmpty),
    ...active.map((g) => goalRow(ctx, g)),
    ...paused.map((g) => goalRow(ctx, g)),
    h('button', { class: 'btn primary', onClick: () => { modal.close(); ctx.open.goalEditor(); } }, `+ ${strings.ui.home.addGoal}`),
  );
}
