const { test, expect } = require('playwright/test');

const appUrl = process.env.REBU_SMOKE_URL || 'http://127.0.0.1:5174/?demo=1';

test('Casa Alberto cambia entre unidades y peso dentro del cálculo', async ({ page }, testInfo) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.setViewportSize({ width: 1536, height: 900 });

  await page.addInitScript(() => {
    const connectedState = {
      hasWindow: true,
      url: 'https://cotilloncasaalberto.com.ar/pedido/index_restringido.php',
      isLikelyLoggedIn: true,
      hasVisiblePasswordInput: false,
    };
    window.electronAPI = {
      supplierSessionConnect: async () => ({ success: true, verified: true, loginState: connectedState }),
      supplierImageLoginState: async () => connectedState,
      supplierSessionLogout: async () => ({ success: true, loginState: { isLikelyLoggedIn: false } }),
      supplierImageOpenLogin: async () => ({ success: true, loginState: connectedState }),
      supplierPriceSearch: async ({ title }) => ({
        status: 'found',
        supplierCode: 'DEMO-PESO',
        foundTitle: `${title || 'Producto'} x500g`,
        supplierPrice: 5000,
        casaAlbertoId: '99001',
        productUrl: 'https://cotilloncasaalberto.com.ar/pedido/detalle.php?idp=99001',
        sourceUrl: 'https://cotilloncasaalberto.com.ar/pedido/detalle.php?idp=99001',
      }),
      supplierOpenUrl: async () => ({ success: true }),
    };
  });

  await page.goto(appUrl, { waitUntil: 'networkidle' });
  const systemAccess = page.getByRole('button', { name: /Logo de Rebu/i });
  await systemAccess.click({ clickCount: 3, delay: 120 });
  await page.locator('input[type="password"]').fill('1234');
  await page.getByRole('button', { name: /^Ingresar$/i }).click();

  await page.getByRole('button', { name: /Productos \(Avanzado\)/i }).click();
  await page.getByRole('button', { name: /Casa Alberto/i }).click();
  await page.getByRole('button', { name: /^Detectar$/i }).click();
  await expect(page.getByText('Enlaces por confirmar', { exact: true })).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: /Guardar enlace/i }).first().click();

  const modeSwitch = page.getByRole('group', { name: 'Modo de cálculo' }).first();
  await expect(modeSwitch).toBeVisible();
  const unitsButton = modeSwitch.getByRole('button', { name: 'Unid.', exact: true });
  const weightButton = modeSwitch.getByRole('button', { name: 'Peso', exact: true });
  await weightButton.click();
  await expect(weightButton).toHaveAttribute('aria-pressed', 'true');
  await expect(weightButton).toHaveClass(/bg-sky-400/);
  await expect(unitsButton).not.toHaveClass(/bg-sky-400/);
  await expect(page.getByText('Costo por kg', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('peso del envase', { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/deben estar configurados como venta por peso/i)).toBeVisible();
  await expect(page.locator('button').filter({ hasText: 'Aprobar costo y venta' }).first()).toBeDisabled();

  await page.screenshot({ path: testInfo.outputPath('supplier-weight-switch.png'), fullPage: true });
  expect(pageErrors).toEqual([]);
});
