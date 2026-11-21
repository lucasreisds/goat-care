import { stageForAltitude } from '../../character/pack/rules';
import { agendaFor } from '../../core/goals/agenda';
import { METERS_PER_POINT } from '../../core/progression/rewards';
import { addDays, dayKeyOf } from '../../core/time/calendar';
import { weekWinner } from '../../online/model';
import type { RankingEntry, WeekResult } from '../../online/session';
import { strings } from '../../i18n';
import type { AppContext } from '../context';
import { add, h } from '../dom';
import { formatDay } from '../format';
import { openLiveModal } from './itemList';

const t = strings.ui.ranking;
const HISTORY_WEEKS = 8;

/**
 * "Ranking da semana": the two characters climb the same mountain side by side, at the altitude
 * each one earned this week, updating live. The summit is a perfect week (cap x 7 days).
 */
export function openRanking(ctx: AppContext): void {
  const { session } = ctx;
  let history: WeekResult[] | null = null;
  const historyEl = h('div', {});

  const nameOf = (entry: RankingEntry): string =>
    entry.uid === session.uid ? t.you : (entry.card?.displayName ?? t.partnerFallback);

  const drawHistory = (): void => {
    if (history === null) return void historyEl.replaceChildren(h('p', { class: 'muted' }, t.historyLoading));
    if (history.length === 0) return void historyEl.replaceChildren(h('p', { class: 'muted' }, t.historyEmpty));
    const partnerUid = session.partnerUid;
    const partnerName = session.partner?.displayName ?? t.partnerFallback;
    historyEl.replaceChildren(
      ...history.map((week) => {
        const mine = week.scores[session.uid] ?? 0;
        const theirs = partnerUid ? (week.scores[partnerUid] ?? 0) : 0;
        const winner = weekWinner(week.scores);
        const verdict = winner === null ? t.draw : winner === session.uid ? `🏆 ${t.won}` : t.lost(partnerName);
        return h(
          'div',
          { class: 'line' },
          h('span', {}, `${formatDay(week.weekKey)} a ${formatDay(addDays(week.weekKey, 6))}`),
          h('strong', {}, partnerUid ? t.historyRow(mine, theirs) : String(mine)),
          h('small', {}, partnerUid ? verdict : ''),
        );
      }),
    );
  };

  openLiveModal(t.title, (body, modal) => {
    const entries = session.ranking();
    const cap = ctx.state.settings.dailyCap;
    const summit = cap * 7 * METERS_PER_POINT;
    const stages = ctx.assets.pack.manifest.stages;

    const climb = h('div', { class: 'climb' }, h('div', { class: 'climb-mountain' }), h('div', { class: 'climb-summit' }, `⛳ ${t.summit(summit)}`));
    entries.forEach((entry, index) => {
      const meters = entry.points * METERS_PER_POINT;
      const pct = Math.min(1, meters / summit);
      const mine = entry.uid === session.uid;
      const tag = !entry.card ? t.partnerFallback : mine ? t.labelMine(entry.card.characterName) : t.label(entry.card.characterName, entry.card.displayName);
      const climber = h(
        'div',
        { class: `climber${mine ? ' me' : ''}`, style: `left:${entries.length === 1 ? 50 : index === 0 ? 27 : 73}%;--climb:${pct.toFixed(3)}` },
        h('span', { class: 'climber-tag' }, h('strong', {}, tag), h('small', {}, t.score(meters, entry.points))),
      );
      if (entry.card) climber.append(ctx.portrait(stageForAltitude(stages, entry.card.altitude).id, entry.card.outfit));
      climb.append(climber);
    });
    add(body, climb);

    if (entries.length < 2) {
      add(body, h('p', { class: 'muted' }, t.noPartner), h('button', { class: 'btn primary', onClick: () => { modal.close(); ctx.open.couple(); } }, t.invite));
    } else {
      const [me, partner] = entries as [RankingEntry, RankingEntry];
      const status = me.points === partner.points ? t.tied : me.points > partner.points ? t.leadingYou : t.leading(nameOf(partner));
      add(body, h('p', { class: 'climb-status' }, status));
    }
    if (session.pendingSync > 0) add(body, h('p', { class: 'muted' }, `⏳ ${t.pending(session.pendingSync)}`));
    add(body, h('p', { class: 'muted' }, t.resets));

    // The partner's goals are visible (decision 1), read-only.
    const partner = session.partner;
    if (session.partnerUid) {
      const today = dayKeyOf(ctx.now(), ctx.state.settings.timezone);
      const items = agendaFor(session.partnerGoals, session.partnerWeekCompletions, today);
      add(body, h('h4', {}, t.partnerToday(partner?.displayName ?? t.partnerFallback)));
      if (items.length === 0) add(body, h('p', { class: 'muted' }, t.partnerNoGoals));
      for (const item of items) {
        add(
          body,
          h(
            'div',
            { class: `task readonly${item.state === 'done' ? ' done' : ''}` },
            h('span', { class: 'check-btn' }, item.state === 'done' ? '✓' : ''),
            h('span', { class: 'task-text' }, h('span', {}, item.fields.title)),
            h('span', { class: `tag ${item.fields.difficulty}` }, strings.ui.difficulty[item.fields.difficulty]),
          ),
        );
      }
    }

    add(body, h('h4', {}, t.historyTitle), historyEl);
  });

  drawHistory();
  session.history(HISTORY_WEEKS).then(
    (weeks) => {
      history = weeks;
      drawHistory();
    },
    () => {
      history = [];
      drawHistory();
    },
  );
}
