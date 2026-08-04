const { test, expect } = require('playwright/test');

const appUrl = process.env.REBU_SMOKE_URL || 'http://127.0.0.1:5174/?demo=1';

test.use({ channel: 'chrome' });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    let listener = null;
    let revision = 1;
    let status = {
      phase: 'available',
      currentVersion: '1.1.2',
      latestVersion: '1.1.19',
      progress: null,
      error: null,
      revision,
      isPackaged: true,
    };

    window.__REBU_UPDATE_TEST_CALLS__ = {
      checks: 0,
      downloads: 0,
      installs: 0,
    };

    const publish = (patch) => {
      revision += 1;
      status = { ...status, ...patch, revision };
      listener?.(status);
    };

    window.electronAPI = {
      getUpdateStatus: async () => ({ ...status }),
      onUpdateStatus: (callback) => {
        listener = callback;
        return () => {
          if (listener === callback) listener = null;
        };
      },
      checkForUpdates: async () => {
        window.__REBU_UPDATE_TEST_CALLS__.checks += 1;
        publish({ phase: 'checking', progress: null, error: null });
        window.setTimeout(() => publish({ phase: 'available' }), 50);
        return { success: true };
      },
      downloadUpdate: async () => {
        window.__REBU_UPDATE_TEST_CALLS__.downloads += 1;
        publish({ phase: 'downloading', progress: 37, error: null });
        window.setTimeout(() => publish({ phase: 'downloaded', progress: 100 }), 120);
        return { success: true };
      },
      installUpdate: async () => {
        window.__REBU_UPDATE_TEST_CALLS__.installs += 1;
        publish({ phase: 'installing' });
        return { success: true };
      },
    };
  });
});

test('avisa junto a la version y requiere descargar e instalar manualmente', async ({ page }, testInfo) => {
  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });

  await expect(page.getByText('Versión', { exact: true })).toBeVisible();
  await expect(page.getByText('v1.1.2', { exact: true })).toBeVisible();
  const availableButton = page.getByRole('button', { name: /Nueva versión v1\.1\.19/i });
  await expect(availableButton).toBeVisible();

  expect(await page.evaluate(() => window.__REBU_UPDATE_TEST_CALLS__)).toEqual({
    checks: 0,
    downloads: 0,
    installs: 0,
  });

  await availableButton.click();
  await expect(page.getByText('Descargando 37%', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Reiniciar y actualizar/i })).toBeVisible();

  expect(await page.evaluate(() => window.__REBU_UPDATE_TEST_CALLS__)).toEqual({
    checks: 0,
    downloads: 1,
    installs: 0,
  });

  await page.screenshot({
    path: testInfo.outputPath('actualizacion-lista.png'),
    fullPage: true,
  });

  await page.getByRole('button', { name: /Reiniciar y actualizar/i }).click();
  await expect(page.getByText('Reiniciando', { exact: true })).toBeVisible();

  expect(await page.evaluate(() => window.__REBU_UPDATE_TEST_CALLS__)).toEqual({
    checks: 0,
    downloads: 1,
    installs: 1,
  });
});

test('el aviso conserva contraste en el tema oscuro del ingreso', async ({ page }, testInfo) => {
  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /Cambiar a tema oscuro/i }).click();

  const updateButton = page.getByRole('button', { name: /Nueva versión v1\.1\.19/i });
  await expect(updateButton).toBeVisible();

  await expect(updateButton).toHaveClass(/app-update-status/);
  await expect(updateButton).toHaveClass(/is-available/);

  const warningTokens = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    return {
      color: style.getPropertyValue('--rebu-warning').trim(),
      background: style.getPropertyValue('--rebu-warning-bg').trim(),
      border: style.getPropertyValue('--rebu-warning-border').trim(),
    };
  });

  expect(warningTokens).toEqual({
    color: '#fbbf24',
    background: 'rgba(180, 83, 9, 0.24)',
    border: 'rgba(251, 191, 36, 0.42)',
  });

  await page.mouse.move(640, 360);

  await page.screenshot({
    path: testInfo.outputPath('actualizacion-disponible-oscuro.png'),
    fullPage: true,
  });
});
