import { expect, test } from '@playwright/test';
import { loginWithSeedUser, resetClientState } from './helpers/session';

test.describe('Smoke e2e', () => {
  test.beforeEach(async ({ page }) => {
    await resetClientState(page);
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
