import type { Page } from '@playwright/test';

export const resetClientState = async (page: Page): Promise<void> => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('vinctus_onboarding_complete', 'true');
  });
};

export const loginWithSeedUser = async (page: Page): Promise<void> => {
  const textboxes = page.getByRole('textbox');
  await page.goto('/');

  const textboxCount = await textboxes.count();
  if (textboxCount < 2) {
    return;
  }

  const emailInput = textboxes.first();
  const passwordInput = textboxes.nth(1);

  await emailInput.fill('alice@vinctus.local');
  await passwordInput.fill('password123');
  await page
    .getByRole('button', { name: /Entrar/i })
    .last()
    .click();
  await page.waitForTimeout(1500);
};

export const isLoginScreenVisible = async (page: Page): Promise<boolean> => {
  return page
    .getByRole('button', { name: /Registro/i })
    .isVisible({ timeout: 1500 })
    .catch(() => false);
};
