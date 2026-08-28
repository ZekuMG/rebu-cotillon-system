const { test, expect } = require('playwright/test');

const appUrl = process.env.REBU_SMOKE_URL || 'http://127.0.0.1:5174/?demo=1';

test('Casa Alberto restaura, cierra y separa el acceso manual de la sesion', async ({ page }) => {
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
  await page.getByRole('button', { name: /Casa Alberto/i }).click();
  await expect(page.getByText('Sesion activa', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: /Cerrar sesion/i }).click();
  await expect(page.getByText('Sesion sin conectar', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: /Acceso manual/i }).click();
  await expect.poll(() => page.evaluate(() => window.__supplierManualOpenCount)).toBe(1);
  await expect(page.getByText('Sesion activa', { exact: true })).toBeVisible({ timeout: 5000 });

  await page.getByRole('button', { name: /Cerrar sesion/i }).click();
  await expect(page.getByText('Sesion sin conectar', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: /Iniciar sesion/i }).click();
  await expect(page.getByText('Sesion activa', { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__supplierManualOpenCount)).toBe(1);

  await page.getByRole('button', { name: /Abrir proveedor/i }).click();
  await expect.poll(() => page.evaluate(() => window.__supplierManualOpenCount)).toBe(2);
  expect(pageErrors).toEqual([]);
});

test('Iniciar sesion configura una vez el acceso cifrado y reintenta automaticamente', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.addInitScript(() => {
    let credentialsConfigured = false;
    let supplierConnected = false;
    window.__supplierCredentialSaveCount = 0;
    window.__supplierConnectCount = 0;
    window.__supplierSavedUsername = '';
    const loginState = () => ({
      hasWindow: true,
      url: supplierConnected
        ? 'https://cotilloncasaalberto.com.ar/pedido/index_restringido.php'
        : 'https://cotilloncasaalberto.com.ar/pedido/login.php',
      isLikelyLoggedIn: supplierConnected,
      hasVisiblePasswordInput: !supplierConnected,
      isLoginText: !supplierConnected,
    });
    window.electronAPI = {
      supplierSessionConnect: async () => {
        window.__supplierConnectCount += 1;
        if (!credentialsConfigured) {
          return {
            success: true,
            credentialsRequired: true,
            manualLoginRequired: true,
            loginState: loginState(),
          };
        }
        supplierConnected = true;
        return {
          success: true,
          verified: true,
          verificationMethod: 'automatic_credentials',
          manualLoginRequired: false,
          loginState: loginState(),
        };
      },
      supplierCredentialsSave: async ({ username, password }) => {
        window.__supplierCredentialSaveCount += 1;
        window.__supplierSavedUsername = username;
        credentialsConfigured = Boolean(username && password);
        return { success: credentialsConfigured, configured: credentialsConfigured };
      },
      supplierSessionLogout: async () => {
        supplierConnected = false;
        return { success: true, loginState: { hasWindow: false, url: '', isLikelyLoggedIn: false } };
      },
      supplierImageLoginState: async () => loginState(),
      supplierImageOpenLogin: async () => ({ success: true, loginState: loginState() }),
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
  await expect(page.getByText('Acceso requerido', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: /Iniciar sesion/i }).click();
  await expect(page.getByRole('heading', { name: /Configurar acceso de Casa Alberto/i })).toBeVisible();
  await page.getByLabel('Usuario').fill('casa-alberto-demo');
  await page.getByLabel('Contraseña').fill('clave-demo-segura');
  await page.getByRole('button', { name: /Guardar e iniciar/i }).click();

  await expect(page.getByText('Sesion activa', { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__supplierCredentialSaveCount)).toBe(1);
  await expect.poll(() => page.evaluate(() => window.__supplierConnectCount)).toBeGreaterThanOrEqual(3);
  await expect.poll(() => page.evaluate(() => window.__supplierSavedUsername)).toBe('casa-alberto-demo');
  expect(pageErrors).toEqual([]);
});
