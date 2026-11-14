import { randomUUID } from 'node:crypto';
import { expect as baseExpect, test, type Page } from '@playwright/test';
import { loginWithSeedUser, prepareOnboardingState } from './helpers/session';

const expect = baseExpect.configure({ timeout: 20000 });
const emptyYouTube = async (page: Page) =>
  page.route('**/api/youtube-search?*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [],
        nextPageToken: null,
        cached: false,
        fetchedAt: new Date().toISOString(),
        limit: 6,
        query: 'test',
        ttlSeconds: 0,
      }),
    }),
  );

test('@smoke Discover reads reactions beyond 50 indexes and retries lost acknowledgements without double counts', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(180000);
  const project = process.env.FIREBASE_PROJECT_ID || 'vinctus-dev';
  expect(project).toBe('vinctus-dev');
  const documentRoot = `projects/${project}/databases/(default)/documents`;
  const base = `http://127.0.0.1:8080/v1/${documentRoot}`;
  const headers = { Authorization: 'Bearer owner' };
  const suffix = randomUUID();
  const postId = `zz-discover-${suffix}`;
  const authorId = `discover-author-${suffix}`;
  const title = `Reacciones de Discover ${suffix}`;
  const stamp = new Date().toISOString();
  const sourceLike = `posts/${postId}/likes/user_b`;
  const likeIndex = `users/user_b/likes/${postId}`;
  const savedIndex = `users/user_b/savedPosts/${postId}`;
  const dummyIds = Array.from(
    { length: 52 },
    (_, index) => `discover-a-${suffix}-${String(index).padStart(2, '0')}`,
  );
  const str = (value: string) => ({ stringValue: value });
  const date = { timestampValue: stamp };
  const writes: Array<{ update: { name: string; fields: Record<string, unknown> } }> = [];
  const seed = (path: string, fields: Record<string, unknown>) =>
    writes.push({ update: { name: `${documentRoot}/${path}`, fields } });
  for (const profile of [`users/${authorId}`, `users_public/${authorId}`])
    seed(profile, {
      displayName: str('Discover QA'),
      accountVisibility: str('public'),
      karmaGlobal: { integerValue: '0' },
      reputation: { integerValue: '0' },
      karmaByInterest: { mapValue: { fields: {} } },
    });
  seed(`posts/${postId}`, {
    authorId: str(authorId),
    authorSnapshot: {
      mapValue: { fields: { displayName: str('Discover QA'), photoURL: { nullValue: null } } },
    },
    title: str(title),
    text: str('Estado confirmado por cuenta y publicación'),
    status: str('ready'),
    categoryId: str('science'),
    media: { arrayValue: { values: [] } },
    createdAt: date,
    likeCount: { integerValue: '1' },
    commentCount: { integerValue: '0' },
  });
  // Orphan indexes are legitimate after parent deletion. Keep the actual post
  // after 52 of them in the old bootstrap's document-ID order.
  for (const id of dummyIds) {
    seed(`users/user_b/likes/${id}`, { postId: str(id), createdAt: date });
    seed(`users/user_b/savedPosts/${id}`, { postId: str(id), createdAt: date });
  }
  seed(sourceLike, { uid: str('user_b'), postId: str(postId), createdAt: date });
  for (const path of [likeIndex, savedIndex]) seed(path, { postId: str(postId), createdAt: date });
  const raw = async (path: string) => {
    const response = await page.request.get(`${base}/${path}`, { headers });
    expect(response.ok()).toBe(true);
    return (await response.json()).fields;
  };
  try {
    expect((await page.request.post(`${base}:commit`, { headers, data: { writes } })).ok()).toBe(
      true,
    );
    const limited = await page.request.post(`${base}/users/user_b:runQuery`, {
      headers,
      data: { structuredQuery: { from: [{ collectionId: 'likes' }], limit: 50 } },
    });
    expect(limited.ok()).toBe(true);
    const bootstrap = (await limited.json()) as Array<{ document?: { name: string } }>;
    expect(bootstrap.filter((row) => row.document)).toHaveLength(50);
    expect(bootstrap.some((row) => row.document?.name.endsWith(`/${postId}`))).toBe(false);
    await emptyYouTube(page);
    await prepareOnboardingState(page);
    await loginWithSeedUser(page, 'bob');
    await page.goto('/discover');
    const card = page.getByRole('article', { name: `Publicación: ${title}`, exact: true });
    const liked = card.getByRole('button', { name: 'Quitar me gusta', exact: true });
    await expect(liked).toHaveAttribute('aria-pressed', 'true');
    await expect(liked).toHaveText('1');
    await expect(card.getByRole('button', { name: 'Quitar de guardados' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await liked.click();
    await expect(card.getByRole('button', { name: 'Me gusta', exact: true })).toBeEnabled();
    await card.getByRole('button', { name: 'Quitar de guardados' }).click();
    await expect(card.getByRole('button', { name: 'Guardar publicación' })).toBeEnabled();

    let stage: 'like' | 'save' | null = 'like';
    const injected: string[] = [];
    await page.route('http://127.0.0.1:8080/**', async (route) => {
      const request = route.request();
      const target = stage === 'like' ? sourceLike : savedIndex;
      if (
        stage &&
        request.url().includes(':commit') &&
        (request.postData() ?? '').includes(target)
      ) {
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
              message: 'Injected lost acknowledgement after commit',
            },
          }),
        });
      } else await route.continue();
    });
    await card.getByRole('button', { name: 'Me gusta', exact: true }).click();
    const retryLike = card.getByRole('button', { name: 'Reintentar me gusta', exact: true });
    await expect(retryLike).toBeEnabled();
    await expect(card.getByRole('alert')).toContainText('No se confirmó');
    const likeTime = (await raw(sourceLike)).createdAt.timestampValue;
    await retryLike.click();
    await expect(liked).toBeEnabled();
    await expect(liked).toHaveText('1');
    expect((await raw(sourceLike)).createdAt.timestampValue).toBe(likeTime);
    expect((await raw(likeIndex)).createdAt.timestampValue).toBe(likeTime);
    stage = 'save';
    await card.getByRole('button', { name: 'Guardar publicación' }).click();
    const retrySave = card.getByRole('button', { name: 'Reintentar guardar', exact: true });
    await expect(retrySave).toBeEnabled();
    const savedTime = (await raw(savedIndex)).createdAt.timestampValue;
    await retrySave.click();
    await expect(card.getByRole('button', { name: 'Quitar de guardados' })).toBeEnabled();
    expect((await raw(savedIndex)).createdAt.timestampValue).toBe(savedTime);
    expect(injected).toEqual(['like', 'save']);
    await expect
      .poll(async () => Number((await raw(`posts/${postId}`)).likeCount.integerValue))
      .toBe(1);
    await page.reload();
    await expect(liked).toHaveAttribute('aria-pressed', 'true');
    await expect(liked).toHaveText('1');
    await expect(card.getByRole('button', { name: 'Quitar de guardados' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await card.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath('discover-reactions-confirmed.png') });
    const otherContext = await browser.newContext();
    try {
      const other = await otherContext.newPage();
      await emptyYouTube(other);
      await prepareOnboardingState(other);
      await loginWithSeedUser(other, 'carla');
      await other.goto('/discover');
      const otherCard = other.getByRole('article', { name: `Publicación: ${title}`, exact: true });
      await expect(
        otherCard.getByRole('button', { name: 'Me gusta', exact: true }),
      ).toHaveAttribute('aria-pressed', 'false');
      await expect(otherCard.getByRole('button', { name: 'Me gusta', exact: true })).toHaveText(
        '1',
      );
      await expect(otherCard.getByRole('button', { name: 'Guardar publicación' })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
    } finally {
      await otherContext.close();
    }
  } finally {
    for (const path of [
      sourceLike,
      likeIndex,
      savedIndex,
      ...dummyIds.flatMap((id) => [`users/user_b/likes/${id}`, `users/user_b/savedPosts/${id}`]),
      `posts/${postId}`,
      `users/${authorId}`,
      `users_public/${authorId}`,
    ]) {
      await page.request.delete(`${base}/${path}`, { headers });
    }
  }
});
