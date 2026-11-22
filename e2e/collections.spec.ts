import { expect, test } from '@playwright/test';
import {
  loginWithSeedUser,
  prepareOnboardingState,
  waitForAuthenticatedShell,
} from './helpers/session';

test.describe('Colecciones', () => {
  test.beforeEach(async ({ page }) => {
    await prepareOnboardingState(page);
  });

  test('@smoke crear carpeta, agregar enlace/nota/PDF, renombrar, verificar recientes y eliminar', async ({
    page,
  }) => {
    test.setTimeout(90000);
    const suffix = Date.now().toString(36).slice(-5);
    const initialName = `Lecturas ${suffix}`;
    const renamedName = `Archivo ${suffix}`;

    await loginWithSeedUser(page, 'alice');
    await waitForAuthenticatedShell(page);

    await page.goto('/library');
    await expect(page.getByRole('heading', { name: 'Colecciones' })).toBeVisible({
      timeout: 15000,
    });

    // 1. Create collection
    await page.getByRole('button', { name: /\+ Nueva carpeta/i }).click();
    const createDialog = page.getByRole('dialog', { name: 'Nueva carpeta' });
    await createDialog.getByLabel(/Nombre/i).fill(initialName);
    await createDialog.getByRole('button', { name: 'Crear' }).click();
    await expect(page.getByRole('button', { name: new RegExp(`^${initialName}`) })).toBeVisible({
      timeout: 15000,
    });

    // 2. Open collection and add a link, a note, and a PDF file
    await page.getByRole('button', { name: new RegExp(`^${initialName}`) }).click();
    const dialog = page.getByRole('dialog', { name: initialName });
    await expect(dialog).toBeVisible({ timeout: 15000 });

    await dialog.getByLabel(/Título/i).fill('Paper de prueba');
    await dialog.getByLabel(/Enlace/i).fill('https://arxiv.org/abs/2401.00001');
    await dialog.getByRole('button', { name: 'Agregar' }).click();
    await expect(dialog.getByText('Paper de prueba')).toBeVisible({ timeout: 15000 });
    await expect(dialog.getByRole('link', { name: /Abrir/i }).first()).toHaveAttribute(
      'href',
      'https://arxiv.org/abs/2401.00001',
    );

    await dialog.getByLabel('Tipo').selectOption('note');
    await dialog.getByLabel(/Título/i).fill('Nota clave');
    await dialog.getByLabel(/Nota/i).fill('Revisar ecuaciones del capítulo 2');
    await dialog.getByRole('button', { name: 'Agregar' }).click();
    await expect(dialog.getByText('Nota clave')).toBeVisible({ timeout: 15000 });

    await dialog.getByLabel('Tipo').selectOption('file');
    await dialog.getByLabel(/Título/i).fill('Documento PDF');
    await dialog.getByLabel(/Archivo/i).setInputFiles({
      name: 'guia.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF'),
    });
    await dialog.getByRole('button', { name: 'Agregar' }).click();
    await expect(dialog.getByText('Documento PDF')).toBeVisible({ timeout: 20000 });

    // 3. Rename collection and verify live name in Recents
    await dialog.getByLabel('Editar carpeta').click();
    const editorDialog = page.getByRole('dialog', { name: 'Editar carpeta' });
    await editorDialog.getByLabel(/Nombre/i).fill(renamedName);
    await editorDialog.getByRole('button', { name: 'Guardar' }).click();
    const renamedDialog = page.getByRole('dialog', { name: renamedName });
    await expect(renamedDialog).toBeVisible({ timeout: 15000 });

    // 4. Delete one item inline and verify count updates
    await renamedDialog.getByLabel('Eliminar Nota clave').click();
    await renamedDialog.getByRole('button', { name: 'Confirmar' }).click();
    await expect(renamedDialog.getByText('Nota clave')).toHaveCount(0, { timeout: 15000 });

    // 5. Close detail, verify live renamed folder appears in Recents
    await renamedDialog.getByLabel('Cerrar').click();
    await expect(page.getByText(`Colección: ${renamedName}`).first()).toBeVisible({
      timeout: 15000,
    });

    // 6. Reopen and delete the folder cleanly
    await page.getByRole('button', { name: new RegExp(`^${renamedName}`) }).click();
    const deleteDialog = page.getByRole('dialog', { name: renamedName });
    await deleteDialog.getByLabel('Eliminar carpeta').click();
    await deleteDialog.getByRole('button', { name: 'Confirmar eliminación' }).click();
    await expect(page.getByRole('button', { name: new RegExp(`^${renamedName}`) })).toHaveCount(0, {
      timeout: 15000,
    });
  });
});
