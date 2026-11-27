import { expect, test } from '@playwright/test';
import { waitForGroupDetailReady } from './helpers/group';
import {
  loginWithSeedUser,
  prepareOnboardingState,
  waitForAuthenticatedShell,
} from './helpers/session';

test.describe('Smoke e2e', () => {
  test.beforeEach(async ({ page }) => {
    await prepareOnboardingState(page);
  });

  test('@smoke login + crear post', async ({ page }) => {
    await loginWithSeedUser(page);

    const createPostButton = page.getByLabel(/Crear publicaci/i);
    await createPostButton.click();

    await expect(page.getByRole('heading', { name: /Crear publicaci/i })).toBeVisible();

    await page.getByLabel('Descripción de la publicación').fill(`Smoke post ${Date.now()}`);

    await page.getByRole('button', { name: /^Publicar$/ }).click();

    await page.waitForURL('**/feed', { timeout: 15000 });
    await expect(page.getByRole('heading', { name: /Crear publicaci/i })).toBeHidden();
  });

  test('@smoke crear publicacion desde perfil y grupo, verla y abrir su detalle', async ({
    page,
  }) => {
    test.setTimeout(90000);
    await loginWithSeedUser(page, 'alice');
    await waitForAuthenticatedShell(page);

    // 1. Crear desde Perfil, ver en la cuadrícula y abrir su detalle
    await page.goto('/profile');
    await expect(page.getByRole('heading', { name: /^Publicaciones$/i })).toBeVisible({
      timeout: 20000,
    });
    await page.getByRole('button', { name: /^Publicar$/i }).click();

    const profileDialog = page.getByRole('dialog', { name: 'Crear publicación' });
    const profileTitle = `Post desde perfil ${Date.now()}`;
    await profileDialog.getByLabel('Título (opcional)').fill(profileTitle);
    await profileDialog
      .getByLabel('Descripción de la publicación')
      .fill('Cuerpo completo creado desde Mi Perfil.');
    await profileDialog.getByRole('button', { name: /^Publicar$/ }).click();
    await expect(profileDialog).toHaveCount(0, { timeout: 20000 });
    await expect(page).toHaveURL(/\/profile$/);

    const profileTile = page.getByRole('button', { name: new RegExp(profileTitle) });
    await expect(profileTile).toBeVisible({ timeout: 20000 });
    await profileTile.click();
    await page.waitForURL(/\/post\/.+/, { timeout: 15000 });
    await expect(page.getByRole('heading', { name: profileTitle })).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText('Cuerpo completo creado desde Mi Perfil.')).toBeVisible();

    // 2. Crear desde Grupo, ver en Publicaciones recientes y abrir su detalle
    await page.goto('/group/1');
    await waitForGroupDetailReady(page, /Mecanica Cuantica/i, 30000);
    await page.getByRole('button', { name: /^Publicar$/i }).click();

    const groupDialog = page.getByRole('dialog', { name: 'Crear publicación' });
    const groupTitle = `Post de grupo ${Date.now()}`;
    await groupDialog.getByLabel('Título (opcional)').fill(groupTitle);
    await groupDialog
      .getByLabel('Descripción de la publicación')
      .fill('Debate publicado directamente dentro del grupo.');
    await groupDialog.getByRole('button', { name: /^Publicar$/ }).click();
    await expect(groupDialog).toHaveCount(0, { timeout: 20000 });

    const groupPostCard = page.getByRole('button', {
      name: new RegExp(`Abrir publicacion: ${groupTitle}`),
    });
    await expect(groupPostCard).toBeVisible({ timeout: 20000 });
    await groupPostCard.click();
    await page.waitForURL(/\/post\/.+/, { timeout: 15000 });
    await expect(page.getByRole('heading', { name: groupTitle })).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText('Debate publicado directamente dentro del grupo.')).toBeVisible();
  });
});
