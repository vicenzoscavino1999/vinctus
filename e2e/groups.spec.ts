import { test, expect } from '@playwright/test';
import { loginWithSeedUser, resetClientState } from './helpers/session';

test.describe('Flujo de Grupos', () => {
  test.beforeEach(async ({ page }) => {
    await resetClientState(page);
  });

  test('login con usuario seed', async ({ page }) => {
    await loginWithSeedUser(page);
    await expect(page.getByLabel(/Crear publicaci/i)).toBeVisible();
  });

  test('toggle unirse/salir de grupo funciona', async ({ page }) => {
    await loginWithSeedUser(page);

    await page.goto('/group/1');

    const joinButton = page.locator('button').filter({ hasText: /Unirme al grupo/i });
    const joinedButton = page.locator('button').filter({ hasText: /Unido/i });
    await expect(joinButton.or(joinedButton)).toBeVisible({ timeout: 10000 });

    if (await joinButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await joinButton.click();
      await expect(joinedButton).toBeVisible({ timeout: 3000 });

      await joinedButton.click();
      await expect(joinButton).toBeVisible({ timeout: 3000 });
    } else if (await joinedButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await joinedButton.click();
      await expect(joinButton).toBeVisible({ timeout: 3000 });
    }
  });
});
