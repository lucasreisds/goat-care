import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type Auth,
  type User,
} from 'firebase/auth';

/**
 * Email + password only: magic links and redirect logins break inside an installed iOS PWA.
 */
export type AuthIssue =
  | 'invalid-email'
  | 'wrong-credentials'
  | 'email-in-use'
  | 'weak-password'
  | 'too-many-requests'
  | 'network'
  | 'unknown';

const ISSUES: Readonly<Record<string, AuthIssue>> = {
  'auth/invalid-email': 'invalid-email',
  'auth/missing-email': 'invalid-email',
  'auth/invalid-credential': 'wrong-credentials',
  'auth/user-not-found': 'wrong-credentials',
  'auth/wrong-password': 'wrong-credentials',
  'auth/missing-password': 'wrong-credentials',
  'auth/email-already-in-use': 'email-in-use',
  'auth/weak-password': 'weak-password',
  'auth/too-many-requests': 'too-many-requests',
  'auth/network-request-failed': 'network',
};

export const authIssueOf = (error: unknown): AuthIssue =>
  ISSUES[(error as { code?: string } | null)?.code ?? ''] ?? 'unknown';

export const MIN_PASSWORD = 6;

export async function register(auth: Auth, email: string, password: string): Promise<User> {
  const { user } = await createUserWithEmailAndPassword(auth, email.trim(), password);
  await sendEmailVerification(user);
  return user;
}

export async function signIn(auth: Auth, email: string, password: string): Promise<User> {
  return (await signInWithEmailAndPassword(auth, email.trim(), password)).user;
}

export const resendVerification = (user: User): Promise<void> => sendEmailVerification(user);

export const sendPasswordReset = (auth: Auth, email: string): Promise<void> => sendPasswordResetEmail(auth, email.trim());

/**
 * "I verified my email": reloads the user AND forces a new ID token. Without the token refresh the
 * cached one keeps `email_verified: false` for up to an hour and Firestore rules keep refusing writes.
 */
export async function refreshVerification(user: User): Promise<boolean> {
  await user.reload();
  if (!user.emailVerified) return false;
  await user.getIdToken(true);
  return true;
}

export const signOut = (auth: Auth): Promise<void> => firebaseSignOut(auth);
