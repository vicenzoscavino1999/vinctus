import { test, expect } from '@playwright/test';

const loginWithSeedUser = async (page) => {
  const createPostButton = page.getByLabel(/Crear publicaci/i);

  await page.goto('/');

  if (await createPostButton.isVisible({ timeout: 2000 }).catch(() => false)) {
    return;
  }

  await page.locator('input[type="email"]').fill('alice@vinctus.local');
  await page.locator('input[type="password"]').fill('password123');
  await page
    .locator('form')
    .getByRole('button', { name: /Entrar/i })
    .click();
  await expect(createPostButton).toBeVisible({ timeout: 15000 });
};

test.describe('Flujo de Grupos', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
      localStorage.setItem('vinctus_onboarding_complete', 'true');
    });
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
