import './style.css';
import './ui/app.css';
import { loadItems, loadPack } from './character/pack/loader';
import { characterNameOf, totalsOf, type GameState } from './core/state';
import { HourSource, parseHourParam } from './core/time/clock';
import { isOwned, outfitFor } from './core/wardrobe';
import { mountDebugPanel } from './debug/DebugPanel';
import { browserStore } from './data/localStore';
import { strings } from './i18n';
import { signOut } from './online/account';
import { isConfigured, startFirebase } from './online/firebase';
import type { MemberDoc } from './online/model';
import { PushController } from './online/push';
import { Session } from './online/session';
import { registerServiceWorker } from './pwa';
import { HomeScene, type CharacterAssets } from './render/HomeScene';
import { characterPortrait } from './render/portrait';
import { createStage } from './render/Stage';
import { App } from './ui/App';
import { h, openModal } from './ui/dom';
import { runGate } from './ui/screens/auth';

async function main(): Promise<void> {
  const host = document.getElementById('app');
  if (!host) throw new Error('Missing #app element');

  // Offline app shell. In dev it is left alone (the worker also steps aside on localhost).
  if (import.meta.env.PROD) void registerServiceWorker();

  const hours = new HourSource(parseHourParam(location.search));
  const stage = await createStage(host);
  const [pack, items] = await Promise.all([loadPack('mountain-goat'), loadItems()]);
  const assets: CharacterAssets = { pack, items };
  let scene = new HomeScene(stage.app.stage, hours, stage.layout, assets);

  // New screen size (rotation, window resize): rebuild the scene for the new layout.
  stage.onLayoutChange((layout) => {
    const snapshot = scene.character.snapshot();
    scene.destroy();
    scene = new HomeScene(stage.app.stage, hours, layout, assets, snapshot);
  });

  stage.onTap((x, y) => {
    scene.handleTap(x, y);
  });

  let t = 0;
  stage.app.ticker.add((ticker) => {
    const dt = Math.min(ticker.deltaMS / 1000, 0.1);
    t += dt;
    scene.update(dt, t);
  });

  const overlay = document.getElementById('ui');
  if (!overlay) throw new Error('Missing #ui element');
  mountDebugPanel({ hours, assets, character: () => scene.character });

  if (!isConfigured()) {
    openModal('Goat Care', { dismissible: false }).body.append(h('p', {}, strings.ui.auth.notConfigured));
    return;
  }

  // Login, verified email, names and pairing come first; the scene keeps running behind the dialogs.
  const firebase = startFirebase();
  const now = (): Date => new Date();
  const gate = await runGate(firebase, now);

  const defs = items.map((i) => i.def);
  /** What the partner may see of me (kept in `couples/{id}/members/{uid}`). */
  const card = (state: GameState): MemberDoc => ({
    displayName: state.profile.displayName,
    characterId: state.profile.activeCharacterId,
    characterName: characterNameOf(state),
    altitude: totalsOf(state).altitude,
    outfit: outfitFor(state, defs, pack.manifest),
    owned: defs.filter((d) => d.unlock.type === 'coins' && isOwned(state, d)).map((d) => d.id),
  });

  const loading = openModal(strings.ui.auth.loading, { dismissible: false });
  const session = await Session.start({ db: firebase.db, uid: gate.user.uid, coupleId: gate.coupleId, store: browserStore(), now, card });
  loading.close();

  const app = new App(overlay, {
    session,
    assets,
    scene: () => scene,
    account: {
      email: gate.user.email ?? '',
      signOut: async () => {
        await signOut(firebase.auth);
        location.reload();
      },
    },
    push: new PushController(firebase.db, gate.user.uid, registerServiceWorker),
    portrait: (stageId, outfit) => characterPortrait(stage.app.renderer, assets, stageId, outfit),
  });

  if (gate.isNewPlayer) app.speak(strings.greetings.firstMeeting(session.state.profile.displayName), 'happy');
  // whoever just started the couple goes straight to the invite code
  if (gate.createdCouple) app.open.couple();
}

main().catch((error: unknown) => {
  console.error(error);
});
