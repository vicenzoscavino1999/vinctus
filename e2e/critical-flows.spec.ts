import { expect, test } from '@playwright/test';
import { waitForGroupDetailReady } from './helpers/group';
import {
  loginWithSeedUser,
  prepareOnboardingState,
  waitForAuthenticatedShell,
} from './helpers/session';

test.describe('Critical flows', () => {
  test.beforeEach(async ({ page }) => {
    await prepareOnboardingState(page);
  });

  test('@smoke login -> feed -> post -> chat -> groups', async ({ page }) => {
    await loginWithSeedUser(page, 'alice');
    await waitForAuthenticatedShell(page);

    await page.goto('/feed');
    const likeButton = page.getByLabel(/Dar like/i).first();
    await expect(likeButton).toBeVisible({ timeout: 15000 });
    await page.mouse.wheel(0, 2400);
    const loadMoreButton = page.getByRole('button', { name: /Cargar m/i });
    if (await loadMoreButton.isVisible({ timeout: 1500 }).catch(() => false)) {
      await loadMoreButton.click();
      await expect(likeButton).toBeVisible({ timeout: 10000 });
    }

    await page.goto('/post/post_1');
    await expect(page.getByLabel(/Compartir publicaci/i)).toBeVisible({ timeout: 10000 });

    await page.goto('/messages?conversation=dm_user_a_user_b');
    const messageInput = page.getByPlaceholder(/Escribe un mensaje/i);
    await expect(messageInput).toBeVisible({ timeout: 15000 });
    const text = `E2E critical ${Date.now()}`;
    await messageInput.fill(text);
    await messageInput.press('Enter');
    await expect(page.getByText(text)).toBeVisible({ timeout: 15000 });

    await page.goto('/group/1');
    await waitForGroupDetailReady(page, /Mecanica Cuantica/i, 30000);
    await expect(page.getByRole('heading', { name: /Mecanica Cuantica/i })).toBeVisible({
      timeout: 10000,
    });
    await page.getByRole('button', { name: /Chat/i }).click();
    await page.waitForURL(/\/messages\?conversation=grp_1/);
    await expect(page.getByPlaceholder(/Escribe un mensaje/i)).toBeVisible({ timeout: 10000 });
  });
});
