import { test, expect } from '@playwright/test';

test.describe('Flujo de Grupos', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.evaluate(() => localStorage.clear());
    });

    test('la app carga correctamente', async ({ page }) => {
        await page.goto('/');

        // Verificar que la página carga
        await expect(page.locator('body')).not.toBeEmpty();

        // Verificar que hay botones
        const buttons = page.locator('button');
        await expect(buttons.first()).toBeVisible({ timeout: 10000 });
    });

    test('toggle unirse/salir de grupo funciona', async ({ page }) => {
        // Simular usuario autenticado
        await page.goto('/');
        await page.evaluate(() => {
            localStorage.setItem('vinctus_authenticated', 'true');
            localStorage.setItem('vinctus_onboarding_complete', 'true');
        });
        await page.reload();
        await page.waitForTimeout(500);

        // Ir a grupo
        await page.goto('/group/1');
        await page.waitForTimeout(1000);

        // Buscar boton de unirse
        const joinButton = page.locator('button').filter({ hasText: /Unirme al grupo/i });

        if (await joinButton.isVisible({ timeout: 3000 }).catch(() => false)) {
            // Click para unirse
            await joinButton.click();
            await page.waitForTimeout(500);

            // Verificar que cambio a "Unido"
            const joinedButton = page.locator('button').filter({ hasText: /Unido/i });
            await expect(joinedButton).toBeVisible({ timeout: 3000 });

            // Click para salir
            await joinedButton.click();
            await page.waitForTimeout(500);

            // Verificar que volvio a "Unirme"
            await expect(page.locator('button').filter({ hasText: /Unirme al grupo/i })).toBeVisible();
        } else {
            // Si ya esta unido, verificar que podemos salir
            const joinedButton = page.locator('button').filter({ hasText: /Unido/i });
            if (await joinedButton.isVisible({ timeout: 2000 }).catch(() => false)) {
                await joinedButton.click();
                await page.waitForTimeout(500);
                await expect(page.locator('button').filter({ hasText: /Unirme al grupo/i })).toBeVisible();
            }
        }
    });
});
