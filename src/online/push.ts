import { getApp } from 'firebase/app';
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc, type Firestore } from 'firebase/firestore';
import { deleteToken, getMessaging, getToken, isSupported } from 'firebase/messaging';
import { detectEnvironment, pushSupport } from './pushSupport';

/** What the player wants to be told about. Stored in the device document the scheduled job reads. */
export interface PushPrefs {
  reminders: boolean;
  caresses: boolean;
}

export type PushStatus =
  | 'unsupported'
  | 'needs-install'
  | 'not-configured'
  | 'denied'
  | 'off'
  | 'on';

export interface PushState {
  status: PushStatus;
  prefs: PushPrefs;
}

const DEVICE_KEY = 'goat-care/push-device';
const DEFAULT_PREFS: PushPrefs = { reminders: true, caresses: true };
const vapidKey = (): string | undefined => import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined;

const safe = {
  get(): string | null {
    try {
      return window.localStorage.getItem(DEVICE_KEY);
    } catch {
      return null;
    }
  },
  set(value: string | null): void {
    try {
      if (value === null) window.localStorage.removeItem(DEVICE_KEY);
      else window.localStorage.setItem(DEVICE_KEY, value);
    } catch {
      /* storage unavailable: the device is simply re-registered next time */
    }
  },
};

async function deviceIdOf(token: string): Promise<string> {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 40);
}

/**
 * Push for this device: asks permission (it must run from a tap), gets the token and records it in
 * `users/{uid}/devices/{id}`. The scheduled job (scripts/notify) reads those documents to send pushes.
 */
export class PushController {
  constructor(
    private readonly db: Firestore,
    private readonly uid: string,
    private readonly registration: () => Promise<ServiceWorkerRegistration | null>,
  ) {}

  private deviceRef(id: string) {
    return doc(this.db, 'users', this.uid, 'devices', id);
  }

  async state(): Promise<PushState> {
    const support = pushSupport(detectEnvironment());
    if (support !== 'ok') return { status: support, prefs: DEFAULT_PREFS };
    if (!vapidKey()) return { status: 'not-configured', prefs: DEFAULT_PREFS };
    if (!(await isSupported().catch(() => false))) return { status: 'unsupported', prefs: DEFAULT_PREFS };
    if (Notification.permission === 'denied') return { status: 'denied', prefs: DEFAULT_PREFS };

    const id = safe.get();
    if (Notification.permission === 'granted' && id) {
      try {
        const snap = await getDoc(this.deviceRef(id));
        if (snap.exists()) {
          const data = snap.data();
          return { status: 'on', prefs: { reminders: data.reminders !== false, caresses: data.caresses !== false } };
        }
      } catch {
        /* offline and not cached: treat as off */
      }
    }
    return { status: 'off', prefs: DEFAULT_PREFS };
  }

  /** Call from a button tap: iOS only shows the permission prompt for a user gesture. */
  async enable(prefs: PushPrefs = DEFAULT_PREFS): Promise<PushStatus> {
    const current = (await this.state()).status;
    if (current !== 'off' && current !== 'on') return current;

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';

    const registration = await this.registration();
    if (!registration) return 'unsupported';
    const token = await getToken(getMessaging(getApp()), { vapidKey: vapidKey()!, serviceWorkerRegistration: registration });
    if (!token) return 'off';

    const id = await deviceIdOf(token);
    await setDoc(this.deviceRef(id), {
      token,
      reminders: prefs.reminders,
      caresses: prefs.caresses,
      platform: detectEnvironment().isIos ? 'ios' : 'other',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    safe.set(id);
    return 'on';
  }

  async setPrefs(prefs: PushPrefs): Promise<void> {
    const id = safe.get();
    if (!id) return;
    await updateDoc(this.deviceRef(id), { reminders: prefs.reminders, caresses: prefs.caresses, updatedAt: serverTimestamp() });
  }

  async disable(): Promise<void> {
    const id = safe.get();
    safe.set(null);
    if (id) await deleteDoc(this.deviceRef(id)).catch(() => undefined);
    await deleteToken(getMessaging(getApp())).catch(() => undefined);
  }
}
