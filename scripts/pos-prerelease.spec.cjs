const { test, expect } = require('playwright/test');
const appUrl = process.env.REBU_SMOKE_URL || 'http://127.0.0.1:5174/?demo=1';

async function enterDemo(page) {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    return url.protocol.startsWith('http') && !['127.0.0.1', 'localhost'].includes(url.hostname)
      ? route.abort('internetdisconnected') : route.continue();
  });
  await page.goto(appUrl, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Logo de Rebu' }).click({ clickCount: 3, delay: 120 });
  await page.locator('input[type="password"]').fill('1234');
  await page.getByRole('button', { name: /^Ingresar$/i }).click();
  await expect(page.getByText('Modo demo local', { exact: true })).toBeVisible();
}

async function openPos(page) {
  await page.getByRole('button', { name: /Punto de Venta/i }).click();
  if (await page.getByRole('heading', { name: 'Caja Cerrada' }).isVisible()) {
    await page.getByRole('button', { name: 'Abrir Caja', exact: true }).click();
    await page.getByRole('textbox', { name: '0' }).fill('1000');
    await page.getByRole('button', { name: 'Abrir Caja', exact: true }).last().click();
  }
}

async function addCustomWeight(page, title, grams) {
  await page.getByRole('button', { name: /Art[ií]culo Libre/i }).first().click();
  await page.getByRole('button', { name: 'Peso', exact: true }).click();
  const form = page.locator('form').filter({ has: page.getByPlaceholder('Ej: Globo suelto') });
  await form.getByPlaceholder('Ej: Globo suelto').fill(title);
  const inputs = form.locator('input[type="number"]');
  await inputs.nth(0).fill('4000');
  await inputs.nth(1).fill('8063.50');
  await inputs.nth(2).fill(String(grams));
  await form.getByRole('button', { name: 'Agregar al Carrito' }).click();
}

async function chargeGuest(page) {
  await page.locator('.pos-sale-user-picker summary').click();
  await page.getByRole('radio').first().check();
  await page.getByRole('button', { name: 'COBRAR', exact: true }).click();
  await page.getByRole('dialog', { name: '¿Quién hizo la venta?' }).locator('.pos-sale-user-option').first().click();
  await page.getByRole('button', { name: 'No socio', exact: true }).click();
  await page.getByRole('button', { name: 'Continuar como consumidor final', exact: true }).click();
  await page.getByRole('button', { name: 'COBRAR', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Venta exitosa' })).toBeVisible();
  return page.locator('.sale-success-modal');
}

test('la suma de dos pesajes coincide con sus importes en centavos', async ({ page }) => {
  await enterDemo(page);
  await openPos(page);
  await addCustomWeight(page, 'Pesaje A', 333);
  await addCustomWeight(page, 'Pesaje B', 333);
  // Cada pesaje es $2.685,1455 -> $2.685,15, igual que una balanza de dos decimales.
  await expect(page.getByText('Total a Pagar', { exact: true }).locator('..')).toContainText('$5.370,30');
  await page.getByPlaceholder('Ingresar el total en efectivo').fill('6000');
  await expect(page.getByText('Devolucion', { exact: true }).locator('..')).toContainText('$629,70');
  const sale = await chargeGuest(page);
  await expect(sale.getByText('Total', { exact: true }).locator('..')).toContainText('$5.370,30');
});

test('alta y edicion por kilo conservan el precio hasta la venta mixta', async ({ page }) => {
  await enterDemo(page);
  await page.getByRole('button', { name: 'Inventario', exact: true }).click();
  await page.getByRole('button', { name: 'Nuevo producto', exact: true }).click();
  await page.getByRole('button', { name: 'Peso', exact: true }).click();
  const form = page.locator('form').filter({ has: page.getByRole('button', { name: 'Agregar', exact: true }) });
  await form.locator('input[type="text"]').first().fill('Confites control de peso');
  const inputs = form.locator('input[type="number"]');
  await inputs.nth(0).fill('4000');
  await inputs.nth(1).fill('8063.50');
  await inputs.nth(1).blur();
  await expect(inputs.nth(1)).toHaveValue('8063.50');
  await inputs.nth(2).fill('5000');
  await form.getByRole('combobox').selectOption({ index: 1 });
  await form.getByRole('button', { name: 'Agregar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Nuevo Producto' })).toBeHidden();
  await page.getByRole('button', { name: 'Entendido', exact: true }).click();
  await page.getByRole('heading', { name: 'Confites control de peso', exact: true }).first().click();
  await page.getByRole('button', { name: 'Editar Detalles', exact: true }).click();
  const edit = page.locator('form').filter({ has: page.getByRole('button', { name: 'Guardar Cambios', exact: true }) });
  const price = edit.getByText('Precio ($/kg)', { exact: true }).locator('..').locator('input');
  await expect(price).toHaveValue('8063.5');
  await price.fill('8067.50');
  await price.blur();
  await expect(price).toHaveValue('8067.5');
  await edit.getByRole('button', { name: 'Guardar Cambios', exact: true }).click();
  await expect(edit).toBeHidden();
  await page.getByRole('button', { name: 'Entendido', exact: true }).click();

  await openPos(page);
  await page.getByRole('button', { name: /Confites control de peso/ }).first().click();
  const weightModal = page.getByRole('heading', { name: 'Producto por Peso' }).locator('../../..');
  await weightModal.getByPlaceholder('Ej: 105').fill('200');
  await expect(weightModal).toContainText('$1.613,50');
  await weightModal.getByRole('button', { name: /Agregar 200g/ }).click();
  await page.getByRole('button', { name: /Pack Globos Metalizados Dorados/ }).first().click();
  await page.getByRole('checkbox', { name: /Lleva bolsita/i }).click();
  await expect(page.getByText('Total a Pagar', { exact: true }).locator('..')).toContainText('$5.163,50');
  await page.getByPlaceholder('Ingresar el total en efectivo').fill('6000');
  const sale = await chargeGuest(page);
  await expect(sale.getByText('Total', { exact: true }).locator('..')).toContainText('$5.163,50');
  await expect(sale).toContainText('$836,50');
});

test('el carrito por peso admite descuento, bolsa y dos medios de pago', async ({ page }) => {
  await enterDemo(page);
  await openPos(page);
  await addCustomWeight(page, 'Pesaje persistente', 200);
  await page.getByRole('button', { name: /Pack Globos Metalizados Dorados/ }).first().click();
  const total = page.getByText('Total a Pagar', { exact: true }).locator('..');
  await expect(total).toContainText('$5.112,70');
  await expect.poll(() => page.evaluate(() => {
    const snapshot = JSON.parse(localStorage.getItem('party_pos_snapshot_v1'));
    return snapshot?.cart?.find(item => item.title.includes('Pesaje persistente'))?.price;
  })).toBe(8.0635);
  await page.getByRole('button', { name: 'Aplicar descuento manual', exact: true }).click();
  await page.getByRole('button', { name: /^10%/ }).click();
  await page.getByRole('checkbox', { name: /Lleva bolsita/i }).click();
  await expect(total).toContainText('$4.651,70');
  await page.getByRole('button', { name: 'Agregar otro pago', exact: true }).click();
  await page.getByPlaceholder('Monto', { exact: true }).first().fill('2000');
  await expect(page.getByPlaceholder('Monto', { exact: true }).nth(1)).toHaveValue('2651.7');
  const sale = await chargeGuest(page);
  await expect(sale.getByText('Total', { exact: true }).locator('..')).toContainText('$4.651,70');
  await expect(sale).toContainText('Mercado Pago');
  await expect(sale).toContainText('$2.651,70');
  const ticket = sale.locator('.sale-success-ticket-paper');
  await expect(ticket).toContainText('4.651,70');
  await expect(ticket).toContainText('1.612,70');
  await page.emulateMedia({ media: 'print' });
  for (const theme of ['light', 'dark']) {
    await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
    const paper = await page.evaluate(() => ({
      body: getComputedStyle(document.body).backgroundColor,
      root: getComputedStyle(document.querySelector('#root')).backgroundColor,
    }));
    expect(paper).toEqual({ body: 'rgb(255, 255, 255)', root: 'rgb(255, 255, 255)' });
  }
});
