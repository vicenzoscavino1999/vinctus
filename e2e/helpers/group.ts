import { expect, type Page } from '@playwright/test';

export const waitForGroupDetailReady = async (
  page: Page,
  groupNamePattern: RegExp,
  timeout = 20000,
): Promise<void> => {
  const startedAt = Date.now();
  const reloadAfterMs = Math.min(15000, Math.floor(timeout / 2));
  let reloaded = false;

  const heading = page.getByRole('heading', { name: groupNamePattern });
  const notFound = page.getByText(/Grupo no encontrado|Publicacion no encontrada/i).first();
  const loadError = page.getByText(/No se pudo cargar el grupo/i).first();

  await expect
    .poll(
      async () => {
        if (await heading.isVisible().catch(() => false)) {
          return 'ready';
        }
        if (await notFound.isVisible().catch(() => false)) {
          return 'not_found';
        }
        if (await loadError.isVisible().catch(() => false)) {
          return 'error';
        }

        if (!reloaded && Date.now() - startedAt >= reloadAfterMs) {
          reloaded = true;
          await page.reload({ waitUntil: 'domcontentloaded' });
        }

        return 'loading';
      },
      { timeout },
    )
    .toBe('ready');
};
