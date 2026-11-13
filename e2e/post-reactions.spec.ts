import { expect as baseExpect, test } from '@playwright/test';
import { loginWithSeedUser, prepareOnboardingState } from './helpers/session';

const expect = baseExpect.configure({ timeout: 20000 });

test('@smoke likes and saves retry a lost acknowledgement without changing timestamps or toggling back', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(180000);
  await prepareOnboardingState(page);
  await loginWithSeedUser(page, 'bob');
  const base = `http://127.0.0.1:8080/v1/projects/${process.env.FIREBASE_PROJECT_ID || 'vinctus-dev'}/databases/(default)/documents`;
  const adminHeaders = { Authorization: 'Bearer owner' };
  for (const path of [
    'posts/post_1/likes/user_b',
    'users/user_b/likes/post_1',
    'users/user_b/savedPosts/post_1',
  ]) {
    await page.request.delete(`${base}/${path}`, { headers: adminHeaders });
  }
  await page.goto('/post/post_1');
  await expect(page.getByRole('button', { name: 'Me gusta', exact: true })).toBeEnabled({
    timeout: 20000,
  });
  await expect(
    page.getByRole('button', { name: 'Guardar publicación', exact: true }),
  ).toBeEnabled();
  let stage: 'like' | 'save' | null = 'like';
  const injected: string[] = [];
  await page.route('http://127.0.0.1:8080/**', async (route) => {
    const request = route.request();
    const body = request.postData() ?? '';
    const target =
      stage === 'like' ? 'posts/post_1/likes/user_b' : 'users/user_b/savedPosts/post_1';
    if (stage && request.url().includes(':commit') && body.includes(target)) {
      const kind = stage;
      stage = null;
      const accepted = await route.fetch();
      expect(accepted.ok()).toBe(true);
      injected.push(kind);
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({
          error: {
            code: 403,
            status: 'PERMISSION_DENIED',
            message: 'Injected lost acknowledgement after successful commit',
          },
        }),
      });
      return;
    }
    await route.continue();
  });
  const timestamp = async (path: string) => {
    const response = await page.request.get(`${base}/${path}`, { headers: adminHeaders });
    expect(response.ok()).toBe(true);
    return (await response.json()).fields.createdAt.timestampValue as string;
  };
  await page.getByRole('button', { name: 'Me gusta', exact: true }).click();
  const retryLike = page.getByRole('button', { name: 'Reintentar me gusta', exact: true });
  await expect(retryLike).toBeEnabled({ timeout: 25000 });
  await expect(page.getByRole('alert')).toContainText('No se confirmó');
  await page.screenshot({ path: info.outputPath('reaction-retry.png') });
  const likeDate = await timestamp('posts/post_1/likes/user_b');
  await retryLike.click();
  await expect(page.getByRole('button', { name: 'Quitar me gusta', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(await timestamp('posts/post_1/likes/user_b')).toBe(likeDate);
  expect(await timestamp('users/user_b/likes/post_1')).toBe(likeDate);

  stage = 'save';
  await page.getByRole('button', { name: 'Guardar publicación', exact: true }).click();
  const retrySave = page.getByRole('button', { name: 'Reintentar guardar', exact: true });
  await expect(retrySave).toBeEnabled({ timeout: 25000 });
  const saveDate = await timestamp('users/user_b/savedPosts/post_1');
  await retrySave.click();
  await expect(
    page.getByRole('button', { name: 'Quitar de guardados', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  expect(await timestamp('users/user_b/savedPosts/post_1')).toBe(saveDate);
  expect(injected).toEqual(['like', 'save']);
  await page.goto('/profile');
  const savedPanel = page.getByRole('region', { name: 'Publicaciones guardadas', exact: true });
  await expect(savedPanel.getByRole('link', { name: /Hola mundo desde el seed/ })).toBeVisible({
    timeout: 20000,
  });
  await savedPanel.getByRole('link').first().click();
  await page.waitForURL('**/post/post_1');
  await expect(page.getByRole('button', { name: 'Quitar me gusta', exact: true })).toBeEnabled();

  // A fresh browser session reads the confirmed state rather than local preferences.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'Compartir publicacion' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Quitar me gusta', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(
    page.getByRole('button', { name: 'Quitar de guardados', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  const otherContext = await browser.newContext();
  try {
    const other = await otherContext.newPage();
    await prepareOnboardingState(other);
    await loginWithSeedUser(other, 'carla');
    await other.goto('/post/post_1');
    await expect(other.getByRole('button', { name: 'Me gusta', exact: true })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await expect(
      other.getByRole('button', { name: 'Guardar publicación', exact: true }),
    ).toHaveAttribute('aria-pressed', 'false');
  } finally {
    await otherContext.close();
  }
  await page.goto('/feed');
  await expect(
    page.getByRole('button', { name: 'Quitar me gusta', exact: true }).first(),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(
    page.getByRole('button', { name: 'Quitar de guardados', exact: true }).first(),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: info.outputPath('reactions-confirmed.png') });
  await page.goto('/post/post_1');
  await page.getByRole('button', { name: 'Quitar me gusta', exact: true }).click();
  await page.getByRole('button', { name: 'Quitar de guardados', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Me gusta', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await expect(
    page.getByRole('button', { name: 'Guardar publicación', exact: true }),
  ).toHaveAttribute('aria-pressed', 'false');
  for (const path of [
    'posts/post_1/likes/user_b',
    'users/user_b/likes/post_1',
    'users/user_b/savedPosts/post_1',
  ]) {
    expect((await page.request.get(`${base}/${path}`, { headers: adminHeaders })).status()).toBe(
      404,
    );
  }
});
