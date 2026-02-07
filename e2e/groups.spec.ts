import { test, expect } from '@playwright/test';
import { waitForGroupDetailReady } from './helpers/group';
import {
  loginWithSeedUser,
  prepareOnboardingState,
  waitForAuthenticatedShell,
} from './helpers/session';

test.describe('Flujo de Grupos', () => {
  test.beforeEach(async ({ page }) => {
    await prepareOnboardingState(page);
  });

  test('login con usuario seed', async ({ page }) => {
    await loginWithSeedUser(page);
    await expect(page.getByLabel(/Crear publicaci/i)).toBeVisible();
  });

  test('owner abre grupo y chat', async ({ page }) => {
    await loginWithSeedUser(page, 'alice');
    await waitForAuthenticatedShell(page);

    await page.goto('/group/1');
    await waitForGroupDetailReady(page, /Mecanica Cuantica/i, 30000);
    await expect(page.getByRole('heading', { name: /Mecanica Cuantica/i })).toBeVisible();

    const statusButton = page.locator('button').filter({ hasText: /Tu grupo|Unido|Pendiente/i });
    await expect(statusButton).toBeVisible({ timeout: 10000 });

    await page.getByRole('button', { name: /Chat/i }).click();
    await page.waitForURL(/\/messages\?conversation=grp_1/);
    await expect(page.getByPlaceholder(/Escribe un mensaje/i)).toBeVisible({ timeout: 10000 });
  });

  test('miembro puede unirse y salir del grupo', async ({ page }) => {
    await loginWithSeedUser(page, 'bob');
    await waitForAuthenticatedShell(page);
    await page.goto('/group/1');
    await waitForGroupDetailReady(page, /Mecanica Cuantica/i, 30000);

    const joinButton = page.locator('button').filter({ hasText: /Unirme al grupo|Solicitar/i });
    await expect(joinButton).toBeVisible({ timeout: 10000 });
    await joinButton.click();

    const joinedButton = page.locator('button').filter({ hasText: /Unido|Pendiente/i });
    await expect(joinedButton).toBeVisible({ timeout: 10000 });

    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: /^Salir$/ }).click();
    await expect(joinButton).toBeVisible({ timeout: 10000 });
  });
});
