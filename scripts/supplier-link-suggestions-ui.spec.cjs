const { test, expect } = require('playwright/test');

const appUrl = process.env.REBU_SMOKE_URL || 'http://127.0.0.1:5174/?demo=1';

test('enlaces sugeridos se leen como una comparacion continua y conservan sus acciones', async ({ page }, testInfo) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.setViewportSize({ width: 1536, height: 864 });

  await page.addInitScript(() => {
    let resultCounter = 0;
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
      supplierPriceSearch: async ({ supplierCode, title }) => {
        resultCounter += 1;
        const digits = String(supplierCode || '').replace(/\D/g, '');
        const correctedCode = digits.length > 1 ? digits.slice(0, -1) : `CA${resultCounter}`;
        return {
          status: 'found',
          supplierCode: correctedCode,
          foundTitle: `${title || 'Producto'} · Casa Alberto`,
          supplierPrice: 4100 + (resultCounter * 275),
          unitDivisor: resultCounter % 2 === 0 ? 2 : 1,
          casaAlbertoId: String(93000 + resultCounter),
          productUrl: `https://cotilloncasaalberto.com.ar/pedido/producto.php?id=${93000 + resultCounter}`,
          sourceUrl: `https://cotilloncasaalberto.com.ar/pedido/producto.php?id=${93000 + resultCounter}`,
        };
      },
      supplierOpenUrl: async () => ({ success: true }),
    };
  });

  await page.goto(appUrl, { waitUntil: 'networkidle' });
  const systemAccess = page.getByRole('button', { name: /Logo de Rebu/i });
  await systemAccess.click({ clickCount: 3, delay: 120 });
  await page.locator('input[type="password"]').fill('1234');
  await page.getByRole('button', { name: /^Ingresar$/i }).click();
  await expect(page.getByText('Modo demo local', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: /Productos \(Avanzado\)/i }).click();
  await page.getByRole('button', { name: /Casa Alberto/i }).click();
  await page.getByRole('button', { name: /^Detectar$/i }).click();

  const suggestions = page.getByText('Enlaces por confirmar', { exact: true });
  await expect(suggestions).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/por revisar$/i)).toBeVisible();
  await expect(page.getByText('Producto Rebu', { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/Codigo corregido|Nombre parecido/i).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Guardar enlace/i }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Descartar enlace sugerido/i }).first()).toBeVisible();

  await page.screenshot({ path: testInfo.outputPath('supplier-link-suggestions-redesign.png'), fullPage: true });
  expect(pageErrors).toEqual([]);
});
