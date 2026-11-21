import { registerSW } from 'virtual:pwa-register';

const RELOAD_FLAG_KEY = 'vinctus-sw-reloaded';
let hasRequestedUpdate = false;

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    if (hasRequestedUpdate) return;
    hasRequestedUpdate = true;

    let hasReloaded = false;
    try {
      hasReloaded = sessionStorage.getItem(RELOAD_FLAG_KEY) === '1';
      if (!hasReloaded) {
        sessionStorage.setItem(RELOAD_FLAG_KEY, '1');
      }
    } catch {
      // Blocked storage (e.g. strict privacy mode): rely on the in-memory guard.
    }

    // updateSW(true) signals skipWaiting and reloads once the new worker activates.
    void updateSW(!hasReloaded);
  },
  onRegistered(registration: ServiceWorkerRegistration | undefined) {
    if (!registration) return;
    // Periodically check for updates while online to reduce stale caches.
    setInterval(
      () => {
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
        void registration.update().catch(() => undefined);
      },
      60 * 60 * 1000,
    );
  },
});
