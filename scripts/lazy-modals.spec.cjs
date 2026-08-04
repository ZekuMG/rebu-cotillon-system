const { test, expect } = require('playwright/test');

test('los modales diferidos se descargan al abrirlos', async ({ page }) => {
  const loadedScripts = [];
  const pageErrors = [];
  page.on('response', (response) => {
    const url = response.url();
    if (/\/assets\/[^/]+\.js(?:\?|$)/.test(url)) loadedScripts.push(url);
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('http://127.0.0.1:5173/?demo=1', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Caja/i }).click();
  await page.locator('input[type="password"]').fill('4321');
  await page.getByRole('button', { name: /^Ingresar$/i }).click();
  await expect(page.getByText('Modo demo local', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: /Punto de Venta/i }).click();
  if (await page.getByRole('heading', { name: 'Caja Cerrada' }).isVisible().catch(() => false)) {
    await page.getByRole('button', { name: 'Abrir Caja', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Cancelar', exact: true })).toBeVisible();
    await expect.poll(() => loadedScripts.some((url) => /CashModals(?:-|\.jsx)/.test(url))).toBe(true);
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  }

  await page.getByRole('button', { name: /Inventario/i }).click();
  await page.getByRole('button', { name: /^Nuevo$/i }).click();
  await expect(page.getByRole('heading', { name: 'Nuevo Producto' })).toBeVisible();
  await expect.poll(() => loadedScripts.some((url) => /ProductModals(?:-|\.jsx)/.test(url))).toBe(true);

  expect(pageErrors).toEqual([]);
});
