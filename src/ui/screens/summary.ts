import { pauseGoal, recordWeeklyReview, resumeGoal, archiveGoal } from '../../core/game';
import { latestFields } from '../../core/goals/rules';
import { summarizeWeek, type WeekSummary } from '../../core/summary';
import { addDays, dayKeyOf, previousWeekKey, weekKeyOf, type DayKey } from '../../core/time/calendar';
import { strings } from '../../i18n';
import { COMMIT_EVENT, type AppContext } from '../context';
import { h, openModal } from '../dom';
import { formatDay } from '../format';
import { goalRow } from './goalsList';

const s = strings.ui.summary;
const r = strings.ui.review;
const g = strings.ui.goal;

function stat(label: string, value: string): HTMLElement {
  return h('div', { class: 'stat' }, h('strong', {}, value), h('small', {}, label));
}

function summaryBlock(title: string, week: WeekSummary): HTMLElement {
  return h(
    'section',
    { class: 'summary-block' },
    h('h3', {}, title, h('small', {}, ` ${s.range(formatDay(week.weekKey), formatDay(addDays(week.weekKey, 6)))}`)),
    week.completions === 0 && week.goals.length === 0
      ? h('p', { class: 'muted' }, s.nothing)
      : h(
          'div',
          {},
          h(
            'div',
            { class: 'stats' },
            stat(s.points, String(week.points)),
            stat(s.completions, String(week.completions)),
            stat(s.coins, String(week.coins)),
            stat(s.altitude, `${week.altitude} m`),
            stat(s.activeDays, `${week.activeDays}/7`),
          ),
          week.goals.length > 0 && h('h4', {}, s.perGoal),
          ...week.goals.map((line) => {
            const pct = line.target > 0 ? Math.min(100, Math.round((line.done / line.target) * 100)) : 0;
            return h(
              'div',
              { class: 'line' },
              h('span', {}, line.title),
              h('span', { class: 'bar' }, h('i', { style: `width:${pct}%` })),
              h('small', {}, `${line.done}/${line.target}`),
            );
          }),
        ),
  );
}

/** "Resumo da semana": this week so far and the last one. */
export function openSummary(ctx: AppContext): void {
  const modal = openModal(s.title);
  const thisWeek = weekKeyOf(dayKeyOf(ctx.now(), ctx.state.settings.timezone));
  modal.body.append(
    summaryBlock(s.thisWeek, summarizeWeek(ctx.state.goals, ctx.state.completions, thisWeek)),
    summaryBlock(s.lastWeek, summarizeWeek(ctx.state.goals, ctx.state.completions, previousWeekKey(thisWeek))),
  );
}

/**
 * "Revisão semanal" (optional, offered on Mondays): the previous week's summary and, per goal,
 * keep / edit / pause / archive. Closing it any way leaves every goal exactly as it was.
 */
export function openWeeklyReview(ctx: AppContext, weekKey: DayKey): void {
  let handled = false;
  const markHandled = (): void => {
    if (handled) return;
    handled = true;
    ctx.commit(recordWeeklyReview(ctx.state, weekKey, ctx.now()));
  };
  const redraw = (): void => draw();
  const modal = openModal(r.title, {
    onClose: () => {
      window.removeEventListener(COMMIT_EVENT, redraw);
      markHandled();
    },
  });
  window.addEventListener(COMMIT_EVENT, redraw);
  const list = h('div', {});
  const kept = new Set<string>();

  const draw = (): void => {
    const goals = ctx.state.goals.filter((goal) => latestFields(goal).status !== 'archived');
    list.replaceChildren(
      ...goals.map((goal) => {
        const status = latestFields(goal).status;
        const apply = (fn: typeof pauseGoal) => (): void => {
          const result = fn(ctx.state, goal.id, ctx.now());
          if (result.ok) {
            ctx.commit(result.state);
            ctx.toast(r.changesTomorrow);
          } else if (result.reason === 'limit') ctx.toast(g.limit);
          draw();
        };
        return goalRow(
          ctx,
          goal,
          h(
            'div',
            { class: 'row tight' },
            kept.has(goal.id) ? h('span', { class: 'badge ok' }, r.kept) : h('button', { class: 'btn small', onClick: () => { kept.add(goal.id); draw(); } }, r.keep),
            h('button', { class: 'btn small', onClick: () => ctx.open.goalEditor(goal.id) }, r.edit),
            status === 'active'
              ? h('button', { class: 'btn small', onClick: apply(pauseGoal) }, g.pause)
              : h('button', { class: 'btn small', onClick: apply(resumeGoal) }, g.resume),
            h('button', { class: 'btn small danger', onClick: () => window.confirm(g.confirmArchive) && apply(archiveGoal)() }, g.archive),
          ),
        );
      }),
    );
  };
  draw();

  modal.body.append(
    h('p', { class: 'muted' }, r.intro),
    summaryBlock(s.lastWeek, summarizeWeek(ctx.state.goals, ctx.state.completions, weekKey)),
    list,
    h('button', { class: 'btn', onClick: () => ctx.open.goalEditor() }, `+ ${r.newGoal}`),
    h('div', { class: 'row' }, h('button', { class: 'btn', onClick: () => modal.close() }, r.later), h('button', { class: 'btn primary', onClick: () => modal.close() }, r.done)),
  );
}
