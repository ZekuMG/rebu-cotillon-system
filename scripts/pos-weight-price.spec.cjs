const { test, expect } = require('playwright/test');

const appUrl = process.env.REBU_SMOKE_URL || 'http://127.0.0.1:5174/?demo=1';

test('el precio por kilo conserva pesos y centavos hasta cobrar una venta personalizada', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.protocol.startsWith('http') && !['127.0.0.1', 'localhost'].includes(url.hostname)) {
      return route.abort('internetdisconnected');
    }
    return route.continue();
  });

  await page.goto(appUrl, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Logo de Rebu' }).click({ clickCount: 3, delay: 120 });
  await page.locator('input[type="password"]').fill('1234');
  await page.getByRole('button', { name: /^Ingresar$/i }).click();
  await expect(page.getByText('Modo demo local', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Punto de Venta/i }).click();
  if (await page.getByRole('heading', { name: 'Caja Cerrada' }).isVisible().catch(() => false)) {
    await page.getByRole('button', { name: 'Abrir Caja', exact: true }).click();
    await page.getByRole('textbox', { name: '0' }).fill('1000');
    await page.getByRole('button', { name: 'Abrir Caja', exact: true }).last().click();
  }

  await page.getByRole('button', { name: /Art[ií]culo Libre/i }).first().click();
  await page.getByRole('button', { name: 'Peso', exact: true }).click();
  const form = page.locator('form').filter({ has: page.getByPlaceholder('Ej: Globo suelto') });
  await form.getByPlaceholder('Ej: Globo suelto').fill('Confites por peso');
  const inputs = form.locator('input[type="number"]');
  await inputs.nth(0).fill('4000');
  await inputs.nth(1).fill('8063.50');
  await inputs.nth(1).blur();
  await expect(inputs.nth(1)).toHaveValue('8063.50');
  await inputs.nth(2).fill('200');
  await expect(form.getByText('Total del artículo').locator('..')).toContainText('$1.612,70');
  await form.getByRole('button', { name: 'Agregar al Carrito' }).click();

  const totalRow = page.getByText('Total a Pagar', { exact: true }).locator('..');
  await expect(totalRow).toContainText('$1.612,70');
  // Cambiar los gramos vuelve a calcular el importe sin redondearlo a $10.
  await page.getByRole('button', { name: /200g/ }).click();
  const gramsInput = page.locator('input[type="number"][min="1"]').filter({ visible: true }).first();
  await gramsInput.fill('300');
  await gramsInput.press('Enter');
  await expect(totalRow).toContainText('$2.419,05');
  await page.getByRole('button', { name: /300g/ }).click();
  await gramsInput.fill('1050');
  await gramsInput.press('Enter');
  await expect(page.getByRole('button', { name: /1\.05kg/ })).toBeVisible();
  await expect(totalRow).toContainText('$8.466,68');
  await page.getByRole('button', { name: /1\.05kg/ }).click();
  await gramsInput.fill('300');
  await gramsInput.press('Enter');
  await expect(totalRow).toContainText('$2.419,05');
  await page.getByPlaceholder('Ingresar el total en efectivo').fill('3000');
  await expect(page.getByText('Devolucion', { exact: true }).locator('..')).toContainText('$580,95');
  await page.locator('.pos-sale-user-picker summary').click();
  await page.getByRole('radio').first().check();
  await page.getByRole('button', { name: 'COBRAR', exact: true }).click();
  await page.getByRole('dialog', { name: '¿Quién hizo la venta?' }).locator('.pos-sale-user-option').first().click();
  await page.getByRole('button', { name: 'No socio', exact: true }).click();
  await page.getByRole('button', { name: 'Continuar como consumidor final', exact: true }).click();
  await page.getByRole('button', { name: 'COBRAR', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Venta exitosa' })).toBeVisible();
  const sale = page.locator('.sale-success-modal');
  await expect(sale.getByText('Total', { exact: true }).locator('..')).toContainText('$2.419,05');
  await expect(sale).toContainText('$580,95');
  expect(pageErrors).toEqual([]);
});
