const { test, expect } = require('playwright/test');

test('un presupuesto puede generar PDF sin depender del stock', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.addInitScript(() => {
    window.__rebuPrintCalls = 0;
    window.print = () => {
      window.__rebuPrintCalls += 1;
    };
  });

  await page.goto('http://127.0.0.1:5174/?demo=1', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Caja/i }).click();
  await page.locator('input[type="password"]').fill('4321');
  await page.getByRole('button', { name: /^Ingresar$/i }).click();
  await expect(page.getByText('Modo demo local', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: /^Pedidos$/i }).click();
  await page.getByRole('button', { name: /Nuevo presupuesto/i }).click();

  const modal = page.locator('.budget-builder-modal');
  await modal.getByLabel('Nombre').fill('Prueba PDF sin stock');
  await modal.getByLabel('Telefono').fill('111111');
  await modal.getByLabel('Nota').fill('El PDF no debe depender del inventario');
  await modal.getByRole('button', { name: /Item manual/i }).click();

  const manualRow = modal.locator('.budget-builder-item-row').last();
  await manualRow.getByLabel('Articulo').fill('Artículo sin stock');
  await manualRow.getByLabel('Precio/u').fill('1500');
  await modal.getByRole('button', { name: /Guardar presupuesto/i }).click();

  await expect(page.getByText('Prueba PDF sin stock', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: /Entendido/i }).click();
  await page.getByRole('button', { name: /Generar PDF/i }).click();
  await expect.poll(() => page.evaluate(() => window.__rebuPrintCalls)).toBe(1);
  expect(pageErrors).toEqual([]);
});
