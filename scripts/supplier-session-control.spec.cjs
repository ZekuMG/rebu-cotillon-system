const { test, expect } = require('playwright/test');

const appUrl = process.env.REBU_SMOKE_URL || 'http://127.0.0.1:5174/?demo=1';

test('Control de costos restaura, cierra y separa el acceso manual de la sesion', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.addInitScript(() => {
    let supplierConnected = true;
    window.__supplierManualOpenCount = 0;
    window.__supplierVerifyCount = 0;
    const loginState = () => ({
      hasWindow: true,
      url: supplierConnected
        ? 'http://cotilloncasaalberto.com.ar/pedido/index_restringido.php'
        : 'http://cotilloncasaalberto.com.ar/pedido/login.php',
      isLikelyLoggedIn: supplierConnected,
      hasVisiblePasswordInput: !supplierConnected,
    });
    window.electronAPI = {
      supplierSessionConnect: async () => {
        supplierConnected = true;
        return {
          success: true,
          verified: true,
          verificationMethod: 'restricted_page',
          manualLoginRequired: false,
          loginState: loginState(),
        };
      },
      supplierSessionVerify: async () => {
        window.__supplierVerifyCount += 1;
        return {
          success: true,
          verified: true,
          verificationMethod: 'restricted_page',
          manualLoginRequired: !supplierConnected,
          loginState: loginState(),
        };
      },
      supplierSessionLogout: async () => {
        supplierConnected = false;
        return { success: true, loginState: { hasWindow: false, url: '', isLikelyLoggedIn: false } };
      },
      supplierImageLoginState: async () => loginState(),
      supplierImageOpenLogin: async () => {
        window.__supplierManualOpenCount += 1;
        window.setTimeout(() => {
          supplierConnected = true;
        }, 100);
        return {
          success: true,
          verified: true,
          verificationMethod: 'restricted_page',
          manualLoginRequired: !supplierConnected,
          loginState: loginState(),
        };
      },
    };
  });

  await page.goto(appUrl, { waitUntil: 'networkidle' });
  const systemAccess = page.getByRole('button', { name: /Logo de Rebu/i });
  await systemAccess.click({ clickCount: 3, delay: 120 });
  await page.locator('input[type="password"]').fill('1234');
  await page.getByRole('button', { name: /^Ingresar$/i }).click();
  await expect(page.getByText('Modo demo local', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: /Productos \(Avanzado\)/i }).click();
  await page.getByRole('button', { name: /Control de costos/i }).click();
  await expect(page.getByText('Login verificado', { exact: true })).toBeVisible();
  await expect(page.getByText(/Pagina restringida comprobada a las/i)).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__supplierVerifyCount)).toBeGreaterThanOrEqual(1);

  await page.getByRole('button', { name: /Comprobar acceso real/i }).click();
  await expect.poll(() => page.evaluate(() => window.__supplierVerifyCount)).toBeGreaterThanOrEqual(2);

  await page.getByRole('button', { name: /Cerrar sesion/i }).click();
  await expect(page.getByText('Sesion sin conectar', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: /Acceso manual/i }).click();
  await expect.poll(() => page.evaluate(() => window.__supplierManualOpenCount)).toBe(1);
  await expect(page.getByText('Login verificado', { exact: true })).toBeVisible({ timeout: 5000 });

  await page.getByRole('button', { name: /Cerrar sesion/i }).click();
  await expect(page.getByText('Sesion sin conectar', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: /Iniciar sesion/i }).click();
  await expect(page.getByText('Login verificado', { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__supplierManualOpenCount)).toBe(1);

  await page.getByRole('button', { name: /Abrir proveedor/i }).click();
  await expect.poll(() => page.evaluate(() => window.__supplierManualOpenCount)).toBe(2);
  expect(pageErrors).toEqual([]);
});
