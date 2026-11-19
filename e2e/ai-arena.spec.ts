import { expect, test } from '@playwright/test';
import { loginWithSeedUser, waitForAuthenticatedShell } from './helpers/session';

test.describe('IA Chat y Arena', () => {
  test.beforeEach(async ({ page }) => {
    // Initialize storage once per context without wiping localStorage on subsequent navigations,
    // so cross-account consent isolation is verified with Alice's cached entry still present.
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('__vinctus_ai_e2e_init')) {
        localStorage.clear();
        sessionStorage.clear();
        sessionStorage.setItem('__vinctus_ai_e2e_init', '1');
        localStorage.setItem('vinctus_onboarding_complete', 'true');
      }
    });
  });

  test('@smoke consentimiento IA aislado por cuenta, AI Chat con acción createGroup y Arena con likes/guardado y privacidad', async ({
    page,
  }) => {
    test.setTimeout(90000);

    await page.route('**/api/chat', async (route) => {
      const requestBody = route.request().postDataJSON() as { message?: string } | null;
      const text = requestBody?.message ?? '';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          provider: 'gemini',
          model: 'gemini-3.8-flash',
          response: `Respuesta simulada para: ${text}`,
          history: [
            { role: 'user', parts: [{ text }] },
            { role: 'model', parts: [{ text: `Respuesta simulada para: ${text}` }] },
          ],
          action: { type: 'createGroup', groupId: '1' },
        }),
      });
    });

    // 1. Alice grants AI consent on /ai/chat and completes a chat turn + reset.
    await loginWithSeedUser(page, 'alice');
    await waitForAuthenticatedShell(page);

    await page.goto('/ai/chat');
    await expect(page.getByRole('button', { name: 'Aceptar y continuar' })).toBeVisible({
      timeout: 15000,
    });
    await page.getByRole('button', { name: 'Aceptar y continuar' }).click();
    await expect(page.getByPlaceholder(/Escribe un mensaje/i)).toBeEnabled({ timeout: 15000 });

    const storedConsent = await page.evaluate(() => ({
      legacyKey: localStorage.getItem('vinctus:ai-consent:v1'),
      scopedKey: localStorage.getItem('vinctus:ai-consent:v2:user_a'),
    }));
    expect(storedConsent.legacyKey).toBeNull();
    expect(storedConsent.scopedKey).toContain('"granted":true');

    await page.getByPlaceholder(/Escribe un mensaje/i).fill('Crea un grupo de fisica');
    await page.getByRole('button', { name: 'Enviar' }).click();
    await expect(page.getByText('Respuesta simulada para: Crea un grupo de fisica')).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByRole('link', { name: 'Ver grupo' })).toHaveAttribute('href', '/group/1');

    await page.getByRole('button', { name: /Nueva conversación/i }).click();
    await expect(page.getByText('Respuesta simulada para: Crea un grupo de fisica')).toHaveCount(0);

    // 2. Navigate to /arena — server consent persists and daily usage loads from Functions emulator.
    await page.goto('/arena');
    await expect(page.getByRole('heading', { name: 'Arena IA' })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: 'Aceptar y continuar' })).toHaveCount(0);
    await expect(page.getByText(/\d+\/\d+/)).toBeVisible({ timeout: 15000 });

    // 3. View seeded public Arena debate, like (reconciled by Cloud Functions) and save.
    await page.goto('/arena/debate_seed_1');
    await expect(
      page.getByText('¿La energía nuclear es clave para la transición energética?'),
    ).toBeVisible({ timeout: 15000 });
    await expect(
      page.getByRole('link', { name: 'https://www.iaea.org/topics/nuclear-power-reactors' }),
    ).toBeVisible();

    const likeButton = page.getByRole('button', { name: 'Dar me gusta' });
    await likeButton.click();
    const unlikeButton = page.getByRole('button', { name: 'Quitar me gusta' });
    await expect(unlikeButton).toContainText('1', { timeout: 15000 });
    await expect(unlikeButton).toBeEnabled({ timeout: 15000 });

    await page.getByRole('button', { name: 'Guardar' }).click();
    const savedButton = page.getByRole('button', { name: 'Guardado' });
    await expect(savedButton).toBeVisible({ timeout: 15000 });
    await expect(savedButton).toBeEnabled({ timeout: 15000 });
    await expect(page.getByText('Debate guardado en tu perfil')).toBeVisible({ timeout: 15000 });

    // Reload and verify persisted like + saved state.
    await page.reload();
    await expect(page.getByRole('button', { name: 'Quitar me gusta' })).toContainText('1', {
      timeout: 15000,
    });
    await expect(page.getByRole('button', { name: 'Guardado' })).toBeVisible({ timeout: 15000 });

    // 4. Opening Bob's private debate must show clean access/not-found message, not infinite loading.
    await page.goto('/arena/debate_seed_private_bob');
    await expect(
      page.getByText('Este debate no existe o no tienes acceso para verlo.'),
    ).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: 'Volver a Arena' }).click();
    await expect(page.getByLabel('Tema del debate')).toBeVisible({ timeout: 15000 });

    // 5. Cross-account isolation: Bob signs in on the same browser (while Alice's scoped cache
    // remains in localStorage) and must NOT inherit Alice's consent.
    await page.goto('/settings');
    await page.getByRole('button', { name: /Cerrar sesión/i }).click();
    await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 15000 });
    await loginWithSeedUser(page, 'bob');
    await waitForAuthenticatedShell(page);
    await page.goto('/ai/chat');
    await expect(page.getByRole('button', { name: 'Aceptar y continuar' })).toBeVisible({
      timeout: 15000,
    });
    const aliceKeyStillPresent = await page.evaluate(() =>
      localStorage.getItem('vinctus:ai-consent:v2:user_a'),
    );
    expect(aliceKeyStillPresent).toContain('"granted":true');
  });
});
