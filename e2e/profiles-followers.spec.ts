import { expect, test } from '@playwright/test';
import {
  loginWithSeedUser,
  prepareOnboardingState,
  waitForAuthenticatedShell,
} from './helpers/session';

test.describe('Profiles and followers', () => {
  test.beforeEach(async ({ page }) => {
    await prepareOnboardingState(page);
  });

  test('@smoke editar perfil con limpieza de bio y flujo seguir/dejar de seguir', async ({
    page,
  }) => {
    test.setTimeout(90000);
    await loginWithSeedUser(page, 'alice');
    await waitForAuthenticatedShell(page);

    // 1. Edit profile bio, save, reopen and clear bio to verify null persistence
    await page.goto('/profile');
    const editButton = page.getByRole('button', { name: /Editar perfil/i });
    await expect(editButton).toBeVisible({ timeout: 15000 });
    await editButton.click();

    const bioText = `Bio temporal ${Date.now()}`;
    const bioField = page.getByPlaceholder(/Cuéntale al mundo/i);
    await expect(bioField).toBeVisible({ timeout: 10000 });
    await bioField.fill(bioText);
    await page.getByRole('button', { name: /Guardar Cambios/i }).click();
    await expect(bioField).toBeHidden({ timeout: 15000 });
    await expect(page.getByText(bioText)).toBeVisible({ timeout: 15000 });

    await page.getByRole('button', { name: /Editar perfil/i }).click();
    await expect(bioField).toBeVisible({ timeout: 10000 });
    await bioField.fill('');
    await page.getByRole('button', { name: /Guardar Cambios/i }).click();
    await expect(bioField).toBeHidden({ timeout: 15000 });
    await expect(page.getByText(bioText)).toBeHidden({ timeout: 15000 });

    // 2. Follow and unfollow another seeded user, and inspect connections list
    await page.goto('/user/user_c');
    await expect(page.getByRole('heading', { name: /Carla R\./i })).toBeVisible({ timeout: 15000 });

    const followBtn = page.getByRole('button', { name: /^Seguir$/i });
    await expect(followBtn).toBeVisible({ timeout: 10000 });
    await followBtn.click();
    await expect(page.getByRole('button', { name: /^Siguiendo$/i })).toBeVisible({
      timeout: 15000,
    });

    await page.getByRole('button', { name: /Seguidores/i }).click();
    await page.waitForURL(/\/user\/user_c\/connections\?tab=followers/, { timeout: 15000 });
    await expect(page.getByText('Alice V.')).toBeVisible({ timeout: 15000 });

    await page.goto('/user/user_c');
    await expect(page.getByRole('button', { name: /^Siguiendo$/i })).toBeVisible({
      timeout: 15000,
    });
    await page.getByRole('button', { name: /^Siguiendo$/i }).click();
    await expect(page.getByRole('button', { name: /^Seguir$/i })).toBeVisible({ timeout: 15000 });
  });
});
