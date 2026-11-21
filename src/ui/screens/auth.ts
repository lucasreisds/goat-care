import type { User } from 'firebase/auth';
import { completeOnboarding } from '../../core/game';
import { initialState } from '../../core/state';
import { DEFAULT_TIMEZONE } from '../../core/time/calendar';
import {
  authIssueOf,
  MIN_PASSWORD,
  refreshVerification,
  register,
  resendVerification,
  sendPasswordReset,
  signIn,
  signOut,
} from '../../online/account';
import type { Firebase } from '../../online/firebase';
import { INVITE_LENGTH, normalizeInviteCode } from '../../online/model';
import { createCouple, createUser, joinCouple, loadUser, privateOf, type UserDoc } from '../../online/session';
import { strings } from '../../i18n';
import { h, openModal } from '../dom';
import { askNames } from './onboarding';

const t = strings.ui.auth;
const p = strings.ui.pairing;

export const TIMEZONES = ['America/Sao_Paulo', 'America/Manaus', 'America/Fortaleza', 'America/Rio_Branco', 'America/Noronha', 'Europe/Lisbon'];

export interface GateResult {
  user: User;
  coupleId: string;
  /** The profile was created in this run (first time in the game). */
  isNewPlayer: boolean;
  /** This person just started a couple and still has to invite the partner. */
  createdCouple: boolean;
}

/** Runs `task` with the button disabled, so a slow network cannot double-submit. */
async function busy(button: HTMLButtonElement, task: () => Promise<void>): Promise<void> {
  if (button.disabled) return;
  button.disabled = true;
  try {
    await task();
  } finally {
    button.disabled = false;
  }
}

const onEnter = (el: HTMLElement, action: () => void): void => el.addEventListener('keydown', (e) => e.key === 'Enter' && action());

/** Login, account creation and password recovery. Resolves with the signed-in user. */
function askCredentials(fb: Firebase): Promise<User> {
  return new Promise((resolve) => {
    let email = '';
    let modal = openModal(t.loginTitle, { dismissible: false });
    const show = (title: string, build: (body: HTMLElement) => void): void => {
      modal.close();
      modal = openModal(title, { dismissible: false });
      build(modal.body);
    };
    const done = (user: User): void => {
      modal.close();
      resolve(user);
    };

    const emailInput = (): HTMLInputElement =>
      h('input', { type: 'email', value: email, autocomplete: 'email', inputMode: 'email', autocapitalize: 'off', onInput: (e: Event) => (email = (e.target as HTMLInputElement).value) });

    const login = (): void =>
      show(t.loginTitle, (body) => {
        const mail = emailInput();
        const pass = h('input', { type: 'password', autocomplete: 'current-password' });
        const error = h('p', { class: 'error' });
        const button = h('button', { class: 'btn primary' }, t.login);
        const submit = (): Promise<void> =>
          busy(button, async () => {
            try {
              done(await signIn(fb.auth, mail.value, pass.value));
            } catch (e) {
              error.textContent = t.issues[authIssueOf(e)];
            }
          });
        button.addEventListener('click', () => void submit());
        onEnter(pass, () => void submit());
        body.append(
          h('label', { class: 'field' }, h('span', {}, t.email), mail),
          h('label', { class: 'field' }, h('span', {}, t.password), pass),
          error,
          button,
          h('button', { class: 'btn', onClick: signUp }, t.toRegister),
          h('button', { class: 'btn link', onClick: reset }, t.forgot),
        );
      });

    const signUp = (): void =>
      show(t.registerTitle, (body) => {
        const mail = emailInput();
        const pass = h('input', { type: 'password', autocomplete: 'new-password', minLength: MIN_PASSWORD });
        const again = h('input', { type: 'password', autocomplete: 'new-password' });
        const error = h('p', { class: 'error' });
        const button = h('button', { class: 'btn primary' }, t.register);
        const submit = (): Promise<void> =>
          busy(button, async () => {
            if (pass.value !== again.value) return void (error.textContent = t.passwordsDiffer);
            try {
              done(await register(fb.auth, mail.value, pass.value));
            } catch (e) {
              error.textContent = t.issues[authIssueOf(e)];
            }
          });
        button.addEventListener('click', () => void submit());
        onEnter(again, () => void submit());
        body.append(
          h('label', { class: 'field' }, h('span', {}, t.email), mail),
          h('label', { class: 'field' }, h('span', {}, `${t.password} (${t.passwordHint})`), pass),
          h('label', { class: 'field' }, h('span', {}, t.passwordRepeat), again),
          error,
          button,
          h('button', { class: 'btn', onClick: login }, t.toLogin),
        );
      });

    const reset = (): void =>
      show(t.resetTitle, (body) => {
        const mail = emailInput();
        const note = h('p', { class: 'muted' });
        const error = h('p', { class: 'error' });
        const button = h('button', { class: 'btn primary' }, t.resetSend);
        button.addEventListener('click', () =>
          void busy(button, async () => {
            error.textContent = '';
            try {
              await sendPasswordReset(fb.auth, mail.value);
              note.textContent = t.resetSent;
            } catch (e) {
              const issue = authIssueOf(e);
              // never reveal whether an account exists
              if (issue === 'wrong-credentials') note.textContent = t.resetSent;
              else error.textContent = t.issues[issue];
            }
          }),
        );
        body.append(h('p', {}, t.resetText), h('label', { class: 'field' }, h('span', {}, t.email), mail), note, error, button, h('button', { class: 'btn', onClick: login }, t.back));
      });

    login();
  });
}

/**
 * Waits until the email is verified. The link opens in Safari (not in the installed PWA), so the
 * person comes back and taps "I verified": that reloads the user and forces a fresh ID token.
 */
function waitForVerification(fb: Firebase, user: User): Promise<void> {
  return new Promise((resolve) => {
    const modal = openModal(t.verifyTitle, { dismissible: false });
    const note = h('p', { class: 'muted' });
    const error = h('p', { class: 'error' });
    const check = async (silent: boolean): Promise<void> => {
      try {
        if (await refreshVerification(user)) {
          document.removeEventListener('visibilitychange', onVisible);
          modal.close();
          resolve();
        } else if (!silent) {
          error.textContent = t.verifyNotYet;
        }
      } catch (e) {
        if (!silent) error.textContent = t.issues[authIssueOf(e)];
      }
    };
    // coming back from Safari: check without making the person tap
    const onVisible = (): void => {
      if (!document.hidden) void check(true);
    };
    document.addEventListener('visibilitychange', onVisible);

    const confirm = h('button', { class: 'btn primary' }, t.verifyDone);
    confirm.addEventListener('click', () => void busy(confirm, () => check(false)));
    const resend = h('button', { class: 'btn' }, t.verifyResend);
    resend.addEventListener('click', () =>
      void busy(resend, async () => {
        error.textContent = '';
        try {
          await resendVerification(user);
          note.textContent = t.verifyResent;
        } catch (e) {
          error.textContent = t.issues[authIssueOf(e)];
        }
      }),
    );
    modal.body.append(
      h('p', {}, t.verifyText(user.email ?? '')),
      h('p', { class: 'muted' }, t.verifyIosNote),
      note,
      error,
      confirm,
      resend,
      h('button', { class: 'btn link', onClick: () => void signOut(fb.auth).then(() => location.reload()) }, t.signOut),
    );
  });
}

/** Keeps offering "try again" until the profile loads (first login needs a connection). */
async function loadProfile(fb: Firebase, uid: string): Promise<UserDoc | null> {
  for (;;) {
    const loading = openModal(t.loading, { dismissible: false });
    try {
      return await loadUser(fb.db, uid);
    } catch (error) {
      loading.close();
      console.error(error);
      await new Promise<void>((resolve) => {
        const modal = openModal(strings.ui.auth.loading, { dismissible: false });
        modal.body.append(
          h('p', {}, t.loadFailed),
          h('button', { class: 'btn primary', onClick: () => { modal.close(); resolve(); } }, t.retry),
          h('button', { class: 'btn link', onClick: () => void signOut(fb.auth).then(() => location.reload()) }, t.signOut),
        );
      });
    } finally {
      loading.close();
    }
  }
}

/** Start a couple (and invite later) or join one with a 6-character code. */
function askPairing(fb: Firebase, uid: string, now: () => Date): Promise<{ coupleId: string; created: boolean }> {
  return new Promise((resolve) => {
    const modal = openModal(p.title, { dismissible: false });
    const error = h('p', { class: 'error' });
    const zone = h('select', {});
    for (const tz of TIMEZONES) zone.append(h('option', { value: tz, selected: tz === DEFAULT_TIMEZONE }, tz));
    const code = h('input', { type: 'text', maxLength: INVITE_LENGTH + 2, autocomplete: 'off', autocapitalize: 'characters', class: 'code-input', placeholder: 'ABC234' });

    const create = h('button', { class: 'btn primary' }, p.create);
    create.addEventListener('click', () =>
      void busy(create, async () => {
        error.textContent = '';
        try {
          const coupleId = await createCouple(fb.db, uid, zone.value, now());
          modal.close();
          resolve({ coupleId, created: true });
        } catch (e) {
          console.error(e);
          error.textContent = p.createFailed;
        }
      }),
    );

    const join = h('button', { class: 'btn primary' }, p.join);
    const submitJoin = (): Promise<void> =>
      busy(join, async () => {
        error.textContent = '';
        const normalized = normalizeInviteCode(code.value);
        if (!normalized) return void (error.textContent = p.issues.invalid);
        const result = await joinCouple(fb.db, uid, normalized);
        if (!result.ok) return void (error.textContent = p.issues[result.reason]);
        modal.close();
        resolve({ coupleId: result.coupleId, created: false });
      });
    join.addEventListener('click', () => void submitJoin());
    onEnter(code, () => void submitJoin());

    modal.body.append(
      h('p', {}, p.intro),
      h('h4', {}, p.haveCode),
      h('label', { class: 'field' }, h('span', {}, p.codeLabel), code),
      join,
      h('h4', {}, p.create),
      h('p', { class: 'muted' }, p.createHint),
      h('label', { class: 'field' }, h('span', {}, strings.ui.settings.timezone), zone),
      create,
      error,
      h('button', { class: 'btn link', onClick: () => void signOut(fb.auth).then(() => location.reload()) }, t.signOut),
    );
  });
}

/**
 * Everything that must be true before the game starts: signed in, email verified,
 * profile created (names) and paired (or at least with a couple of one).
 */
export async function runGate(fb: Firebase, now: () => Date): Promise<GateResult> {
  await fb.auth.authStateReady();
  const user = fb.auth.currentUser ?? (await askCredentials(fb));

  if (!user.emailVerified) {
    // maybe it was verified on another device since the last time
    const verified = navigator.onLine ? await refreshVerification(user).catch(() => false) : false;
    if (!verified) await waitForVerification(fb, user);
  }

  let profile = await loadProfile(fb, user.uid);
  let isNewPlayer = false;
  while (!profile) {
    const names = await askNames();
    const state = completeOnboarding(initialState(), names.displayName, names.characterName);
    if (typeof state === 'string') continue;
    const personal = privateOf(state, []);
    try {
      await createUser(fb.db, user.uid, personal);
      profile = { coupleId: null, state: personal };
      isNewPlayer = true;
    } catch (error) {
      console.error(error);
      profile = await loadProfile(fb, user.uid);
    }
  }

  if (profile.coupleId) return { user, coupleId: profile.coupleId, isNewPlayer, createdCouple: false };
  const paired = await askPairing(fb, user.uid, now);
  return { user, coupleId: paired.coupleId, isNewPlayer, createdCouple: paired.created };
}
