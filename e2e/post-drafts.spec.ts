import { expect, test, type Page } from '@playwright/test';
import { loginWithSeedUser, prepareOnboardingState } from './helpers/session';

const open = async (page: Page) => {
  await page
    .getByLabel(/Crear publicaci/i)
    .first()
    .click();
  const dialog = page.getByRole('dialog', { name: 'Crear publicación' });
  await expect(dialog.getByRole('status')).toHaveText('Borrador guardado en este dispositivo');
  return dialog;
};
const signOut = async (page: Page) => {
  await page.goto('/settings');
  await page.getByText('Cerrar sesión', { exact: true }).click();
  await expect(page.locator('input[type="email"]')).toBeVisible();
};

test('@smoke local post drafts stay with their account when users sign out and back in', async ({
  page,
}) => {
  test.setTimeout(90000);
  await prepareOnboardingState(page);
  await loginWithSeedUser(page, 'alice');
  const alice = await open(page);
  await alice.getByLabel('Título (opcional)').fill('Borrador privado de Alice');
  await alice.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await expect(alice).toBeHidden();
  await signOut(page);
  await loginWithSeedUser(page, 'bob');
  const bob = await open(page);
  await expect(bob.getByLabel('Título (opcional)')).toHaveValue('');
  await bob.getByLabel('Título (opcional)').fill('Borrador de Bob');
  await bob.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await expect(bob).toBeHidden();
  await signOut(page);
  await loginWithSeedUser(page, 'alice');
  const restored = await open(page);
  await expect(restored.getByLabel('Título (opcional)')).toHaveValue('Borrador privado de Alice');
  page.once('dialog', (dialog) => dialog.accept());
  await restored.getByRole('button', { name: 'Descartar borrador' }).click();
  const empty = await open(page);
  await expect(empty.getByLabel('Título (opcional)')).toHaveValue('');
});

test('@smoke a stale browser editor keeps its text and cannot overwrite another windows draft', async ({
  page,
  context,
}) => {
  test.setTimeout(90000);
  await prepareOnboardingState(page);
  await loginWithSeedUser(page, 'alice');
  const first = await open(page);
  const other = await context.newPage();
  await other.goto('/feed');
  const stale = await open(other);
  await first.getByLabel('Título (opcional)').fill('Primera ventana');
  await expect(first.getByRole('status')).toHaveText('Borrador guardado en este dispositivo');
  await stale.getByLabel('Título (opcional)').fill('Cambios de la otra ventana');
  await expect(stale.getByRole('alert')).toContainText('otra ventana');
  await expect(stale.getByLabel('Título (opcional)')).toHaveValue('Cambios de la otra ventana');
  await expect(stale.getByRole('button', { name: 'Publicar', exact: true })).toBeDisabled();
  await first.getByRole('button', { name: 'Cerrar', exact: true }).click();
  const restored = await open(page);
  await expect(restored.getByLabel('Título (opcional)')).toHaveValue('Primera ventana');
  page.once('dialog', (dialog) => dialog.accept());
  await restored.getByRole('button', { name: 'Descartar borrador' }).click();
  // A tombstone must continue denying the stale editor after the successful discard.
  await stale.getByRole('button', { name: 'Reintentar guardado' }).click();
  await expect(stale.getByRole('alert')).toContainText('otra ventana');
  const empty = await open(page);
  await expect(empty.getByLabel('Título (opcional)')).toHaveValue('');
});
