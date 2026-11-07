const { test, expect } = require('playwright/test');

test('POS exige responsable por venta, lo conserva por carrito y lo muestra en el ticket', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    return url.protocol.startsWith('http') && !['127.0.0.1', 'localhost'].includes(url.hostname)
      ? route.abort('internetdisconnected') : route.continue();
  });
  await page.goto(process.env.REBU_SMOKE_URL || 'http://127.0.0.1:5174/?demo=1', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Logo de Rebu' }).click({ clickCount: 3, delay: 120 });
  await page.locator('input[type="password"]').fill('1234');
  await page.getByRole('button', { name: /^Ingresar$/i }).click();
  await expect(page.getByText('Modo demo local', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Punto de Venta/i }).click();
  if (await page.getByRole('heading', { name: 'Caja Cerrada' }).isVisible()) {
    await page.getByRole('button', { name: 'Abrir Caja', exact: true }).click();
    await page.getByRole('textbox', { name: '0' }).fill('1000');
    await page.getByRole('button', { name: 'Abrir Caja', exact: true }).last().click();
  }
  await page.getByRole('button', { name: /Pack Globos Metalizados Dorados/i }).first().click();
  await page.getByPlaceholder('Ingresar el total en efectivo').fill('4000');
  const charge = page.getByRole('button', { name: 'COBRAR', exact: true });
  await expect(charge).toBeEnabled();
  const employeeDialog = page.getByRole('dialog', { name: '¿Quién hizo la venta?' });
  await charge.click();
  await expect(employeeDialog).toBeVisible();
  await employeeDialog.getByRole('button', { name: 'Volver al carrito', exact: true }).click();
  await expect(employeeDialog).toBeHidden();
  const picker = page.locator('.pos-sale-user-picker');
  await picker.locator('summary').focus();
  await page.keyboard.press('Enter');
  // Select someone other than the demo session user.
  const radio = page.getByRole('radio').last();
  const seller = await radio.locator('..').innerText();
  await radio.check();
  await expect(picker.locator('summary')).toContainText(seller);
  await expect(charge).toBeEnabled();
  await page.getByRole('button', { name: 'Abrir nuevo carrito', exact: true }).click();
  await expect(picker.locator('summary')).toContainText('Elegir usuario de caja');
  await page.getByRole('tab', { name: 'Carrito 1', exact: true }).click();
  await expect(picker.locator('summary')).toContainText(seller);
  await page.getByPlaceholder('Ingresar el total en efectivo').fill('4000');
  await charge.click();
  await expect(employeeDialog).toBeVisible();
  await page.screenshot({ path: 'test-results/pos-sale-user-light.png', fullPage: true });
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await page.screenshot({ path: 'test-results/pos-sale-user-dark.png', fullPage: true });
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  // The choice in the dialog overrides the employee previously set in the cart.
  const chosenEmployee = employeeDialog.locator('.pos-sale-user-option').first();
  const confirmedSeller = await chosenEmployee.innerText();
  await chosenEmployee.click();
  await page.getByRole('button', { name: 'No socio', exact: true }).click();
  await page.getByRole('button', { name: 'Continuar como consumidor final', exact: true }).click();
  await charge.click();
  await expect(page.getByRole('heading', { name: 'Venta exitosa' })).toBeVisible();
  await expect(employeeDialog).toBeHidden();
  await expect(page.locator('.sale-success-modal')).toContainText(confirmedSeller);
  await expect(picker.locator('summary')).toContainText('Elegir usuario de caja');
  expect(errors).toEqual([]);
});
