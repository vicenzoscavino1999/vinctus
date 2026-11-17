import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { waitForGroupDetailReady } from './helpers/group';
import {
  loginWithSeedUser,
  prepareOnboardingState,
  waitForAuthenticatedShell,
} from './helpers/session';

test.describe('Flujo de Grupos', () => {
  test.beforeEach(async ({ page }) => {
    await prepareOnboardingState(page);
  });

  test('login con usuario seed', async ({ page }) => {
    await loginWithSeedUser(page);
    await expect(page.getByLabel(/Crear publicaci/i)).toBeVisible();
  });

  test('owner abre grupo y chat', async ({ page }) => {
    await loginWithSeedUser(page, 'alice');
    await waitForAuthenticatedShell(page);

    await page.goto('/group/1');
    await waitForGroupDetailReady(page, /Mecanica Cuantica/i, 30000);
    await expect(page.getByRole('heading', { name: /Mecanica Cuantica/i })).toBeVisible();

    const statusButton = page.locator('button').filter({ hasText: /Tu grupo|Unido|Pendiente/i });
    await expect(statusButton).toBeVisible({ timeout: 10000 });

    await page.getByRole('button', { name: /Chat/i }).click();
    await page.waitForURL(/\/messages\?conversation=grp_1/);
    await expect(page.getByPlaceholder(/Escribe un mensaje/i)).toBeVisible({ timeout: 10000 });
  });

  test('miembro puede unirse y salir del grupo', async ({ page }) => {
    await loginWithSeedUser(page, 'bob');
    await waitForAuthenticatedShell(page);
    await page.goto('/group/1');
    await waitForGroupDetailReady(page, /Mecanica Cuantica/i, 30000);

    const joinButton = page.locator('button').filter({ hasText: /Unirme al grupo|Solicitar/i });
    await expect(joinButton).toBeVisible({ timeout: 10000 });
    await joinButton.click();

    const joinedButton = page.locator('button').filter({ hasText: /Unido|Pendiente/i });
    await expect(joinedButton).toBeVisible({ timeout: 10000 });

    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: /^Salir$/ }).click();
    await expect(joinButton).toBeVisible({ timeout: 10000 });
  });

  test('@smoke grupo privado: editar, ocultar miembros a externos, solicitar, aprobar, salir y volver a solicitar', async ({
    page,
    browser,
  }) => {
    test.setTimeout(90000);
    const project = process.env.FIREBASE_PROJECT_ID || 'vinctus-dev';
    const base = `http://127.0.0.1:8080/v1/projects/${project}/databases/(default)/documents`;
    const headers = { Authorization: 'Bearer owner' };
    const suffix = randomUUID().slice(0, 8);
    const groupId = `e2e-priv-${suffix}`;
    const initialName = `Privado Inicial ${suffix}`;
    const editedName = `Privado Editado ${suffix}`;
    const nowIso = new Date().toISOString();

    const patchDoc = async (path: string, fields: Record<string, unknown>) => {
      const res = await page.request.patch(`${base}/${path}`, { headers, data: { fields } });
      expect(res.ok()).toBe(true);
    };

    const bobContext = await browser.newContext();
    const bobPage = await bobContext.newPage();

    try {
      await patchDoc(`groups/${groupId}`, {
        name: { stringValue: initialName },
        description: { stringValue: 'Descripcion privada inicial' },
        categoryId: { nullValue: null },
        visibility: { stringValue: 'private' },
        ownerId: { stringValue: 'user_a' },
        iconUrl: { nullValue: null },
        memberCount: { integerValue: '1' },
        createdAt: { timestampValue: nowIso },
        updatedAt: { timestampValue: nowIso },
      });
      await patchDoc(`groups/${groupId}/members/user_a`, {
        uid: { stringValue: 'user_a' },
        groupId: { stringValue: groupId },
        role: { stringValue: 'admin' },
        joinedAt: { timestampValue: nowIso },
      });
      await patchDoc(`users/user_a/memberships/${groupId}`, {
        groupId: { stringValue: groupId },
        joinedAt: { timestampValue: nowIso },
      });

      // Alice edits group name without double-counting members.
      await loginWithSeedUser(page, 'alice');
      await waitForAuthenticatedShell(page);
      await page.goto(`/group/${groupId}`);
      await waitForGroupDetailReady(page, new RegExp(initialName, 'i'), 30000);
      await page.getByRole('button', { name: /Editar grupo/i }).click();
      await page.waitForURL(new RegExp(`/group/${groupId}/edit`));
      const nameInput = page.locator('form input:not([type="file"])').first();
      await expect(nameInput).toHaveValue(initialName);
      await nameInput.fill(editedName);
      await page.getByRole('button', { name: /Guardar cambios/i }).click();
      await page.waitForURL(new RegExp(`/group/${groupId}$`));
      await waitForGroupDetailReady(page, new RegExp(editedName, 'i'), 30000);
      await expect(page.getByText(/1 miembros/i)).toBeVisible();

      // Bob (non-member) sees private access lock and sends a join request.
      await prepareOnboardingState(bobPage);
      await loginWithSeedUser(bobPage, 'bob');
      await waitForAuthenticatedShell(bobPage);
      await bobPage.goto(`/group/${groupId}`);
      await waitForGroupDetailReady(bobPage, new RegExp(editedName, 'i'), 30000);
      await expect(
        bobPage.getByText(/Solo los miembros pueden ver la lista de participantes/i),
      ).toBeVisible();
      await expect(bobPage.getByRole('button', { name: /Ver miembros/i })).toHaveCount(0);

      await bobPage.getByRole('button', { name: /^Solicitar$/i }).click();
      await expect(bobPage.getByRole('button', { name: /^Pendiente$/i })).toBeVisible({
        timeout: 15000,
      });

      // Alice accepts Bob's request on Notifications -> Grupos.
      await page.goto('/notifications');
      await page.getByRole('button', { name: /^Grupos$/i }).click();
      await expect(page.getByText(editedName)).toBeVisible({ timeout: 15000 });
      const requestRow = page
        .locator('div.rounded-xl')
        .filter({ hasText: editedName })
        .filter({
          has: page.getByRole('button', { name: /^Aceptar$/i }),
        });
      await requestRow
        .first()
        .getByRole('button', { name: /^Aceptar$/i })
        .click();
      await expect(page.getByText(editedName)).toHaveCount(0, { timeout: 15000 });

      // Bob reloads, verifies member access, leaves, and re-applies cleanly.
      await bobPage.reload({ waitUntil: 'domcontentloaded' });
      await waitForGroupDetailReady(bobPage, new RegExp(editedName, 'i'), 30000);
      await expect(bobPage.getByRole('button', { name: /^Unido$/i })).toBeVisible({
        timeout: 15000,
      });
      await expect(bobPage.getByRole('button', { name: /Ver miembros/i })).toBeVisible();

      bobPage.once('dialog', (dialog) => dialog.accept());
      await bobPage.getByRole('button', { name: /^Salir$/ }).click();
      await expect(bobPage.getByRole('button', { name: /^Solicitar$/i })).toBeVisible({
        timeout: 15000,
      });

      await bobPage.getByRole('button', { name: /^Solicitar$/i }).click();
      await expect(bobPage.getByRole('button', { name: /^Pendiente$/i })).toBeVisible({
        timeout: 15000,
      });
    } finally {
      await bobContext.close().catch(() => {});
      for (const path of [
        `groups/${groupId}/members/user_b`,
        `groups/${groupId}/members/user_a`,
        `users/user_b/memberships/${groupId}`,
        `users/user_a/memberships/${groupId}`,
        `conversations/grp_${groupId}/members/user_b`,
        `conversations/grp_${groupId}/members/user_a`,
        `conversations/grp_${groupId}`,
        `groups/${groupId}`,
      ]) {
        await page.request.delete(`${base}/${path}`, { headers }).catch(() => {});
      }
    }
  });
});
