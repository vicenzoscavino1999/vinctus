import { expect, test } from '@playwright/test';
import {
  loginWithSeedUser,
  prepareOnboardingState,
  waitForAuthenticatedShell,
} from './helpers/session';

test.describe('Descubrir y busqueda', () => {
  test.beforeEach(async ({ page }) => {
    await prepareOnboardingState(page);
  });

  test('@smoke filtrar intereses y grupos en Discover, explorar categoria y ocultar bloqueados en busqueda', async ({
    page,
  }) => {
    test.setTimeout(90000);
    const project = process.env.FIREBASE_PROJECT_ID || 'vinctus-dev';
    const base = `http://127.0.0.1:8080/v1/projects/${project}/databases/(default)/documents`;
    const headers = { Authorization: 'Bearer owner' };
    const nowIso = new Date().toISOString();

    await page.route('**/api/discover?*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          source: 'arxiv',
          query: 'quant-ph',
          limit: 8,
          provider: 'arXiv',
          ttlSeconds: 600,
          fetchedAt: nowIso,
          cached: false,
          data: [
            {
              id: '2601.12345',
              title: 'Entrelazamiento Cuantico Verificado',
              summary: 'Resumen de prueba para la vista En Vivo.',
              authors: 'Ada Lovelace',
              published: '2026-01-15',
              link: 'https://arxiv.org/abs/2601.12345',
              type: 'Paper',
            },
          ],
        }),
      }),
    );

    await page.route('**/api/youtube-search?*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [],
          nextPageToken: null,
          cached: false,
          fetchedAt: nowIso,
          limit: 6,
          query: 'test',
          ttlSeconds: 0,
        }),
      }),
    );

    const blockPath = 'users/user_a/blockedUsers/user_c';

    try {
      await loginWithSeedUser(page, 'alice');
      await waitForAuthenticatedShell(page);

      // 1. Discover search filters both categories and recommended groups accent-insensitively.
      await page.goto('/discover');
      const discoverSearch = page.getByLabel('Buscar intereses o grupos');
      await expect(discoverSearch).toBeVisible({ timeout: 15000 });
      await discoverSearch.fill('cuantica');
      await expect(page.getByText(/Mecanica Cuantica/i).first()).toBeVisible({ timeout: 15000 });
      await page.getByLabel('Limpiar búsqueda').click();

      // 2. Category detail renders live content and community groups cleanly.
      await page.goto('/category/science');
      await expect(page.getByRole('heading', { name: /Ciencia & Materia/i })).toBeVisible({
        timeout: 15000,
      });
      await expect(page.getByText('Entrelazamiento Cuantico Verificado')).toBeVisible({
        timeout: 15000,
      });
      await page.getByRole('button', { name: 'Comunidades' }).click();
      await expect(page.getByText(/Mecanica Cuantica/i).first()).toBeVisible({ timeout: 15000 });

      // 3. /search finds users and matching groups while hiding blocked users.
      const blockRes = await page.request.patch(`${base}/${blockPath}`, {
        headers,
        data: {
          fields: {
            blockedUid: { stringValue: 'user_c' },
            status: { stringValue: 'active' },
            blockedAt: { timestampValue: nowIso },
          },
        },
      });
      expect(blockRes.ok()).toBe(true);

      await page.goto('/search');
      const userSearchInput = page.getByLabel('Buscar usuarios');
      await expect(userSearchInput).toBeVisible({ timeout: 15000 });
      await expect(page.getByText('Bob N.')).toBeVisible({ timeout: 15000 });
      await expect(page.getByText('Carla R.')).toHaveCount(0);

      await userSearchInput.fill('Bob');
      await expect(page.getByText('Bob N.')).toBeVisible({ timeout: 15000 });

      await userSearchInput.fill('Carla');
      await expect(page.getByText('No hay resultados.')).toBeVisible({ timeout: 15000 });
      await expect(page.getByText('Carla R.')).toHaveCount(0);

      await userSearchInput.fill('Mecanica');
      await expect(page.getByText(/Mecanica Cuantica/i).first()).toBeVisible({ timeout: 15000 });
    } finally {
      await page.request.delete(`${base}/${blockPath}`, { headers }).catch(() => undefined);
    }
  });
});
