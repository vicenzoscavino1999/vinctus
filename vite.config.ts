import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'url';

// https://vite.dev/config/
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalized = id.replaceAll('\\', '/');
          if (!normalized.includes('/node_modules/')) return undefined;

          if (
            normalized.includes('/@firebase/firestore') ||
            normalized.includes('/firebase/firestore')
          )
            return 'firebase-firestore';
          if (normalized.includes('/@firebase/auth') || normalized.includes('/firebase/auth'))
            return 'firebase-auth';
          if (normalized.includes('/@firebase/storage') || normalized.includes('/firebase/storage'))
            return 'firebase-storage';
          if (
            normalized.includes('/@firebase/functions') ||
            normalized.includes('/firebase/functions')
          )
            return 'firebase-functions';
          if (normalized.includes('/@firebase/')) return 'firebase-shared';
          if (normalized.includes('/react-dom/')) return 'react-dom';
          if (normalized.includes('/react-router')) return 'react-router';
          if (normalized.includes('/react/')) return 'react-core';
          if (normalized.includes('/lucide-react/')) return 'icons';
          if (normalized.includes('/browser-image-compression/')) return 'image-compression';
          if (normalized.includes('/workbox-window/')) return 'workbox-window';
          return undefined;
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'none',
      includeAssets: ['icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Vinctus - Red Social por Intereses',
        short_name: 'Vinctus',
        description: 'Conecta con comunidades que comparten tus pasiones',
        theme_color: '#0a0a0a',
        background_color: '#0a0a0a',
        display: 'standalone',
        orientation: 'any',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        clientsClaim: true,
        skipWaiting: true,
        cleanupOutdatedCaches: true,
        navigateFallback: '/index.html',
        // Keep Firebase Auth proxy, Vercel API routes, and static legal HTML pages outside the SPA shell.
        navigateFallbackDenylist: [
          /^\/__\//,
          /^\/api\//,
          /^\/(privacy|terms|community-guidelines|support)(\/|\.html)?$/,
        ],
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        // Keep static legal pages fresh from network and avoid precaching multi-megabyte category hero photos.
        globIgnores: [
          'privacy.html',
          'terms.html',
          'community-guidelines.html',
          'support.html',
          'blackhole.png',
          'history.png',
          'jazz.png',
          'nature.png',
          'philosophy.png',
          'quantum.png',
          'technology.png',
        ],
        runtimeCaching: [
          {
            urlPattern: ({ url, sameOrigin }) =>
              sameOrigin &&
              /^\/(blackhole|history|jazz|nature|philosophy|quantum|technology)\.png$/i.test(
                url.pathname,
              ),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'category-covers-cache',
              expiration: {
                maxEntries: 16,
                maxAgeSeconds: 60 * 60 * 24 * 14, // 14 days
              },
            },
          },
          {
            urlPattern: /^https:\/\/hacker-news\.firebaseio\.com\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'hackernews-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 15, // 15 minutes
              },
            },
          },
          {
            urlPattern: /^https:\/\/openlibrary\.org\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'openlibrary-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24, // 24 hours
              },
            },
          },
          {
            urlPattern: /^https:\/\/covers\.openlibrary\.org\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'book-covers-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
              },
            },
          },
          {
            urlPattern: /^https:\/\/api\.inaturalist\.org\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'inaturalist-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 30, // 30 minutes
              },
            },
          },
        ],
      },
    }),
  ],
});
