import { expect, type Page } from '@playwright/test';

export const SEEDED_USERS = {
  alice: { email: 'alice@vinctus.local', password: 'password123' },
  bob: { email: 'bob@vinctus.local', password: 'password123' },
  carla: { email: 'carla@vinctus.local', password: 'password123' },
} as const;

export const prepareOnboardingState = async (page: Page): Promise<void> => {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('vinctus_onboarding_complete', 'true');
  });
};

export const loginWithCredentials = async (
  page: Page,
  email: string,
  password: string,
): Promise<void> => {
  const createPostButton = page.getByLabel(/Crear publicaci/i);

  await page.goto('/');

  if (await createPostButton.isVisible({ timeout: 2000 }).catch(() => false)) {
    return;
  }

  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page
    .locator('form')
    .getByRole('button', { name: /Entrar/i })
    .click();

  await expect(createPostButton).toBeVisible({ timeout: 15000 });
};

export const loginWithSeedUser = async (
  page: Page,
  seedUser: keyof typeof SEEDED_USERS = 'alice',
): Promise<void> => {
  const credentials = SEEDED_USERS[seedUser];
  await loginWithCredentials(page, credentials.email, credentials.password);
};

export const waitForAuthenticatedShell = async (page: Page): Promise<void> => {
  await expect(page.getByLabel(/Crear publicaci/i)).toBeVisible({ timeout: 15000 });
};
