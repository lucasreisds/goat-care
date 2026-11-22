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
import { outfitFor } from '../core/wardrobe';
import { dayKeyOf } from '../core/time/calendar';
import type { Caress } from '../online/model';
import type { PushController } from '../online/push';
import type { Session } from '../online/session';
import { lookup, strings } from '../i18n';
import type { CharacterAssets, HomeScene } from '../render/HomeScene';
import { COMMIT_EVENT, type AppContext } from './context';
import { h, isModalOpen, toast } from './dom';
import { openCaresses } from './screens/caresses';
import { openCouple } from './screens/couple';
import { describeRecurrence } from './format';
import { openGoalEditor } from './screens/goalEditor';
import { openGoalsList } from './screens/goalsList';
import { openMood } from './screens/mood';
import { openRanking } from './screens/ranking';
import { openMenu, openSettings } from './screens/settings';
import { openNotifications } from './screens/notifications';
import { openShop } from './screens/shop';
import { openSummary, openWeeklyReview } from './screens/summary';
import { openWardrobe } from './screens/wardrobe';

const ui = strings.ui;
const SPEECH_MS = 5200;

export interface AppDeps {
  /** Where the game state lives: Firestore listeners plus the offline sync queue. */
  session: Session;
  account: { email: string; signOut(): Promise<void> };
  push: PushController;
  portrait: (stageId: string, outfit: readonly string[]) => HTMLCanvasElement;
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
  private partnerKnown: boolean;

  private readonly hud = h('header', { class: 'hud' });
  private readonly sheet = h('section', { class: 'sheet' });
  private readonly bubble = h('div', { class: 'bubble hidden', role: 'status' });

  constructor(
    root: HTMLElement,
    private readonly deps: AppDeps,
  ) {
    this.current = deps.session.state;
    this.partnerKnown = deps.session.partner !== null;
    root.append(this.hud, this.bubble, this.sheet);

    this.render();
    this.syncCharacter();
    this.tick();

    // Anything arriving from Firestore (the partner, another device, a finished sync) redraws the app.
    deps.session.onChange(() => {
      this.current = deps.session.state;
      this.render();
      this.syncCharacter();
      this.greetPartner();
      window.dispatchEvent(new Event(COMMIT_EVENT));
    });
    deps.session.onCaress((caress) => this.receive(caress));

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

  get session(): Session {
    return this.deps.session;
  }

  get push(): PushController {
    return this.deps.push;
  }

  get account(): AppDeps['account'] {
    return this.deps.account;
  }

  portrait = (stageId: string, outfit: readonly string[]): HTMLCanvasElement => this.deps.portrait(stageId, outfit);

  commit(next: GameState): void {
    this.deps.session.apply(next);
    this.current = this.deps.session.state;
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

  get assets(): CharacterAssets {
    return this.deps.assets;
  }

  readonly open = {
    notifications: (): void => openNotifications(this),
    shop: (): void => openShop(this),
    wardrobe: (): void => openWardrobe(this),
    goalEditor: (goalId?: string): void => openGoalEditor(this, goalId),
    goalsList: (): void => openGoalsList(this),
    weeklyReview: (weekKey: string): void => openWeeklyReview(this, weekKey),
    summary: (): void => openSummary(this),
    mood: (): void => openMood(this),
    settings: (): void => openSettings(this),
    menu: (): void => openMenu(this),
    ranking: (): void => openRanking(this),
    caresses: (): void => openCaresses(this),
    couple: (): void => openCouple(this),
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

    // Dress the character in what the wardrobe says (slots are replaced, extras taken off).
    const { pack, items } = this.deps.assets;
    const wanted = outfitFor(this.current, items.map((i) => i.def), pack.manifest);
    for (const id of character.equippedIds) {
      const def = items.find((i) => i.def.id === id)?.def;
      if (def && !wanted.includes(id)) character.unequip(def.slot);
    }
    for (const id of wanted) {
      if (character.equippedIds.includes(id)) continue;
      const item = items.find((i) => i.def.id === id);
      if (item) character.equip(item);
    }
  }

  /** Runs periodically and when the app comes back: day rollover, pending changes, weekly review. */
  private tick(): void {
    this.deps.session.refresh();
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

  /** A caress from the partner: the character passes it on, and it is marked as seen. */
  private receive(caress: Caress): void {
    const name = this.session.partner?.displayName ?? ui.ranking.partnerFallback;
    if (caress.kind === 'message') {
      const text = strings.caressMessages[caress.ref];
      if (text) {
        this.speak(ui.caresses.received(name, text), 'love');
        this.scene().celebrate();
      }
    } else {
      const item = this.deps.assets.items.find((i) => i.def.id === caress.ref)?.def;
      toast(ui.caresses.giftReceived(name, item ? (lookup(item.nameKey) ?? item.id) : caress.ref), 6000);
      this.scene().celebrate();
    }
    this.session.markSeen(caress.id);
  }

  /** Tells the person who created the couple that the partner has arrived. */
  private greetPartner(): void {
    const partner = this.session.partner;
    if (this.partnerKnown || !partner) return;
    this.partnerKnown = true;
    toast(ui.couple.joined(partner.displayName), 6000);
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
      this.renderDuo(),
    );
  }

  /** This week's score against the partner, one tap away from the ranking and the caresses. */
  private renderDuo(): HTMLElement {
    const [me, partner] = this.session.ranking();
    const mine = me?.points ?? 0;
    const label = partner ? ui.ranking.chip(mine, partner.points, partner.card?.displayName ?? ui.ranking.partnerFallback) : ui.ranking.chipAlone(mine);
    const pending = this.session.pendingSync;
    return h(
      'div',
      { class: 'duo' },
      h('button', { class: 'duo-score', 'aria-label': ui.ranking.open, onClick: () => this.open.ranking() }, `🏆 ${label}${pending > 0 ? ' ⏳' : ''}`),
      h('button', { class: 'icon-btn round', 'aria-label': ui.caresses.open, onClick: () => this.open.caresses() }, '💌'),
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
