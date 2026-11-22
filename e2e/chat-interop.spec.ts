import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { waitForGroupDetailReady } from './helpers/group';
import { loginWithSeedUser, prepareOnboardingState } from './helpers/session';

const fixtures = 'ios-native/VinctusNative/Tests/Fixtures/';
const contract = JSON.parse(readFileSync(`${fixtures}chat-interop.json`, 'utf8'));
const audio = {
  name: 'web-native.wav',
  mimeType: 'audio/wav',
  buffer: Buffer.from(contract.webVoiceWavBase64, 'base64'),
};
const video = {
  name: 'web-native.mp4',
  mimeType: 'video/mp4',
  buffer: readFileSync(`${fixtures}chat-video.mp4`),
};
const photo = {
  name: 'web-native.png',
  mimeType: 'image/png',
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQ0AAAAASUVORK5CYII=',
    'base64',
  ),
};

test.use({
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
  permissions: ['microphone'],
});

test.describe('Web/native conversation interoperability', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(60000);
  test.beforeEach(async ({ page }) => {
    await prepareOnboardingState(page);
    await loginWithSeedUser(page, 'alice');
  });

  test('sends real photo/video/audio files and another account receives playable media', async ({
    page,
    browser,
  }, info) => {
    await page.goto('/messages?conversation=dm_user_a_user_b');
    await expect(page.getByRole('textbox', { name: 'Mensaje', exact: true })).toBeVisible({
      timeout: 20000,
    });
    await page.getByLabel('Seleccionar adjuntos').setInputFiles([photo, video, audio]);
    const caption = `Medios entre plataformas ${Date.now()}`;
    await page.getByRole('textbox', { name: 'Mensaje', exact: true }).fill(caption);
    await page.getByRole('button', { name: 'Enviar mensaje', exact: true }).click();
    const thread = page.getByRole('log');
    await expect(thread.getByText(caption, { exact: true })).toBeVisible({ timeout: 20000 });
    const sent = thread.locator('[data-message-id]').filter({ hasText: caption });
    await expect(sent.getByRole('img', { name: photo.name })).toBeVisible();
    await expect
      .poll(() =>
        sent
          .getByRole('img', { name: photo.name })
          .evaluate((node: HTMLImageElement) => node.naturalWidth),
      )
      .toBe(1);
    await expect
      .poll(() => sent.locator('video').evaluate((node) => node.readyState))
      .toBeGreaterThanOrEqual(1);
    await expect
      .poll(() => sent.locator('audio').evaluate((node) => node.readyState))
      .toBeGreaterThanOrEqual(1);
    await expect(page.getByLabel('Archivos pendientes')).toHaveCount(0);
    const second = await browser.newContext();
    try {
      const bob = await second.newPage();
      await prepareOnboardingState(bob);
      await loginWithSeedUser(bob, 'bob');
      await bob.goto('/messages?conversation=dm_user_a_user_b');
      await expect(bob.getByRole('log').getByText(caption, { exact: true })).toBeVisible({
        timeout: 15000,
      });
      await expect
        .poll(() =>
          bob
            .getByRole('log')
            .locator('[data-message-id]')
            .filter({ hasText: caption })
            .locator('audio')
            .evaluate((node) => node.readyState),
        )
        .toBeGreaterThanOrEqual(1);
      await bob.getByLabel('Seleccionar adjuntos').setInputFiles(audio);
      const reply = `Respuesta con audio ${Date.now()}`;
      await bob.getByRole('textbox', { name: 'Mensaje', exact: true }).fill(reply);
      await bob.getByRole('button', { name: 'Enviar mensaje', exact: true }).click();
      await expect(thread.getByText(reply, { exact: true })).toBeVisible({ timeout: 20000 });
      await info.attach('chat-web-media', {
        body: await page.screenshot(),
        contentType: 'image/png',
      });
    } finally {
      await second.close();
    }
  });

  test('records microphone audio, prepares WAV and sends it without text', async ({
    page,
  }, info) => {
    await page.goto('/messages?conversation=dm_user_a_user_b');
    await expect(page.getByRole('log').locator('[data-message-id]').first()).toBeVisible({
      timeout: 20000,
    });
    const before = await page
      .getByRole('log')
      .getByRole('link', { name: 'Abrir Nota de voz.wav', exact: true })
      .count();
    await page.getByRole('button', { name: 'Grabar nota de voz', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Terminar grabación' })).toBeVisible();
    await page.waitForTimeout(1800); // Obtain a complete real MediaRecorder chunk before stopping.
    await page.getByRole('button', { name: 'Terminar grabación' }).click();
    await expect(page.getByRole('button', { name: 'Quitar Nota de voz.wav' })).toBeVisible({
      timeout: 15000,
    });
    await page.getByRole('button', { name: 'Enviar mensaje', exact: true }).click();
    const thread = page.getByRole('log');
    await expect(
      thread.getByRole('link', { name: 'Abrir Nota de voz.wav', exact: true }),
    ).toHaveCount(before + 1, { timeout: 20000 });
    const player = thread.getByLabel('Audio: Nota de voz.wav').last();
    await expect
      .poll(() => player.evaluate((node: HTMLAudioElement) => node.duration))
      .toBeGreaterThan(0);
    await info.attach('chat-web-recorded-audio', {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
  });

  test('keeps a newer draft after a failed send and retries without duplicate messages', async ({
    page,
    context,
  }) => {
    test.setTimeout(60000);
    await page.goto('/messages?conversation=dm_user_a_user_b');
    const input = page.getByRole('textbox', { name: 'Mensaje', exact: true });
    await expect(input).toBeVisible({ timeout: 20000 });
    await context.setOffline(true);
    const text = `Reintento sin duplicar ${Date.now()}`;
    await input.fill(text);
    await input.press('Enter');
    await input.fill('Este borrador nuevo debe conservarse');
    await expect(page.getByRole('button', { name: 'Reintentar envío' })).toBeVisible({
      timeout: 22000,
    });
    await expect(input).toHaveValue('Este borrador nuevo debe conservarse');
    await context.setOffline(false);
    await page.getByRole('button', { name: 'Reintentar envío' }).click();
    await expect(page.getByRole('log').getByText(text, { exact: true })).toHaveCount(1, {
      timeout: 20000,
    });
    await expect(page.getByRole('button', { name: 'Reintentar envío' })).toHaveCount(0, {
      timeout: 15000,
    });
    await expect(input).toHaveValue('Este borrador nuevo debe conservarse');
    await page.getByRole('button', { name: 'Volver a conversaciones' }).click();
    await page.getByText(text, { exact: true }).click();
    await expect(input).toHaveValue('Este borrador nuevo debe conservarse');
  });

  test('loads history beyond fifty messages with identical timestamps without losing rows', async ({
    page,
    request,
  }) => {
    await page.goto('/group/1');
    await waitForGroupDetailReady(page, /Mecanica Cuantica/i, 30000);
    await page.getByRole('button', { name: /^Chat$/i }).click();
    await expect(page).toHaveURL(/conversation=grp_1/);
    const project = process.env.FIREBASE_PROJECT_ID || 'vinctus-dev';
    const now = Date.now();
    const writes = Array.from({ length: 105 }, (_, index) => ({
      update: {
        name: `projects/${project}/databases/(default)/documents/conversations/grp_1/messages/history-${String(index + 1).padStart(3, '0')}`,
        fields: {
          senderId: { stringValue: 'user_a' },
          text: { stringValue: `Historia común ${index + 1}` },
          clientId: { stringValue: `history-${String(index + 1).padStart(3, '0')}` },
          clientCreatedAt: { integerValue: String(now) },
          createdAt: { timestampValue: new Date(now).toISOString() },
        },
      },
    }));
    const response = await request.post(
      `http://127.0.0.1:8080/v1/projects/${project}/databases/(default)/documents:commit`,
      {
        headers: { Authorization: 'Bearer owner' },
        data: { writes },
      },
    );
    expect(response.ok()).toBeTruthy();
    const thread = page.getByRole('log');
    await expect(thread.getByText('Historia común 105', { exact: true })).toBeVisible({
      timeout: 15000,
    });
    const older = page.getByRole('button', { name: 'Cargar mensajes anteriores' });
    await older.click();
    await expect(thread.getByText('Historia común 6', { exact: true })).toHaveCount(1);
    await older.click();
    await expect(thread.getByText('Historia común 1', { exact: true })).toHaveCount(1);
    await expect(thread.locator('[data-message-id^="history-"]')).toHaveCount(105);
  });
});
