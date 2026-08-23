const { test, expect } = require('playwright/test');

const appUrl = process.env.REBU_SMOKE_URL || 'http://127.0.0.1:5174/?demo=1';

test('un import dinámico caído muestra recuperación sin perder el diagnóstico', async ({ page }) => {
  let moduleAvailable = false;
  await page.route('**/src/views/ModuloTemporalmenteInaccesible.jsx', (route) => {
    if (!moduleAvailable) return route.abort('connectionrefused');
    return route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: 'export default {};',
    });
  });
  await page.goto(appUrl, { waitUntil: 'networkidle' });

  await page.evaluate(() => {
    const message = 'Failed to fetch dynamically imported module: '
      + 'http://127.0.0.1:5174/src/views/ModuloTemporalmenteInaccesible.jsx';
    window.dispatchEvent(new ErrorEvent('error', {
      message,
      error: new TypeError(message),
      filename: 'http://127.0.0.1:5174/node_modules/.vite/deps/chunk-test.js',
      lineno: 1,
      colno: 1,
    }));
  });

  await expect(page.getByRole('heading', { name: 'Se interrumpió la aplicación local' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reintentar ahora' })).toBeVisible();
  await expect(page.getByText(/Los datos ya guardados están protegidos/)).toBeVisible();
  await expect(page.getByText(/Tipo: dynamic-import/)).toBeVisible();

  const reloadPromise = page.waitForEvent('load');
  moduleAvailable = true;
  await reloadPromise;
  await expect(page.getByRole('heading', { name: 'Se interrumpió la aplicación local' })).toHaveCount(0);
});
