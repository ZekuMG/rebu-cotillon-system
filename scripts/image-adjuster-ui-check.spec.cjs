const { test, expect } = require('playwright/test');
const path = require('path');

const APP_URL = 'http://127.0.0.1:5174/?demo=1';
const ROOT = path.resolve(__dirname, '..');
const SCREENSHOTS = path.join(ROOT, 'test-results', 'image-adjuster');

test.use({ viewport: { width: 1920, height: 1080 } });

test('ajustar imagen y verla completa desde inventario', async ({ page }) => {
  test.setTimeout(60000);
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    const local = url.hostname === '127.0.0.1' || url.hostname === 'localhost';
    if (url.protocol.startsWith('http') && !local) {
      await route.abort('internetdisconnected');
      return;
    }
    await route.continue();
  });

  await page.goto(APP_URL, { waitUntil: 'networkidle' });
  const logo = page.getByRole('button', { name: /Logo de Rebu/i });
  for (let index = 0; index < 3; index += 1) {
    await logo.click();
    await page.waitForTimeout(120);
  }
  await page.locator('input[type="password"]').fill('1234');
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await expect(page.getByText('Modo demo local', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: /Inventario/i }).first().click();
  await page.getByRole('button', { name: 'Nuevo producto', exact: true }).click();
  const productModal = page.getByRole('heading', { name: 'Nuevo Producto' })
    .locator('xpath=ancestor::div[contains(@class, "max-w-md")]');
  await productModal.locator('input[type="file"]').setInputFiles(path.join(ROOT, 'public', 'rebu-logo.png'));

  const adjuster = page.getByRole('dialog', { name: 'Ajustar imagen del producto' });
  await expect(adjuster).toBeVisible();
  await expect(adjuster.getByRole('button', { name: 'Foto completa' })).toBeVisible();
  await expect(adjuster.getByRole('button', { name: 'Llenar marco' })).toBeVisible();
  await expect(adjuster.getByText('Arrastrá para mover')).toBeVisible();

  // La foto elegida tiene que VERSE en la vista previa, no solo el marco.
  const previewImage = adjuster.getByAltText('Vista previa del ajuste');
  await expect(previewImage).toBeVisible();
  const previewBox = await previewImage.boundingBox();
  expect(previewBox?.width).toBeGreaterThan(50);
  expect(previewBox?.height).toBeGreaterThan(50);
  await adjuster.screenshot({ path: path.join(SCREENSHOTS, 'adjuster-full-photo.png') });

  await adjuster.getByRole('button', { name: 'Llenar marco' }).click();
  const stage = adjuster.locator('.cursor-grab');
  const box = await stage.boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(300);
  expect(box?.height).toBeGreaterThanOrEqual(300);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2);
  await page.mouse.up();
  await adjuster.screenshot({ path: path.join(SCREENSHOTS, 'adjuster-fill-frame.png') });

  await adjuster.getByRole('button', { name: 'Foto completa' }).click();
  await adjuster.getByRole('button', { name: 'Usar esta imagen' }).click();
  await expect(adjuster).toBeHidden();
  await expect(productModal.getByText('Imagen cargada y lista para el catálogo')).toBeVisible();
  await page.getByRole('button', { name: 'Entendido', exact: true }).click();

  await productModal.locator('input[required][type="text"]').fill('Foto completa UI');
  const numberInputs = productModal.locator('input[required][type="number"]');
  await numberInputs.nth(0).fill('100');
  await numberInputs.nth(1).fill('250');
  await numberInputs.nth(2).fill('5');
  await productModal.locator('select').selectOption({ index: 1 });
  await productModal.getByRole('button', { name: 'Agregar', exact: true }).click();
  await expect(productModal).toBeHidden();
  const addedNotification = page.getByRole('button', { name: 'Entendido', exact: true });
  if (await addedNotification.isVisible().catch(() => false)) await addedNotification.click();

  await page.getByPlaceholder('Buscar...').fill('Foto completa UI');
  const viewFullButton = page.getByRole('button', { name: 'Ver foto completa de Foto completa UI' });
  await expect(viewFullButton).toBeVisible();
  await viewFullButton.click();

  const viewer = page.getByRole('dialog', { name: 'Foto completa de Foto completa UI' });
  await expect(viewer).toBeVisible();
  await expect(viewer.locator('img.object-contain')).toHaveCount(1);
  await viewer.screenshot({ path: path.join(SCREENSHOTS, 'inventory-full-photo.png') });
  await page.keyboard.press('Escape');
  await expect(viewer).toBeHidden();

  expect(pageErrors).toEqual([]);
});
