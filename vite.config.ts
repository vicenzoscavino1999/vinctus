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
            purpose: 'any maskable',
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        clientsClaim: true,
        skipWaiting: true,
        cleanupOutdatedCaches: true,
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.allorigins\.win\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'cors-proxy-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60, // 1 hour
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
