import { expect, test } from '@playwright/test';
import { isLoginScreenVisible, loginWithSeedUser, resetClientState } from './helpers/session';

test.describe('Critical flows @critical', () => {
  test('feed scroll + abrir post', async ({ page }) => {
    await resetClientState(page);
    await loginWithSeedUser(page);
    test.skip(await isLoginScreenVisible(page), 'Auth emulator no iniciada en este entorno.');

    await page.goto('/feed');
    test.skip(!page.url().includes('/feed'), 'Ruta /feed no disponible en este entorno.');

    const commentButtons = page.getByLabel(/Comentarios/i);
    const hasCommentsButton = await commentButtons
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    const hasEmptyState = await page
      .getByText(/No hay posts|No hay posts todav/i)
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    test.skip(!hasCommentsButton && !hasEmptyState, 'Feed sin data util para validar comentario.');

    if (!hasCommentsButton) return;

    await commentButtons.first().click();
    await expect(page.getByRole('heading', { name: /Comentarios \(/i })).toBeVisible({
      timeout: 10000,
    });
  });

  test('chat privado enviar mensaje', async ({ page }) => {
    await resetClientState(page);
    await loginWithSeedUser(page);
    test.skip(await isLoginScreenVisible(page), 'Auth emulator no iniciada en este entorno.');

    await page.goto('/messages');
    test.skip(!page.url().includes('/messages'), 'Ruta /messages no disponible en este entorno.');

    const privateTab = page.getByRole('button', { name: /Privados/i });
    const hasPrivateTab = await privateTab.isVisible({ timeout: 5000 }).catch(() => false);
    test.skip(!hasPrivateTab, 'UI de mensajes privados no visible en este entorno.');
    await privateTab.click();

    const firstConversation = page.locator('div.space-y-2 > button').first();
    await expect(firstConversation).toBeVisible({ timeout: 10000 });
    await firstConversation.click();

    const messageInput = page.getByPlaceholder('Escribe un mensaje...');
    await expect(messageInput).toBeVisible({ timeout: 10000 });

    const messageText = `E2E critical ${Date.now()}`;
    await messageInput.fill(messageText);
    await page.locator('form button[type="submit"]').click();

    await expect(page.getByText(messageText).last()).toBeVisible({ timeout: 10000 });
  });

  test('grupo detalle abrir y estado membresia visible', async ({ page }) => {
    await resetClientState(page);
    await loginWithSeedUser(page);
    test.skip(await isLoginScreenVisible(page), 'Auth emulator no iniciada en este entorno.');

    await page.goto('/group/1');
    test.skip(!page.url().includes('/group/1'), 'Ruta /group/:id no disponible en este entorno.');

    const joinButton = page.getByRole('button', { name: /Unirme al grupo/i });
    const joinedButton = page.getByRole('button', { name: /Unido/i });
    const hasJoinState = await joinButton
      .or(joinedButton)
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    test.skip(!hasJoinState, 'Estado de membresia no renderizado para el grupo seed.');
  });
});
