import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  globalIgnores([
    'dist',
    'functions/lib',
    '.vercel',
    'playwright-report',
    'test-results',
    'coverage',
  ]),
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      'no-undef': 'off',
      'no-unused-vars': 'off',
      'no-extra-boolean-cast': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^_' },
      ],
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-refresh/only-export-components': [
        'error',
        {
          allowConstantExport: true,
          allowExportNames: ['useAuth', 'useAppState', 'useToast'],
        },
      ],
    },
  },
  {
    files: ['src/**/*.{js,jsx,ts,tsx}'],
    ignores: ['src/shared/lib/firestore.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ImportDeclaration[source.value=/firestore\\.legacy$/]',
          message:
            'No importes firestore legacy de forma directa. Usa puentes controlados o un modulo de dominio en src/features/*/api.',
        },
        {
          selector: 'ImportDeclaration[source.value=/firestore\\.legacy\\//]',
          message:
            'No importes firestore legacy de forma directa. Usa puentes controlados o un modulo de dominio en src/features/*/api.',
        },
      ],
    },
  },
  {
    files: ['src/shared/**/*.{js,jsx,ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@/features/*',
                '@/features/**',
                '@/app/*',
                '@/app/**',
                '../features/**',
                '../../features/**',
                '../../../features/**',
                '../../../../features/**',
                '../app/**',
                '../../app/**',
                '../../../app/**',
                '../../../../app/**',
              ],
              message:
                'shared no puede importar de features/app. Mueve ese acoplamiento hacia app.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/features/**/*.{js,jsx,ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@/app/*',
                '@/app/**',
                '../app/**',
                '../../app/**',
                '../../../app/**',
                '../../../../app/**',
              ],
              message: 'features no puede importar app. app debe orquestar providers y rutas.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['functions/**/*.{js,ts}', 'playwright.config.ts'],
    languageOptions: {
      globals: globals.node,
    },
  },
]);
