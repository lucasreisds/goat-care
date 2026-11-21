import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';

export interface Firebase {
  auth: Auth;
  db: Firestore;
  /** True when talking to the local emulators (`npm run dev:emulators`). */
  emulated: boolean;
}

const env = import.meta.env;

/** Web app credentials from `.env` (see `.env.example` and docs/firebase-setup.md). */
const config = {
  apiKey: env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: env.VITE_FIREBASE_APP_ID as string | undefined,
};

export const isConfigured = (): boolean => Boolean(config.apiKey && config.projectId && config.appId);

/**
 * Starts Firebase. Firestore keeps a persistent local cache, so the app opens and goals can be
 * edited offline; the SDK sends those writes when the connection returns.
 */
export function startFirebase(): Firebase {
  const app = initializeApp(config);
  const auth = getAuth(app);
  const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    ignoreUndefinedProperties: true,
  });

  const emulated = env.VITE_USE_EMULATORS === '1';
  if (emulated) {
    const host = location.hostname;
    connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
    connectFirestoreEmulator(db, host, 8080);
  }
  return { auth, db, emulated };
}
