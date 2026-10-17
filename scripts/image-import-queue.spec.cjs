const { test, expect } = require('playwright/test');

const appUrl = process.env.REBU_SMOKE_URL || 'http://127.0.0.1:5174/?demo=1';
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test('fotos de Casa Alberto: busca primero los más nuevos, filtra y aprueba solo las seguras', async ({ page }, testInfo) => {
  test.setTimeout(180000);
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

  // Casa Alberto simulado: la app de escritorio no existe en el navegador de pruebas.
  await page.evaluate((png) => {
    window.__searchedImages = [];
    window.electronAPI = {
      ...(window.electronAPI || {}),
      supplierImageSearch: async (request) => {
        window.__searchedImages.push(request);
        const candidate = (matchQuality, titleSimilarity) => ({
          foundTitle: `Alberto ${request.title}`,
          imageUrl: `https://cotilloncasaalberto.com.ar/imagen/producto/grande/${window.__searchedImages.length}.jpg`,
          imageDataUrl: png,
          matchQuality,
          titleSimilarity,
          supplierCode: matchQuality === 'barcode_exact' ? '7790001' : '',
        });
        if (request.title.includes('Peluca')) {
          return { status: 'found', matchQuality: 'barcode_exact', candidates: [candidate('barcode_exact', 0)] };
        }
        if (request.title.includes('Antifaz')) {
          return { status: 'found', matchQuality: 'casa_alberto_link', fallbackSearch: 'casa_alberto_link', candidates: [candidate('casa_alberto_link', 90)] };
        }
        return { status: 'found', matchQuality: 'title_similarity', candidates: [candidate('title_similarity', 70)] };
      },
    };
  }, PNG);

  await page.getByRole('button', { name: 'Buscar fotos', exact: true }).click();
  const filters = page.getByTestId('image-import-queue-filters');
  await expect(filters).toBeVisible();
  await expect(filters.getByLabel('Orden')).toHaveValue('newest');
  await expect(page.getByTestId('image-import-pending-matching')).toHaveText('10 pendiente(s) en el lote');
  await page.screenshot({ path: testInfo.outputPath('fotos-filtros.png') });

  await filters.getByRole('button', { name: /^Todas$/ }).click();
  await filters.getByRole('menuitemcheckbox', { name: /Disfraces/ }).click();
  await expect(page.getByTestId('image-import-pending-matching')).toHaveText('2 pendiente(s) con estos filtros');
  await filters.getByRole('button', { name: /Disfraces/ }).first().click();

  await page.getByRole('button', { name: 'Buscar', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__searchedImages.map((request) => request.title))).toEqual([
    'Peluca Afro Colores',
    'Antifaz Veneciano con Plumas',
  ]);
  const searchedRequest = await page.evaluate(() => window.__searchedImages[0]);
  expect(searchedRequest).toHaveProperty('casaAlbertoId');
  expect(searchedRequest).toHaveProperty('productUrl');

  await expect(page.getByText('Código exacto', { exact: true })).toBeVisible();
  await expect(page.getByText('Enlace guardado · 90%', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Aprobar seguras (1)' })).toBeEnabled();
  await page.getByRole('button', { name: 'Aprobar seguras (1)' }).click();
  await expect(page.getByRole('button', { name: 'Aprobar seguras (0)' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Aplicar 1' })).toBeEnabled();

  await filters.getByRole('button', { name: 'Limpiar' }).click();
  await filters.getByLabel('Orden').selectOption('oldest');
  await page.getByRole('button', { name: /^10 fotos$/ }).click();
  await page.getByRole('option', { name: '5 fotos', exact: true }).click();
  await page.getByRole('button', { name: 'Buscar', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__searchedImages.length)).toBe(7);
  const nextTitles = await page.evaluate(() => window.__searchedImages.slice(2).map((request) => request.title));
  expect(nextTitles).toEqual([
    'Pack Globos Metalizados Dorados',
    'Set Vasos Neón Fluo (x50)',
    'Piñata Mexicana Multicolor',
    'Bengalas para Torta (Pack x4)',
    'Guirnalda LED Multicolor 5m',
  ]);
  await expect(page.getByText('Por nombre · 70%', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Aprobar seguras (0)' })).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath('fotos-revision.png') });

  await page.locator('tbody button[title="Ver fotos encontradas"]').first().click();
  await expect(page.locator('.fixed.inset-0.z-\\[70\\]').getByText(/Código exacto|Enlace guardado|Por nombre/).first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('fotos-opciones.png') });

  expect(pageErrors).toEqual([]);
});
