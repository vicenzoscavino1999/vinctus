import { expect, test } from '@playwright/test';

const loginWithSeedUser = async (page: import('@playwright/test').Page) => {
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

test.describe('Smoke e2e', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
      localStorage.setItem('vinctus_onboarding_complete', 'true');
    });
  });

  test('@smoke login + crear post', async ({ page }) => {
    await loginWithSeedUser(page);

    const createPostButton = page.getByLabel(/Crear publicaci/i);
    await createPostButton.click();

    await expect(page.getByRole('heading', { name: /Crear Publicacion/i })).toBeVisible();

    await page
      .getByPlaceholder(/Escribe la descripcion de tu publicacion/i)
      .fill(`Smoke post ${Date.now()}`);

    await page.getByRole('button', { name: /^Publicar$/ }).click();

    await page.waitForURL('**/feed', { timeout: 15000 });
    await expect(page.getByRole('heading', { name: /Crear Publicacion/i })).toBeHidden();
  });
});
