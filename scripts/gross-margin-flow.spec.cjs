const { test, expect } = require('playwright/test');

const appUrl = process.env.REBU_SMOKE_URL || 'http://127.0.0.1:5174/?demo=1';

test('margen real se comparte entre Editor Masivo, Excel y Casa Alberto', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto(appUrl, { waitUntil: 'networkidle' });
  const systemAccess = page.getByRole('button', { name: /Logo de Rebu/i });
  await systemAccess.click();
  await page.waitForTimeout(100);
  await systemAccess.click();
  await page.waitForTimeout(100);
  await systemAccess.click();
  await page.locator('input[type="password"]').fill('1234');
  await page.getByRole('button', { name: /^Ingresar$/i }).click();
  await expect(page.getByText('Modo demo local', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: /Productos \(Avanzado\)/i }).click();
  await expect(page.getByRole('button', { name: 'Editor masivo' })).toBeVisible();

  const productRow = page.locator('tr.bulk-editor-product-row').filter({
    hasText: 'Pack Globos Metalizados Dorados',
  });
  await productRow.locator('td').first().getByRole('button').click();
  await page.locator('aside select').first().selectOption('grossMarginPrice');
  await expect(page.getByText('Margen bruto real').first()).toBeVisible();

  await page.getByRole('button', { name: 'Costo sin IVA' }).click();
  await page.getByRole('button', { name: /Aplicar a 1/i }).click();
  const rowNumberInputs = productRow.locator('input[type="number"]');
  await expect(rowNumberInputs.nth(0)).toHaveValue('1989');
  await expect(rowNumberInputs.nth(1)).toHaveValue('3980');

  await page.getByRole('button', { name: 'IVA ya incluido' }).click();
  await rowNumberInputs.nth(0).fill('2000');
  await page.getByRole('button', { name: '60%' }).click();
  await page.getByRole('button', { name: /Aplicar a 1/i }).click();
  await expect(rowNumberInputs.nth(0)).toHaveValue('2000');
  await expect(rowNumberInputs.nth(1)).toHaveValue('5000');

  await rowNumberInputs.nth(0).fill('680.16');
  await rowNumberInputs.nth(0).blur();
  await expect(rowNumberInputs.nth(0)).toHaveValue('681');
  await rowNumberInputs.nth(1).fill('680.16');
  await rowNumberInputs.nth(1).blur();
  await expect(rowNumberInputs.nth(1)).toHaveValue('690');

  await page.getByRole('button', { name: 'Casa Alberto' }).click();
  await expect(page.getByRole('button', { name: '60%' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText(/IVA 10,5%/).first()).toBeVisible();

  await page.getByRole('button', { name: /Importar Excel/i }).click();
  await expect(page.getByRole('button', { name: '60%' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText(/Costo se interpreta sin IVA/)).toBeVisible();

  const storedPreference = await page.evaluate(() => (
    JSON.parse(window.localStorage.getItem('rebu_gross_margin_pricing_v1'))
  ));
  expect(storedPreference).toEqual({
    marginPercent: 60,
    bulkCostIncludesVat: true,
  });
  expect(pageErrors).toEqual([]);
});
