const { test, expect } = require('playwright/test');

const openBudgetBuilder = async (page) => {
  await page.goto('http://127.0.0.1:5174/?demo=1', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Caja/i }).click();
  await page.locator('input[type="password"]').fill('4321');
  await page.getByRole('button', { name: /^Ingresar$/i }).click();
  await expect(page.getByText('Modo demo local', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^Pedidos$/i }).click();
  await page.getByRole('button', { name: /Nuevo presupuesto/i }).click();
  await expect(page.getByRole('dialog', { name: /Crear presupuesto/i })).toBeVisible();
};

const expectNoHorizontalOverflow = async (page) => {
  const result = await page.getByRole('dialog').evaluate((dialog) => {
    const viewportWidth = document.documentElement.clientWidth;
    const dialogRect = dialog.getBoundingClientRect();
    const overflowing = Array.from(dialog.querySelectorAll('button, input, select, textarea, [data-budget-section]'))
      .filter((element) => {
        const style = window.getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        const rect = element.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return false;
        return rect.right > viewportWidth + 1 || rect.left < -1;
      })
      .map((element) => ({
        tag: element.tagName,
        text: String(element.textContent || element.getAttribute('aria-label') || '').trim().slice(0, 60),
        rect: element.getBoundingClientRect().toJSON(),
      }));

    return {
      viewportWidth,
      dialog: dialogRect.toJSON(),
      overflowing,
    };
  });

  expect(result.dialog.x).toBeGreaterThanOrEqual(0);
  expect(result.dialog.x + result.dialog.width).toBeLessThanOrEqual(result.viewportWidth + 1);
  expect(result.overflowing).toEqual([]);
};

for (const viewport of [
  { name: 'escritorio', width: 1440, height: 900, compact: false },
  { name: 'notebook', width: 1080, height: 720, compact: true },
  { name: 'notebook-baja', width: 1024, height: 600, compact: true },
  { name: 'angosta', width: 640, height: 720, compact: true },
]) {
  test(`el constructor de presupuesto se adapta a resolución ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await openBudgetBuilder(page);

    const catalog = page.locator('[data-budget-section="catalog"]');
    const detail = page.locator('[data-budget-section="detail"]');
    const detailTab = page.getByRole('button', { name: /Cliente y detalle/i });

    if (viewport.compact) {
      await expect(detailTab).toBeVisible();
      await expect(catalog).toBeVisible();
      await expect(detail).toBeHidden();
      await detailTab.click();
      await expect(detail).toBeVisible();
      await expect(catalog).toBeHidden();
    } else {
      await expect(detailTab).toBeHidden();
      await expect(catalog).toBeVisible();
      await expect(detail).toBeVisible();
    }

    await page.getByRole('button', { name: /Item manual/i }).click();
    const itemRow = page.locator('.budget-builder-item-row');
    await itemRow.evaluate((element) => element.scrollIntoView({ block: 'center' }));
    await expect(itemRow).toBeInViewport();
    await expect(page.getByRole('button', { name: /Guardar presupuesto/i })).toBeVisible();
    const [rowBox, footerBox] = await Promise.all([
      itemRow.boundingBox(),
      page.locator('[data-budget-footer]').boundingBox(),
    ]);
    expect(rowBox.y + rowBox.height).toBeLessThanOrEqual(footerBox.y + 1);
    if (viewport.compact) {
      await detail.locator('[data-budget-detail-scroll]').evaluate((element) => element.scrollTo({ top: 0 }));
      await expect(detail.getByRole('button', { name: /^Socio$/i })).toBeInViewport();
    }
    await expectNoHorizontalOverflow(page);
    await page.screenshot({
      path: `test-results/budget-responsive-${viewport.name}.png`,
      fullPage: false,
    });
  });
}
