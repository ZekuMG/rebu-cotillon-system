const { test, expect } = require('playwright/test');
const XLSX = require('xlsx');

const appUrl = process.env.REBU_SMOKE_URL || 'http://127.0.0.1:5174/?demo=1';

test('importador identifica, navega y consolida filas del mismo producto', async ({ page }, testInfo) => {
  test.setTimeout(180000);
  const workbookPath = testInfo.outputPath('compras-mismo-producto.xlsx');
  const worksheet = XLSX.utils.json_to_sheet([
    { Codigo: 'AUD-COMPRA-1', Descripcion: 'Compra de globos uno', Categoria: 'Globos', Cantidad: 2, Precio: 1800, Costo: 1800, Venta: 3500 },
    ...Array.from({ length: 78 }, (_, index) => ({
      Codigo: `AUD-OTRO-${index + 1}`,
      Descripcion: `Otro artículo ${index + 1}`,
      Categoria: 'Globos',
      Cantidad: 1,
      Precio: 1800,
      Costo: 1800,
      Venta: 3500,
    })),
    { Codigo: 'AUD-COMPRA-2', Descripcion: 'Compra de globos dos', Categoria: 'Globos', Cantidad: 3, Precio: 1800, Costo: 1800, Venta: 3500 },
  ]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Productos');
  XLSX.writeFile(workbook, workbookPath);

  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
  const systemAccess = page.getByRole('button', { name: /Logo de Rebu/i });
  for (let index = 0; index < 3; index += 1) {
    await systemAccess.click();
    await page.waitForTimeout(100);
  }
  await page.locator('input[type="password"]').fill('1234');
  await page.getByRole('button', { name: /^Ingresar$/i }).click();
  await expect(page.getByText('Modo demo local', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Productos \(Avanzado\)/i }).click();
  await page.getByRole('button', { name: /Importar Excel/i }).click();
  await page.locator('input[type="file"]').setInputFiles(workbookPath);

  const firstRow = page.locator('article').filter({ hasText: 'Compra de globos uno' });
  const secondRow = page.locator('article').filter({ hasText: 'Compra de globos dos' });
  const lotSearch = page.getByRole('searchbox', { name: 'Buscar en el lote importado' });
  for (const row of [firstRow, secondRow]) {
    if (row === secondRow) await lotSearch.fill('AUD-COMPRA-2');
    await row.click();
    await row.locator('.excel-target-list button').first().click();
    await page.getByPlaceholder('Buscar producto principal...').fill('Pack Globos Metalizados Dorados');
    await row.locator('.excel-assignment-panel button:not(.excel-create-inline)').filter({ hasText: 'Pack Globos Metalizados Dorados' }).click();
    await row.locator('[title="Confirmar Stock"]').getByRole('button', { name: 'Confirmar' }).click();
  }

  const notice = page.getByTestId('excel-product-conflicts');
  await expect(notice).toContainText('Compra de globos uno');
  await expect(notice).toContainText('Compra de globos dos');
  await expect(notice).toContainText('Código Rebu:');
  await expect(notice).toContainText('Stock');
  await expect(page.locator('.excel-result-select select').locator('option[value="conflicts"]')).toContainText('Conflictos (2)');
  await notice.getByRole('button', { name: 'Ir a fila' }).nth(1).click();
  await expect(secondRow).toHaveAttribute('aria-current', 'true');
  await expect(lotSearch).toHaveValue('');

  await secondRow.getByRole('button', { name: 'Excluir' }).click();
  await expect(notice).toHaveCount(0);
  await secondRow.getByRole('button', { name: 'Incluir' }).click();
  await expect(notice).toBeVisible();

  await notice.getByRole('button', { name: 'Consolidar compras' }).click();
  const preview = page.getByTestId('excel-consolidation-preview');
  await preview.getByLabel('Costo final').selectOption({ index: 2 });
  await preview.getByLabel('Venta final').selectOption({ index: 3 });
  await expect(preview).toContainText('Stock aprobado: +5');
  await expect(preview).toContainText('Filas incluidas: 2, 81');
  await preview.getByRole('button', { name: 'Confirmar consolidación' }).click();
  await expect(notice).toHaveCount(0);
  await page.getByRole('button', { name: 'Editor masivo' }).click();
  await page.getByRole('button', { name: /Importar Excel/i }).click();
  await expect(page.getByRole('button', { name: 'Aplicar 1' })).toBeEnabled();
  await page.getByRole('button', { name: 'Aplicar 1' }).click();
  await expect(firstRow.getByText('Aplicado', { exact: true })).toBeVisible();
  const notificationClose = page.getByRole('button', { name: 'Entendido' });
  await notificationClose.click();

  await page.getByRole('button', { name: /Deshacer 1/ }).click();
  await page.getByRole('button', { name: 'Deshacer', exact: true }).click();
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('Fila 81: Compra de globos dos');
  if (await notificationClose.isVisible()) await notificationClose.click();
  await notice.getByRole('button', { name: 'Consolidar compras' }).click();
  await preview.getByLabel('Costo final').selectOption({ index: 2 });
  await preview.getByLabel('Venta final').selectOption({ index: 3 });
  await expect(preview.getByRole('button', { name: 'Confirmar consolidación' })).toBeEnabled();
  await preview.getByRole('button', { name: 'Confirmar consolidación' }).click();
  await page.getByRole('button', { name: 'Aplicar 1' }).click();
  await expect(firstRow.getByText('Aplicado', { exact: true })).toBeVisible();
  await notificationClose.click();

  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('input[type="file"]').setInputFiles(workbookPath);
  await expect(page.locator('.excel-result-select select').locator('option[value="applicable"]')).toContainText('Por aplicar (0)');
  await expect(notice).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});
