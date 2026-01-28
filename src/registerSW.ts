import { registerSW } from 'virtual:pwa-register';

const RELOAD_FLAG_KEY = 'vinctus-sw-reloaded';

const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
        try {
            const hasReloaded = sessionStorage.getItem(RELOAD_FLAG_KEY) === '1';
            if (!hasReloaded) {
                sessionStorage.setItem(RELOAD_FLAG_KEY, '1');
                void updateSW(true);
                window.location.reload();
                return;
            }
        } catch {
            // If storage is blocked, just reload once.
            void updateSW(true);
            window.location.reload();
            return;
        }

        void updateSW(true);
    },
    onRegistered(registration: ServiceWorkerRegistration | undefined) {
        if (registration) {
            // Periodically check for updates to reduce stale caches.
            setInterval(() => {
                void registration.update();
            }, 60 * 60 * 1000);
        }
    }
});
