import { stageForAltitude } from '../character/pack/rules';
import {
  agenda,
  completeGoal,
  currentStreak,
  moodToday,
  pendingWeeklyReview,
  pointsOnDay,
  settle,
} from '../core/game';
import { nextMilestone, progressToNextMilestone } from '../core/progression/rewards';
import { characterNameOf, totalsOf, type GameState } from '../core/state';
import { dayKeyOf } from '../core/time/calendar';
import { loadState, saveState, type KeyValueStore } from '../data/localStore';
import { strings } from '../i18n';
import type { CharacterAssets, HomeScene } from '../render/HomeScene';
import { COMMIT_EVENT, type AppContext } from './context';
import { h, isModalOpen, toast } from './dom';
import { describeRecurrence } from './format';
import { openGoalEditor } from './screens/goalEditor';
import { openGoalsList } from './screens/goalsList';
import { openMood } from './screens/mood';
import { openOnboarding } from './screens/onboarding';
import { openMenu, openSettings } from './screens/settings';
import { openSummary, openWeeklyReview } from './screens/summary';

const ui = strings.ui;
const SPEECH_MS = 5200;


export interface AppDeps {
  store: KeyValueStore;
  assets: CharacterAssets;
  /** The CURRENT scene (it is rebuilt when the screen size changes). */
  scene: () => HomeScene;
  now?: () => Date;
}

/** Owns the game state and the DOM overlay (HUD, today's goals, speech) on top of the canvas. */
export class App implements AppContext {
  private current: GameState;
  private expanded = false;
  private lastDay = '';
  private readonly promptedReviews = new Set<string>();
  private speechTimer = 0;

  private readonly hud = h('header', { class: 'hud' });
  private readonly sheet = h('section', { class: 'sheet' });
  private readonly bubble = h('div', { class: 'bubble hidden', role: 'status' });

  constructor(
    root: HTMLElement,
    private readonly deps: AppDeps,
  ) {
    const loaded = loadState(deps.store);
    this.current = settle(loaded.state, this.now());
    root.append(this.hud, this.bubble, this.sheet);

    this.render();
    this.syncCharacter();
    if (loaded.recovered) toast(ui.toast.recovered, 6000);

    if (!this.current.profile.onboarded) openOnboarding(this);
    else this.tick();

    window.setInterval(() => this.tick(), 30_000);
    document.addEventListener('visibilitychange', () => !document.hidden && this.tick());
    window.addEventListener('resize', () => this.keepCharacterVisible());
  }

  // ------------------------------------------------------------- AppContext

  get state(): GameState {
    return this.current;
  }

  now = (): Date => (this.deps.now ? this.deps.now() : new Date());

  scene = (): HomeScene => this.deps.scene();

  toast = (text: string): void => toast(text);

  commit(next: GameState): void {
    this.current = next;
    saveState(this.deps.store, next);
    this.render();
    this.syncCharacter();
    window.dispatchEvent(new Event(COMMIT_EVENT));
  }

  speak(text: string, expression?: string): void {
    this.bubble.replaceChildren(h('strong', {}, characterNameOf(this.current) || '…'), h('span', {}, text));
    this.bubble.classList.remove('hidden');
    const character = this.scene().character;
    if (expression) character.setExpression(expression);
    window.clearTimeout(this.speechTimer);
    this.speechTimer = window.setTimeout(() => {
      this.bubble.classList.add('hidden');
      this.scene().character.setExpression(null);
    }, SPEECH_MS);
  }

  readonly open = {
    goalEditor: (goalId?: string): void => openGoalEditor(this, goalId),
    goalsList: (): void => openGoalsList(this),
    weeklyReview: (weekKey: string): void => openWeeklyReview(this, weekKey),
    summary: (): void => openSummary(this),
    mood: (): void => openMood(this),
    settings: (): void => openSettings(this),
    menu: (): void => openMenu(this),
  };

  // ------------------------------------------------------------------ logic

  /** The stage the character should be in for the altitude climbed so far. */
  private stageId(state: GameState): string {
    return stageForAltitude(this.deps.assets.pack.manifest.stages, totalsOf(state).altitude).id;
  }

  private syncCharacter(): void {
    const character = this.scene().character;
    const stage = this.stageId(this.current);
    if (character.stage !== stage) character.setStage(stage);
  }

  /** Runs periodically and when the app comes back: day rollover, pending changes, weekly review. */
  private tick(): void {
    const settled = settle(this.current, this.now());
    if (settled !== this.current) this.commit(settled);

    const day = dayKeyOf(this.now(), this.current.settings.timezone);
    if (day !== this.lastDay) {
      this.lastDay = day;
      this.render();
    }

    if (!isModalOpen() && this.current.profile.onboarded) {
      const week = pendingWeeklyReview(this.current, this.now());
      if (week && !this.promptedReviews.has(week)) {
        this.promptedReviews.add(week);
        openWeeklyReview(this, week);
      }
    }
  }

  private complete(goalId: string): void {
    const before = this.stageId(this.current);
    const result = completeGoal(this.current, goalId, this.now());
    if (!result.ok) return;

    this.commit(result.state);
    this.scene().celebrate();

    const { award, completion, newMilestones } = result;
    toast(ui.toast.reward(award.awarded, completion.coins, completion.altitude));
    if (award.capped) toast(ui.toast.capped, 4200);
    for (const m of newMilestones) toast(ui.toast.milestone(m), 4200);

    const after = this.stageId(result.state);
    if (after !== before) {
      toast(ui.toast.evolved(characterNameOf(result.state), strings.stageNames[after] ?? after), 5200);
    } else if (Math.random() < 0.4) {
      const owner = result.state.profile.displayName;
      this.speak(strings.cheers[Math.floor(Math.random() * strings.cheers.length)]!(owner), 'happy');
    }
  }

  // -------------------------------------------------------------------- DOM

  private render(): void {
    this.renderHud();
    this.renderSheet();
  }

  private renderHud(): void {
    const totals = totalsOf(this.current);
    const next = nextMilestone(totals.altitude);
    const mood = moodToday(this.current, this.now());
    this.hud.replaceChildren(
      h(
        'div',
        { class: 'hud-row' },
        h('span', { class: 'chip-stat', title: ui.hud.coins }, `🪙 ${totals.coins}`),
        h('span', { class: 'chip-stat', title: ui.hud.energy }, `⚡ ${totals.energy}`),
        h('span', { class: 'chip-stat', title: ui.hud.altitude }, `⛰️ ${ui.hud.meters(totals.altitude)}`),
        h('span', { class: 'spacer' }),
        h('button', { class: 'icon-btn round', 'aria-label': ui.hud.mood, onClick: () => this.open.mood() }, mood ? ui.mood.emoji[mood] : '🙂'),
        h('button', { class: 'icon-btn round', 'aria-label': ui.hud.menu, onClick: () => this.open.menu() }, '☰'),
      ),
      h(
        'div',
        { class: 'milestone' },
        h('span', { class: 'bar' }, h('i', { style: `width:${Math.round(progressToNextMilestone(totals.altitude) * 100)}%` })),
        h('small', {}, next === null ? ui.hud.topReached : ui.hud.nextMilestone(next)),
      ),
    );
  }

  private renderSheet(): void {
    const now = this.now();
    const items = agenda(this.current, now);
    const today = dayKeyOf(now, this.current.settings.timezone);
    const done = items.filter((i) => i.state === 'done').length;
    const points = pointsOnDay(this.current, today);
    const streak = currentStreak(this.current, now);

    const summary = h(
      'button',
      { class: 'sheet-handle', 'aria-label': this.expanded ? ui.home.collapse : ui.home.expand, onClick: () => { this.expanded = !this.expanded; this.renderSheet(); } },
      h('span', { class: 'grip' }),
      h(
        'span',
        { class: 'sheet-summary' },
        h('strong', {}, ui.home.todayTitle),
        h('small', {}, [items.length > 0 ? ui.home.doneCount(done, items.length) : null, ui.home.pointsToday(points, this.current.settings.dailyCap), streak > 0 ? `🔥 ${ui.home.streak(streak)}` : null].filter(Boolean).join(' · ')),
      ),
    );

    const list = h('div', { class: 'sheet-list' });
    if (items.length === 0) {
      list.append(h('p', { class: 'muted' }, this.current.goals.length > 0 ? ui.home.emptyNew : ui.home.empty));
    } else if (done === items.length) {
      list.append(h('p', { class: 'muted' }, ui.home.allDone));
    }
    for (const item of items) {
      const isDone = item.state === 'done';
      list.append(
        h(
          'div',
          { class: `task${isDone ? ' done' : ''}` },
          h('button', { class: 'check-btn', disabled: isDone, 'aria-label': ui.home.markDone, onClick: () => this.complete(item.goal.id) }, isDone ? '✓' : ''),
          h(
            'button',
            { class: 'task-text', onClick: () => this.open.goalEditor(item.goal.id) },
            h('span', {}, item.fields.title),
            h('small', {}, [describeRecurrence(item.fields.recurrence), item.weekProgress ? ui.home.weekProgress(item.weekProgress.done, item.weekProgress.target) : null].filter(Boolean).join(' · ')),
          ),
          h('span', { class: `tag ${item.fields.difficulty}` }, ui.difficulty[item.fields.difficulty]),
        ),
      );
    }
    list.append(h('button', { class: 'btn primary add', onClick: () => this.open.goalEditor() }, `+ ${ui.home.addGoal}`));

    this.sheet.className = `sheet${this.expanded ? ' open' : ''}`;
    this.sheet.replaceChildren(summary);
    if (this.expanded) this.sheet.append(list);
    this.keepCharacterVisible();
  }

  /** Slides the scene up while the goal list is open so the character stays above it. */
  private keepCharacterVisible(): void {
    const canvas = document.querySelector<HTMLCanvasElement>('#app canvas');
    if (!canvas) return;
    const { layout } = this.scene();
    const feet = canvas.offsetTop + (layout.feetY / layout.height) * canvas.offsetHeight;
    const sheetTop = window.innerHeight - this.sheet.offsetHeight;
    const shift = this.expanded ? Math.min(0, sheetTop - feet - 16) : 0;
    canvas.style.transform = `translateY(${Math.round(shift)}px)`;
  }
}
