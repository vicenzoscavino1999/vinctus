import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { loginWithSeedUser, prepareOnboardingState } from './helpers/session';

test('@smoke public post direct links require login', async ({ page }) => {
  await prepareOnboardingState(page);
  await page.goto('/post/post_1');
  await expect(page.locator('input[type="email"]')).toBeVisible();
  await expect(page.getByLabel(/Compartir publicaci/i)).toHaveCount(0);
});

test('@smoke private group posts and comments disappear on reload after membership revocation', async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const project = process.env.FIREBASE_PROJECT_ID || 'vinctus-dev';
  expect(project).toBe('vinctus-dev');
  const base = `http://127.0.0.1:8080/v1/projects/${project}/databases/(default)/documents`;
  const suffix = randomUUID();
  const group = `groups/privacy-${suffix}`;
  const post = `posts/privacy-${suffix}`;
  const member = `${group}/members/user_b`;
  const comment = `${post}/comments/comment`;
  const headers = { Authorization: 'Bearer owner' };
  const title = `Private title ${suffix}`;
  const text = `Private comment ${suffix}`;
  const write = async (path: string, fields: Record<string, unknown>) => {
    expect((await page.request.patch(`${base}/${path}`, { headers, data: { fields } })).ok()).toBe(
      true,
    );
  };
  try {
    await write(group, {
      ownerId: { stringValue: 'user_a' },
      visibility: { stringValue: 'private' },
    });
    await write(member, { uid: { stringValue: 'user_b' } });
    await write(post, {
      authorId: { stringValue: 'user_a' },
      groupId: { stringValue: group.split('/')[1] },
      title: { stringValue: title },
      text: { stringValue: 'Members only' },
      status: { stringValue: 'ready' },
      media: { arrayValue: { values: [] } },
      createdAt: { timestampValue: new Date().toISOString() },
    });
    await write(comment, {
      authorId: { stringValue: 'user_a' },
      text: { stringValue: text },
      createdAt: { timestampValue: new Date().toISOString() },
    });
    await prepareOnboardingState(page);
    await loginWithSeedUser(page, 'bob');
    await page.goto(`/post/${post.split('/')[1]}?comments=1`);
    await expect(page.getByRole('heading', { name: title }).first()).toBeVisible({
      timeout: 20000,
    });
    await expect(page.getByText(text, { exact: true })).toBeVisible({ timeout: 20000 });
    expect((await page.request.delete(`${base}/${member}`, { headers })).ok()).toBe(true);
    await page.reload();
    await expect(page.getByText('Publicacion no encontrada', { exact: true })).toBeVisible({
      timeout: 20000,
    });
    await expect(page.getByText(title, { exact: true })).toHaveCount(0);
    await expect(page.getByText(text, { exact: true })).toHaveCount(0);
    await page.screenshot({ path: info.outputPath('private-post-after-revocation.png') });
  } finally {
    for (const path of [comment, post, member, group])
      await page.request.delete(`${base}/${path}`, { headers });
  }
});
