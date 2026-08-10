const { test, expect } = require('playwright/test');
const XLSX = require('xlsx');

const appUrl = process.env.REBU_SMOKE_URL || 'http://127.0.0.1:5174/?demo=1';

test('importar Excel consolida, crea y bloquea reaplicaciones', async ({ page }, testInfo) => {
  const workbookPath = testInfo.outputPath('auditoria-importacion.xlsx');
  const worksheet = XLSX.utils.json_to_sheet([
    {
      Codigo: 'AUD-DUP',
      Descripcion: 'Articulo Duplicado Auditoria',
      Categoria: 'Globos',
      Cantidad: 2,
      Precio: '1.800',
      Descuento: 0,
      Costo: '1.800',
      Venta: '3.500',
    },
    {
      Codigo: 'AUD-DUP',
      Descripcion: 'Articulo Duplicado Auditoria',
      Categoria: 'Globos',
      Cantidad: 3,
      Precio: '1.800',
      Descuento: 0,
      Costo: '1.800',
      Venta: '3.500',
    },
    {
      Codigo: 'AUD-NEW',
      Descripcion: 'Pack Globos Metalizados Dorados Especial',
      Categoria: 'Globos',
      Cantidad: 1,
      Precio: '1.800',
      Descuento: 0,
      Costo: '1.800',
      Venta: '3.500',
    },
  ]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Productos');
  XLSX.writeFile(workbook, workbookPath);

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
  await page.getByRole('button', { name: /Importar Excel/i }).click();
  await page.locator('input[type="file"]').setInputFiles(workbookPath);

  const duplicateRow = page.locator('article').filter({ hasText: 'Articulo Duplicado Auditoria' });
  await expect(duplicateRow.getByText('Codigo duplicado en Excel')).toBeVisible();
  await duplicateRow.getByRole('button', { name: 'Sumar filas' }).click();
  await expect(duplicateRow.getByText('Codigo duplicado en Excel')).toHaveCount(0);

  await duplicateRow.click();
  await duplicateRow.locator('.excel-target-list button').first().click();
  await page.getByPlaceholder('Buscar producto principal...').fill('Pack Globos Metalizados Dorados');
  await duplicateRow.locator('.excel-assignment-panel button').filter({ hasText: 'Pack Globos Metalizados Dorados' }).click();
  await expect(duplicateRow.locator('.excel-target-list')).toContainText('5 compra x 1');
  await expect(duplicateRow).toContainText('1.800');
  await expect(duplicateRow).toContainText('3.500');

  await duplicateRow.locator('[title="Confirmar Stock"]').getByRole('button', { name: 'Confirmar' }).click();
  const applyRowButton = duplicateRow.getByRole('button', { name: /^Aplicar$/i });
  await applyRowButton.evaluate((button) => {
    button.click();
    button.click();
  });
  await expect(duplicateRow.getByText('Aplicado', { exact: true })).toBeVisible();
  await expect(applyRowButton).toBeDisabled();
  await expect(duplicateRow).toContainText('55 u.');
  await page.getByRole('button', { name: 'Entendido' }).click();

  const newProductRow = page.locator('article').filter({ hasText: 'Pack Globos Metalizados Dorados Especial' });
  await newProductRow.click();
  await newProductRow.locator('.excel-target-list button').first().click();
  await page.getByPlaceholder('Buscar producto principal...').fill('Pack Globos Metalizados Dorados Especial');
  await page.getByRole('button', { name: /Crear producto nuevo/i }).click();

  await expect(page.getByRole('heading', { name: 'Crear productos nuevos' })).toBeVisible();
  await expect(page.getByText(/Nombre similar/i)).toBeVisible();
  await expect(page.getByText(/Podes vincularlo o crear este producto como uno nuevo/i)).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Costo $' })).toHaveValue('1800');
  await expect(page.getByRole('textbox', { name: 'Venta $' })).toHaveValue('3500');
  await expect(page.getByRole('button', { name: /^Crear producto$/i })).toBeEnabled();

  await page.screenshot({ path: testInfo.outputPath('excel-import-flow.png'), fullPage: true });
  expect(pageErrors).toEqual([]);
});
