/** Whether this browser can receive push notifications, and what the player must do first. */
export type PushSupport = 'ok' | 'needs-install' | 'unsupported';

export interface PushEnvironment {
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  hasNotification: boolean;
  isIos: boolean;
  /** Running from the Home Screen icon (display-mode: standalone). */
  standalone: boolean;
}

/**
 * iOS only exposes push (Web Push, iOS/iPadOS 16.4+) to web apps added to the Home Screen: in a plain
 * Safari tab `PushManager` is missing, so a missing API on iOS outside standalone means "install it first".
 */
export function pushSupport(env: PushEnvironment): PushSupport {
  const complete = env.hasServiceWorker && env.hasPushManager && env.hasNotification;
  if (complete) return 'ok';
  if (env.isIos && !env.standalone) return 'needs-install';
  return 'unsupported';
}

export function detectEnvironment(): PushEnvironment {
  const ua = navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return {
    hasServiceWorker: 'serviceWorker' in navigator,
    hasPushManager: 'PushManager' in window,
    hasNotification: 'Notification' in window,
    isIos,
    standalone:
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true,
  };
}
