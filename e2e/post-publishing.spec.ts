import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { loginWithSeedUser, prepareOnboardingState } from './helpers/session';

const photo = {
  name: 'photo.png',
  mimeType: 'image/png',
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQ0AAAAASUVORK5CYII=',
    'base64',
  ),
};
const video = {
  name: 'clip.mp4',
  mimeType: 'video/mp4',
  buffer: readFileSync('ios-native/VinctusNative/Tests/Fixtures/chat-video.mp4'),
};
const document = {
  name: 'notes.pdf',
  mimeType: 'application/pdf',
  buffer: Buffer.from('%PDF-1.4\n%%EOF'),
};
type StoredPost = {
  name: string;
  fields: {
    title: { stringValue: string };
    status: { stringValue: string };
    createdAt: { timestampValue: string };
    media: {
      arrayValue: {
        values?: Array<{ mapValue: { fields: Record<string, { stringValue: string }> } }>;
      };
    };
  };
};

test('@smoke recovers a partial photo/video/document upload without duplicate posts or object overwrites', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(90000);
  await prepareOnboardingState(page);
  await loginWithSeedUser(page, 'alice');
  await page
    .getByLabel(/Crear publicaci/i)
    .first()
    .click();
  const dialog = page.getByRole('dialog', { name: 'Crear publicación' });
  const title = `Adjuntos con recuperación ${Date.now()}`;
  await dialog.getByLabel('Titulo (opcional)').fill(title);
  await dialog.getByLabel('Seleccionar imágenes de la publicación').setInputFiles(photo);
  await expect(dialog.locator('img[src^="blob:"]')).toHaveCount(1, { timeout: 10000 });
  await dialog.getByLabel('Seleccionar videos de la publicación').setInputFiles(video);
  await dialog.getByLabel('Seleccionar documentos de la publicación').setInputFiles(document);
  let rejected = false;
  let imageStarts = 0;
  await page.route('http://127.0.0.1:9199/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const name = url.searchParams.get('name') ?? '';
    if (
      request.method() === 'POST' &&
      (request.headers()['x-goog-upload-command'] === 'start' ||
        request.headers()['x-goog-upload-protocol'] === 'multipart')
    ) {
      if (name.includes('/images/')) imageStarts += 1;
      if (name.includes('/videos/') && !rejected) {
        rejected = true;
        await route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({ error: { code: 403, message: 'Injected upload failure' } }),
        });
        return;
      }
    }
    await route.continue();
  });
  await dialog.getByRole('button', { name: 'Publicar', exact: true }).click();
  await expect(dialog.getByRole('alert')).toBeVisible({ timeout: 20000 });
  expect(rejected).toBe(true);
  await expect(dialog.getByLabel('Titulo (opcional)')).toHaveValue(title);
  const project = process.env.FIREBASE_PROJECT_ID || 'vinctus-dev';
  const list = async () => {
    const response = await page.request.get(
      `http://127.0.0.1:8080/v1/projects/${project}/databases/(default)/documents/posts`,
    );
    expect(response.ok()).toBe(true);
    const data = await response.json();
    return (data.documents as StoredPost[]).filter(
      (post) => post.fields.title?.stringValue === title,
    );
  };
  const pending = await list();
  expect(pending).toHaveLength(1);
  expect(pending[0].fields.status.stringValue).toBe('uploading');
  await dialog.getByRole('button', { name: 'Publicar', exact: true }).click();
  await expect(dialog).toHaveCount(0, { timeout: 20000 });
  const accepted = await list();
  expect(accepted).toHaveLength(1);
  expect(accepted[0].name).toBe(pending[0].name);
  expect(accepted[0].fields.createdAt.timestampValue).toBe(
    pending[0].fields.createdAt.timestampValue,
  );
  expect(accepted[0].fields.status.stringValue).toBe('ready');
  const media = accepted[0].fields.media.arrayValue.values!.map((value) => value.mapValue.fields);
  expect(media.map((item) => item.type.stringValue)).toEqual(['image', 'video', 'file']);
  expect(imageStarts).toBe(1);
  const id = accepted[0].name.split('/').pop();
  const second = await browser.newContext();
  try {
    const bob = await second.newPage();
    await prepareOnboardingState(bob);
    await loginWithSeedUser(bob, 'bob');
    await bob.goto(`/post/${id}?comments=1`);
    await expect(bob.getByRole('heading', { name: title }).first()).toBeVisible({ timeout: 15000 });
    const modal = bob.getByRole('dialog', { name: 'Comentarios de la publicación' });
    await expect(modal).toBeVisible();
    const bounds = (await modal.boundingBox())!;
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(bob.viewportSize()!.height);
    const image = modal.locator('img[alt="Adjunto"]');
    await expect
      .poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBeGreaterThan(0);
    await expect
      .poll(() => modal.locator('video').evaluate((node: HTMLVideoElement) => node.readyState))
      .toBeGreaterThanOrEqual(1);
    const player = modal.locator('video');
    await player.evaluate(async (node: HTMLVideoElement) => {
      node.muted = true;
      await node.play();
    });
    await expect
      .poll(() => player.evaluate((node: HTMLVideoElement) => node.currentTime))
      .toBeGreaterThan(0);
    await player.evaluate((node: HTMLVideoElement) => node.pause());
    await expect(modal.getByRole('link', { name: /notes.pdf/ })).toHaveAttribute(
      'href',
      media[2].url.stringValue,
    );
    const downloaded = await bob.request.get(media[2].url.stringValue);
    expect(downloaded.ok()).toBe(true);
    expect(await downloaded.body()).toEqual(document.buffer);
    const screenshot = info.outputPath('post-media-after-retry.png');
    await bob.screenshot({ path: screenshot });
    await info.attach('post-media-after-retry', { path: screenshot, contentType: 'image/png' });
  } finally {
    await second.close();
  }
});
