/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN: string;
  readonly VITE_FIREBASE_PROJECT_ID: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
  readonly VITE_FIREBASE_APP_ID: string;
  readonly VITE_ENABLE_FIREBASE_APP_CHECK?: string;
  readonly VITE_FIREBASE_APP_CHECK_SITE_KEY?: string;
  readonly VITE_FIREBASE_APP_CHECK_DEBUG_TOKEN?: string;
  readonly VITE_FIREBASE_APP_CHECK_TOKEN_AUTO_REFRESH?: string;
  readonly VITE_ENABLE_APPLE_SIGN_IN?: string;
  readonly VITE_CORS_PROXY?: string;
  readonly VITE_MUSIC_COUNTRY?: string;
  readonly VITE_PRIVACY_POLICY_URL?: string;
  readonly VITE_TERMS_OF_SERVICE_URL?: string;
  readonly VITE_COMMUNITY_GUIDELINES_URL?: string;
  readonly VITE_SUPPORT_URL?: string;
  readonly VITE_SUPPORT_EMAIL?: string;
  readonly VITE_SECURITY_EMAIL?: string;
  // readonly VITE_FIREBASE_MEASUREMENT_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
