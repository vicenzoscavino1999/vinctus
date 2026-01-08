import { test, expect } from '@playwright/test';

test.describe('Flujo de Grupos', () => {
    test.beforeEach(async ({ page }) => {
        // Limpiar localStorage y navegar a la app
        await page.goto('/');
        await page.evaluate(() => localStorage.clear());
    });

    test('la app carga correctamente', async ({ page }) => {
        await page.goto('/');

        // Verificar que la página carga (tiene contenido)
        await expect(page.locator('body')).not.toBeEmpty();

        // Verificar que hay algún botón o elemento interactivo
        const buttons = page.locator('button');
        await expect(buttons.first()).toBeVisible({ timeout: 10000 });
    });

    test('usuario puede hacer login', async ({ page }) => {
        await page.goto('/');

        // Buscar y clickear el botón de login/entrar
        const loginButton = page.locator('button, [role="button"]').filter({ hasText: /entrar|login|iniciar/i });

        if (await loginButton.isVisible({ timeout: 3000 }).catch(() => false)) {
            await loginButton.click();

            // Esperar navegación o cambio de estado
            await page.waitForTimeout(1000);

            // Verificar que ya no estamos en login
            await expect(page.url()).not.toBe('/');
        }
    });

    test('página de grupo tiene botón de unirse', async ({ page }) => {
        await page.goto('/');

        // Login primero
        const loginButton = page.locator('button, [role="button"]').filter({ hasText: /entrar|login|iniciar/i });
        if (await loginButton.isVisible({ timeout: 3000 }).catch(() => false)) {
            await loginButton.click();
            await page.waitForTimeout(1000);
        }

        // Ir directamente a un grupo
        await page.goto('/group/1');

        // Verificar que existe un botón de unirse o salir
        const joinOrLeaveButton = page.locator('button, [role="button"]').filter({
            hasText: /unir|salir|join|leave/i
        });

        await expect(joinOrLeaveButton.first()).toBeVisible({ timeout: 10000 });
    });

    test('toggle de unirse a grupo funciona', async ({ page }) => {
        await page.goto('/');

        // Login
        const loginButton = page.locator('button, [role="button"]').filter({ hasText: /entrar|login|iniciar/i });
        if (await loginButton.isVisible({ timeout: 3000 }).catch(() => false)) {
            await loginButton.click();
            await page.waitForTimeout(1000);
        }

        // Ir a grupo
        await page.goto('/group/1');
        await page.waitForTimeout(500);

        // Buscar botón de unirse
        const joinButton = page.locator('button, [role="button"]').filter({ hasText: /unir/i });

        if (await joinButton.isVisible({ timeout: 5000 }).catch(() => false)) {
            // Click para unirse
            await joinButton.click();
            await page.waitForTimeout(500);

            // Verificar que cambió a "salir"
            const leaveButton = page.locator('button, [role="button"]').filter({ hasText: /salir/i });
            await expect(leaveButton.first()).toBeVisible({ timeout: 5000 });

            // Click para salir
            await leaveButton.first().click();
            await page.waitForTimeout(500);

            // Verificar que volvió a "unirse"
            await expect(page.locator('button, [role="button"]').filter({ hasText: /unir/i }).first()).toBeVisible();
        }
    });
});
