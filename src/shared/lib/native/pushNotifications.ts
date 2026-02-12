import type { PluginListenerHandle } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { isNativePlatform } from '@/shared/lib/native/capacitor';

export interface PushRegistrationResult {
  native: boolean;
  granted: boolean;
  token: string | null;
  error: string | null;
}

const PUSH_REGISTER_TIMEOUT_MS = 12000;

export const registerNativePushNotifications = async (): Promise<PushRegistrationResult> => {
  if (!isNativePlatform()) {
    return {
      native: false,
      granted: false,
      token: null,
      error: 'Push notifications solo disponibles en plataformas nativas.',
    };
  }

  let permissions = await PushNotifications.checkPermissions();
  if (permissions.receive === 'prompt') {
    permissions = await PushNotifications.requestPermissions();
  }

  if (permissions.receive !== 'granted') {
    return {
      native: true,
      granted: false,
      token: null,
      error: 'Permiso de notificaciones no concedido.',
    };
  }

  return new Promise<PushRegistrationResult>((resolve) => {
    let settled = false;
    let registrationHandle: PluginListenerHandle | null = null;
    let registrationErrorHandle: PluginListenerHandle | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const cleanup = async () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      await Promise.allSettled([
        registrationHandle?.remove?.(),
        registrationErrorHandle?.remove?.(),
      ]);
    };

    const settle = async (result: PushRegistrationResult) => {
      if (settled) return;
      settled = true;
      await cleanup();
      resolve(result);
    };

    PushNotifications.addListener('registration', (token) => {
      void settle({
        native: true,
        granted: true,
        token: token.value,
        error: null,
      });
    })
      .then((handle) => {
        registrationHandle = handle;
      })
      .catch((error) => {
        void settle({
          native: true,
          granted: false,
          token: null,
          error: error instanceof Error ? error.message : 'No se pudo escuchar registro push.',
        });
      });

    PushNotifications.addListener('registrationError', (error) => {
      const message =
        typeof error.error === 'string' ? error.error : 'Registro push fallido en dispositivo.';
      void settle({
        native: true,
        granted: false,
        token: null,
        error: message,
      });
    })
      .then((handle) => {
        registrationErrorHandle = handle;
      })
      .catch((error) => {
        void settle({
          native: true,
          granted: false,
          token: null,
          error: error instanceof Error ? error.message : 'No se pudo escuchar errores push.',
        });
      });

    timeoutId = setTimeout(() => {
      void settle({
        native: true,
        granted: false,
        token: null,
        error: 'Tiempo de espera agotado para registro push.',
      });
    }, PUSH_REGISTER_TIMEOUT_MS);

    void PushNotifications.register().catch((error) => {
      void settle({
        native: true,
        granted: false,
        token: null,
        error: error instanceof Error ? error.message : 'No se pudo iniciar registro push.',
      });
    });
  });
};
