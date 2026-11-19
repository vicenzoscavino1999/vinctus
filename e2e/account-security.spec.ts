import { expect, test } from '@playwright/test';
import {
  loginWithSeedUser,
  prepareOnboardingState,
  waitForAuthenticatedShell,
} from './helpers/session';

test.describe('Account and security flows', () => {
  test.beforeEach(async ({ page }) => {
    await prepareOnboardingState(page);
  });

  test('@smoke handles invalid login and non-enumerating password recovery cleanly', async ({
    page,
  }) => {
    await page.goto('/');

    await page.locator('input[type="email"]').fill('alice@vinctus.local');
    await page.locator('input[type="password"]').fill('wrong-password-123');
    await page
      .locator('form')
      .getByRole('button', { name: /Entrar/i })
      .click();

    await expect(page.getByText(/Credenciales invalidas|Contrasena incorrecta/i)).toBeVisible({
      timeout: 15000,
    });

    await page.getByRole('button', { name: /Olvidaste tu contrase/i }).click();
    const resetEmailInput = page.getByPlaceholder(/Correo electr/i);
    await resetEmailInput.fill('no-existe-e2e@vinctus.local');

    const sendButton = page.getByRole('button', { name: /Enviar Correo/i });
    await sendButton.click();

    await expect(page.getByText(/Si el correo existe, recibir/i)).toBeVisible({ timeout: 15000 });
    await expect(sendButton).toBeDisabled();

    // Editing email clears the success lock so the user can retry with another email.
    await resetEmailInput.fill('alice@vinctus.local');
    await expect(sendButton).toBeEnabled();
  });

  test('@smoke reports and blocks from profile, unblocks from Privacy & Security, and persists private account toggle', async ({
    page,
  }) => {
    test.setTimeout(60000);
    await loginWithSeedUser(page, 'alice');
    await waitForAuthenticatedShell(page);

    // Visit Carla's profile
    await page.goto('/user/user_c');
    await expect(page.getByRole('heading', { name: /Carla R\./i })).toBeVisible({ timeout: 15000 });

    // Report Carla from profile
    await page.getByRole('button', { name: 'Reportar usuario' }).click();
    await expect(page.getByRole('heading', { name: /Reportar usuario/i })).toBeVisible();
    await page.getByPlaceholder(/Describe el motivo del reporte/i).fill('Prueba E2E de reporte');
    await page.getByRole('button', { name: 'Enviar reporte' }).click();
    await expect(page.getByText('Reporte enviado')).toBeVisible({ timeout: 15000 });

    // Block Carla from profile
    await page.getByRole('button', { name: 'Bloquear usuario' }).click();
    await expect(page.getByRole('heading', { name: 'Bloquear usuario' })).toBeVisible();
    await page.getByRole('button', { name: 'Confirmar bloqueo' }).click();

    await expect(page.getByText('Has bloqueado a este usuario')).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: 'Desbloquear usuario' })).toBeVisible();

    // Open Settings > Privacidad y seguridad and unblock Carla from Usuarios bloqueados
    await page.goto('/settings/privacy');
    await expect(page.getByRole('heading', { name: /Privacidad y seguridad/i })).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText('Carla R.')).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: 'Desbloquear' }).click();
    await expect(page.getByText('No has bloqueado a nadie.')).toBeVisible({ timeout: 15000 });

    // Toggle Cuenta privada ON -> reload -> confirm persisted -> toggle back OFF
    const privateSwitch = page.getByRole('switch', { name: /Cuenta privada/i });
    await expect(privateSwitch).toHaveAttribute('aria-checked', 'false', { timeout: 10000 });
    await privateSwitch.click();
    await expect(privateSwitch).toHaveAttribute('aria-checked', 'true');
    await expect(privateSwitch).toBeEnabled({ timeout: 10000 });

    await page.reload();
    const reloadedSwitch = page.getByRole('switch', { name: /Cuenta privada/i });
    await expect(reloadedSwitch).toHaveAttribute('aria-checked', 'true', { timeout: 15000 });

    // Restore public visibility for clean state
    await reloadedSwitch.click();
    await expect(reloadedSwitch).toHaveAttribute('aria-checked', 'false');
    await expect(reloadedSwitch).toBeEnabled({ timeout: 10000 });
  });

  test('@smoke registers an ephemeral user and submits account deletion with ELIMINAR confirmation', async ({
    page,
  }) => {
    test.setTimeout(60000);
    const email = `e2e-del-${Date.now()}@vinctus.local`;
    await page.goto('/');

    await page.getByRole('button', { name: /^Registro$/i }).click();
    await page.getByPlaceholder(/Nombre \(opcional\)/i).fill('Usuario Efimero');
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill('password123');
    await page.getByRole('button', { name: /Crear Cuenta/i }).click();

    await waitForAuthenticatedShell(page);

    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: /Configuraci/i })).toBeVisible({
      timeout: 15000,
    });
    await page.getByRole('button', { name: /Eliminar cuenta/i }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Sin solicitud')).toBeVisible({ timeout: 15000 });

    const submitButton = dialog.getByRole('button', { name: /Solicitar eliminaci/i });
    await expect(submitButton).toBeDisabled();

    await dialog.getByPlaceholder('Escribe ELIMINAR').fill('ELIMINAR');
    await expect(submitButton).toBeEnabled();
    await submitButton.click();

    await expect(
      dialog.getByText(/Solicitud en cola|Borrando cuenta|Cuenta eliminada/i),
    ).toBeVisible({ timeout: 15000 });
  });
});
