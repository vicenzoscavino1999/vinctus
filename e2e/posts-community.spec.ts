import { expect, test } from '@playwright/test';
import { loginWithSeedUser, prepareOnboardingState } from './helpers/session';

test('comment survives an offline attempt, retries once, and is visible to the author', async ({
  page,
  context,
  browser,
}, info) => {
  test.setTimeout(90000);
  await prepareOnboardingState(page);
  await loginWithSeedUser(page, 'bob');
  await page.goto('/post/post_1?comments=1');
  await page.getByRole('button', { name: /Agregar comentario/ }).click();
  const editor = page.getByPlaceholder('Escribe tu comentario...');
  const text = `Comentario con reintento ${Date.now()}`;
  await editor.fill(text);
  await context.setOffline(true);
  try {
    await page.getByRole('button', { name: 'Comentar', exact: true }).click();
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 25000 });
    await expect(editor).toHaveValue(text);
  } finally {
    await context.setOffline(false);
  }
  await expect(page.getByRole('button', { name: 'Comentar', exact: true })).toBeEnabled({
    timeout: 20000,
  });
  await page.getByRole('button', { name: 'Comentar', exact: true }).click();
  await expect(editor).toHaveValue('', { timeout: 20000 });
  await expect(page.getByText(text, { exact: true })).toHaveCount(1);
  await expect(page.getByRole('heading', { name: /^Comentarios \(/ })).toContainText('1');
  const project = process.env.FIREBASE_PROJECT_ID || 'vinctus-dev';
  const stored = await page.request.get(
    `http://127.0.0.1:8080/v1/projects/${project}/databases/(default)/documents/posts/post_1/comments`,
  );
  expect(stored.ok()).toBe(true);
  const data = await stored.json();
  expect(
    data.documents.filter(
      (doc: { fields: { text?: { stringValue: string } } }) =>
        doc.fields.text?.stringValue === text,
    ),
  ).toHaveLength(1);

  const second = await browser.newContext();
  try {
    const author = await second.newPage();
    await prepareOnboardingState(author);
    await loginWithSeedUser(author, 'alice');
    await author.goto('/post/post_1?comments=1');
    await expect(author.getByText(text, { exact: true })).toBeVisible({ timeout: 20000 });
    const screenshot = info.outputPath('comments-after-retry.png');
    await page.screenshot({ path: screenshot });
    await info.attach('comments-after-retry', {
      path: screenshot,
      contentType: 'image/png',
    });
  } finally {
    await second.close();
  }
});
