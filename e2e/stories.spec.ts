import { expect, test } from '@playwright/test';
import {
  loginWithSeedUser,
  prepareOnboardingState,
  waitForAuthenticatedShell,
} from './helpers/session';

const storyPhoto = {
  name: 'story.png',
  mimeType: 'image/png',
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQ0AAAAASUVORK5CYII=',
    'base64',
  ),
};

test.describe('Flujo de Historias', () => {
  test.beforeEach(async ({ page }) => {
    await prepareOnboardingState(page);
  });

  test('@smoke publicar historia, ver como seguidor, reportar, bloquear y eliminar propia', async ({
    page,
    browser,
  }) => {
    test.setTimeout(90000);
    const project = process.env.FIREBASE_PROJECT_ID || 'vinctus-dev';
    const base = `http://127.0.0.1:8080/v1/projects/${project}/databases/(default)/documents`;
    const headers = { Authorization: 'Bearer owner' };
    const nowIso = new Date().toISOString();

    const patchDoc = async (path: string, fields: Record<string, unknown>) => {
      const res = await page.request.patch(`${base}/${path}`, { headers, data: { fields } });
      expect(res.ok()).toBe(true);
    };

    const deleteDocIfPresent = async (path: string) => {
      await page.request.delete(`${base}/${path}`, { headers }).catch(() => undefined);
    };

    const bobContext = await browser.newContext();
    const bobPage = await bobContext.newPage();

    try {
      await patchDoc('users/user_b/following/user_a', {
        uid: { stringValue: 'user_a' },
        createdAt: { timestampValue: nowIso },
      });
      await patchDoc('users/user_a/followers/user_b', {
        uid: { stringValue: 'user_b' },
        createdAt: { timestampValue: nowIso },
      });

      // 1. Alice publishes an image story and verifies her story opens.
      await loginWithSeedUser(page, 'alice');
      await waitForAuthenticatedShell(page);

      await page.getByRole('button', { name: 'Agregar historia' }).click();
      const composer = page.getByRole('dialog', { name: 'Nueva historia' });
      await expect(composer).toBeVisible({ timeout: 10000 });
      await composer.locator('input[accept*="image"]').setInputFiles(storyPhoto);

      const publishButton = composer.getByRole('button', { name: /Publicar historia/i });
      await expect(publishButton).toBeEnabled({ timeout: 15000 });
      await publishButton.click();
      await expect(page.getByText('Historia publicada')).toBeVisible({ timeout: 20000 });
      await expect(composer).toBeHidden({ timeout: 10000 });

      // 2. Bob (follower) sees Alice's story circle, opens it, reports it, and blocks Alice.
      await prepareOnboardingState(bobPage);
      await loginWithSeedUser(bobPage, 'bob');
      await waitForAuthenticatedShell(bobPage);

      const aliceStoryBubble = bobPage.getByRole('button', { name: /Alice V\./i }).first();
      await expect(aliceStoryBubble).toBeVisible({ timeout: 20000 });
      await aliceStoryBubble.click();

      const bobViewer = bobPage.getByRole('dialog', { name: 'Visor de historias' });
      await expect(bobViewer).toBeVisible({ timeout: 10000 });
      await expect(bobViewer.getByAltText('Historia')).toBeVisible({ timeout: 15000 });

      await bobViewer.getByRole('button', { name: 'Más opciones' }).click();
      await bobViewer.getByRole('button', { name: 'Denunciar historia' }).click();
      await bobPage
        .getByPlaceholder('Describe el motivo del reporte')
        .fill('Contenido inapropiado');
      await bobPage.getByRole('button', { name: 'Enviar reporte' }).click();
      await expect(bobPage.getByText('Reporte enviado')).toBeVisible({ timeout: 15000 });

      await bobViewer.getByRole('button', { name: 'Más opciones' }).click();
      await bobViewer.getByRole('button', { name: /Bloquear a Alice V\./i }).click();
      await bobViewer.getByRole('button', { name: /^Bloquear$/ }).click();
      await expect(bobViewer).toBeHidden({ timeout: 15000 });
      await expect(aliceStoryBubble).toBeHidden({ timeout: 15000 });

      // 3. Alice deletes her own story cleanly from the viewer.
      await page.getByRole('button', { name: 'Ver tu historia' }).click();
      const aliceViewer = page.getByRole('dialog', { name: 'Visor de historias' });
      await expect(aliceViewer).toBeVisible({ timeout: 10000 });
      await aliceViewer.getByRole('button', { name: 'Eliminar historia' }).click();
      await aliceViewer.getByRole('button', { name: /^Eliminar$/ }).click();
      await expect(page.getByText('Historia eliminada')).toBeVisible({ timeout: 15000 });
      await expect(aliceViewer).toBeHidden({ timeout: 10000 });
    } finally {
      await Promise.all([
        bobContext.close(),
        deleteDocIfPresent('users/user_b/following/user_a'),
        deleteDocIfPresent('users/user_a/followers/user_b'),
        deleteDocIfPresent('users/user_b/blockedUsers/user_a'),
      ]);
    }
  });
});
