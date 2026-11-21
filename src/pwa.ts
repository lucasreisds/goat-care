/** Registers the service worker (offline app shell + push). Resolves to null where unsupported or it fails. */
let registration: Promise<ServiceWorkerRegistration | null> | null = null;

export function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  registration ??= (async () => {
    if (!('serviceWorker' in navigator)) return null;
    try {
      await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
      return await navigator.serviceWorker.ready;
    } catch (error) {
      console.warn('Service worker registration failed', error);
      return null;
    }
  })();
  return registration;
}
