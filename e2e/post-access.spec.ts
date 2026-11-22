import { expect, test } from '@playwright/test';
import { loginWithSeedUser, prepareOnboardingState } from './helpers/session';

test('@smoke a block stops new reactions at the server and unblocking permits the same retry', async ({
  page,
}, info) => {
  test.setTimeout(180000);
  const project = process.env.FIREBASE_PROJECT_ID || 'vinctus-dev';
  const base = `http://127.0.0.1:8080/v1/projects/${project}/databases/(default)/documents`;
  const headers = { Authorization: 'Bearer owner' };
  const block = 'users/user_a/blockedUsers/user_b';
  const reactions = [
    'posts/post_1/likes/user_b',
    'users/user_b/likes/post_1',
    'users/user_b/savedPosts/post_1',
  ];
  const cleanup = async () => {
    for (const path of [block, ...reactions])
      await page.request.delete(`${base}/${path}`, { headers });
  };
  await cleanup();
  try {
    await prepareOnboardingState(page);
    await loginWithSeedUser(page, 'bob');
    await page.goto('/post/post_1');
    await expect(page.getByRole('button', { name: 'Me gusta', exact: true })).toBeEnabled({
      timeout: 20000,
    });
    await page.getByRole('button', { name: 'Me gusta', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Quitar me gusta', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Quitar me gusta', exact: true })).toBeEnabled({
      timeout: 25000,
    });
    for (const path of reactions.slice(0, 2)) {
      expect((await page.request.get(`${base}/${path}`, { headers })).ok()).toBe(true);
    }

    // The permission changes after the page was opened. The server must reject
    // the subsequent write even though the controls are still on screen.
    const response = await page.request.patch(`${base}/${block}`, {
      headers,
      data: {
        fields: {
          blockedUid: { stringValue: 'user_b' },
          status: { stringValue: 'active' },
          blockedAt: { timestampValue: new Date().toISOString() },
        },
      },
    });
    expect(response.ok()).toBe(true);
    await page.getByRole('button', { name: 'Quitar me gusta', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Me gusta', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Me gusta', exact: true }).click();
    const retryLike = page.getByRole('button', { name: 'Reintentar me gusta', exact: true });
    await expect(retryLike).toBeEnabled({ timeout: 25000 });
    await page.getByRole('button', { name: 'Guardar publicación', exact: true }).click();
    const retrySave = page.getByRole('button', { name: /Reintentar.*guard/i });
    await expect(retrySave).toBeEnabled({ timeout: 25000 });
    for (const path of reactions) {
      expect((await page.request.get(`${base}/${path}`, { headers })).status()).toBe(404);
    }
    await page.screenshot({ path: info.outputPath('blocked-reactions.png') });

    expect((await page.request.delete(`${base}/${block}`, { headers })).ok()).toBe(true);
    await retryLike.click();
    await expect(
      page.getByRole('button', { name: 'Quitar me gusta', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Quitar me gusta', exact: true })).toBeEnabled({
      timeout: 25000,
    });
    await retrySave.click();
    await expect(
      page.getByRole('button', { name: 'Quitar de guardados', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(
      page.getByRole('button', { name: 'Quitar de guardados', exact: true }),
    ).toBeEnabled({ timeout: 25000 });
    for (const path of reactions) {
      expect((await page.request.get(`${base}/${path}`, { headers })).ok()).toBe(true);
    }
    await page.getByRole('button', { name: 'Quitar me gusta', exact: true }).click();
    await page.getByRole('button', { name: 'Quitar de guardados', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Me gusta', exact: true })).toBeEnabled();
    await expect(
      page.getByRole('button', { name: 'Guardar publicación', exact: true }),
    ).toBeEnabled();
  } finally {
    await cleanup();
  }
});
