const { test, expect } = require('playwright/test');

const appUrl = process.env.REBU_SMOKE_URL || 'http://127.0.0.1:5174/?demo=1';

test('un precio aprobado solo vuelve a pendientes cuando Casa Alberto lo cambia', async ({ page }) => {
  await page.setViewportSize({ width: 1536, height: 900 });
  await page.addInitScript(() => {
    window.__supplierLifecyclePrice = 5000;
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
        supplierCode: 'DEMO-CICLO',
        foundTitle: title || 'Producto ciclo',
        supplierPrice: window.__supplierLifecyclePrice,
        casaAlbertoId: '99002',
        productUrl: 'https://cotilloncasaalberto.com.ar/pedido/detalle.php?idp=99002',
        sourceUrl: 'https://cotilloncasaalberto.com.ar/pedido/detalle.php?idp=99002',
      }),
      supplierOpenUrl: async () => ({ success: true }),
    };
  });

  await page.goto(appUrl, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Logo de Rebu/i }).click({ clickCount: 3, delay: 120 });
  await page.locator('input[type="password"]').fill('1234');
  await page.getByRole('button', { name: /^Ingresar$/i }).click();
  await page.getByRole('button', { name: /Productos \(Avanzado\)/i }).click();
  await page.getByRole('button', { name: /Casa Alberto/i }).click();
  await page.getByRole('button', { name: /^Detectar$/i }).click();
  await expect(page.getByText('Enlaces por confirmar', { exact: true })).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('dialog', { name: 'Deteccion terminada' })).toBeVisible({ timeout: 15000 });
  await page.getByRole('dialog', { name: 'Deteccion terminada' }).getByRole('button', { name: 'OK' }).click();
  await page.getByRole('button', { name: /Guardar enlace/i }).first().click();

  const supplierCards = page.locator('article.supplier-price-virtual-item');
  await expect(supplierCards).toHaveCount(1);
  await page.locator('button').filter({ hasText: 'Aprobar costo y venta' }).first().click();
  await expect(page.getByText('Costos actualizados', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Entendido', exact: true }).click();
  await expect(supplierCards).toHaveCount(0);

  const checkLinked = page.getByRole('button', { name: 'Chequear vinculados', exact: true });
  await checkLinked.click();
  await expect(page.getByText('Chequeo terminado', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /OK|Aceptar|Entendido/i }).click();
  await expect(supplierCards).toHaveCount(0);

  await page.evaluate(() => { window.__supplierLifecyclePrice = 6000; });
  await checkLinked.click();
  await expect(page.getByText('Chequeo terminado', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /OK|Aceptar|Entendido/i }).click();
  await expect(supplierCards).toHaveCount(1);
  await expect(page.getByText(/precio mayor al último aprobado/i)).toBeVisible();
});
