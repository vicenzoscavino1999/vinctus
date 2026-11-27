import { expect, test } from '@playwright/test';
import { waitForGroupDetailReady } from './helpers/group';
import { loginWithSeedUser, prepareOnboardingState } from './helpers/session';

test.describe('Chat details', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(60000);
  test.beforeEach(async ({ page }) => {
    await prepareOnboardingState(page);
    await loginWithSeedUser(page, 'alice');
  });

  test('opens from the chat, mutes and unmutes, and a search result returns to the message', async ({
    page,
  }) => {
    await page.goto('/messages?conversation=dm_user_a_user_b');
    const input = page.getByRole('textbox', { name: 'Mensaje', exact: true });
    await expect(input).toBeVisible({ timeout: 20000 });
    const text = `Detalles del chat ${Date.now()}`;
    await input.fill(text);
    await page.getByRole('button', { name: 'Enviar mensaje', exact: true }).click();
    await expect(page.getByRole('log').getByText(text, { exact: true })).toBeVisible({
      timeout: 20000,
    });

    await page.getByRole('button', { name: 'Ver detalles del chat' }).click();
    await expect(page).toHaveURL(/\/messages\/dm_user_a_user_b\/details$/);
    await expect(page.getByRole('heading', { name: 'Bob N.' })).toBeVisible({ timeout: 15000 });

    // Muting writes the member document under the Firestore rules, and survives a reload.
    await page.getByRole('button', { name: 'Silenciar', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Silenciar conversación' })
      .getByRole('button', { name: '1 hora' })
      .click();
    await expect(page.getByText(/^Silenciado hasta/)).toBeVisible({ timeout: 15000 });
    await page.reload();
    await expect(page.getByText(/^Silenciado hasta/)).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: 'Quitar silencio' }).click();
    await expect(page.getByRole('button', { name: 'Silenciar', exact: true })).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText(/^Silenciado hasta/)).toHaveCount(0);

    await page.getByRole('button', { name: 'Buscar en la conversación' }).click();
    const search = page.getByRole('dialog', { name: 'Buscar en la conversación' });
    await search.getByRole('textbox', { name: 'Buscar mensajes' }).fill(text);
    await search.getByRole('button', { name: new RegExp(text) }).click();
    await expect(page).toHaveURL(/\/messages\?conversation=dm_user_a_user_b/);
    await expect(page.getByRole('log').getByText(text, { exact: true })).toBeVisible({
      timeout: 20000,
    });
  });

  test('the owner sees Editar grupo instead of Salir, and goes back to the chat', async ({
    page,
  }) => {
    await page.goto('/group/1');
    await waitForGroupDetailReady(page, /Mecanica Cuantica/i, 30000);
    await page.getByRole('button', { name: /Chat/i }).click();
    await page.waitForURL(/\/messages\?conversation=grp_1/);

    await page.getByRole('button', { name: 'Opciones del grupo' }).click();
    await expect(page).toHaveURL(/\/messages\/grp_1\/group-details$/);
    await expect(page.getByRole('heading', { name: 'Mecanica Cuantica' })).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByRole('button', { name: /Editar grupo/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Salir del grupo' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Volver al chat' }).click();
    await expect(page).toHaveURL(/\/messages\?conversation=grp_1/);
    await expect(page.getByRole('textbox', { name: 'Mensaje', exact: true })).toBeVisible({
      timeout: 15000,
    });
  });
});
