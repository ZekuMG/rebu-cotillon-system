const { test, expect } = require('playwright/test');
const appUrl = process.env.REBU_SMOKE_URL || 'http://127.0.0.1:5174/?demo=1';

async function openPos(page) {
  await page.goto(appUrl, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Logo de Rebu' }).click({ clickCount: 3, delay: 120 });
  await page.locator('input[type="password"]').fill('1234');
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await page.getByText('Modo demo local', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Punto de Venta', exact: true }).click();
  await expect.poll(async () => (
    await page.locator('.pos-cart-panel').isVisible()
    || await page.getByRole('heading', { name: 'Caja Cerrada', exact: true }).isVisible()
  )).toBe(true);
  if (await page.getByRole('heading', { name: 'Caja Cerrada', exact: true }).isVisible()) {
    await page.getByRole('button', { name: 'Abrir Caja', exact: true }).click();
    await page.getByPlaceholder('0', { exact: true }).fill('1000');
    await page.getByRole('button', { name: 'Abrir Caja', exact: true }).last().click();
  }
  await expect(page.getByRole('button', { name: 'Abrir nuevo carrito', exact: true })).toBeVisible();
}

async function expectVisibleTabs(page) {
  await expect.poll(() => page.evaluate(() => {
    const row = document.querySelector('.pos-cart-tabs').getBoundingClientRect();
    const railElement = document.querySelector('.pos-cart-tab-rail');
    const rail = railElement.getBoundingClientRect();
    const active = railElement.querySelector('.is-active').getBoundingClientRect();
    return Array.from(railElement.children).every((tab) => {
      const rect = tab.getBoundingClientRect();
      return rect.top >= row.top && rect.bottom <= row.bottom + 1;
    }) && active.left >= rail.left - 1 && active.right <= rail.right + 1;
  })).toBe(true);
}

test('las pestañas se ven completas con uno, tres y muchos carritos en ambos temas y tamaños', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await openPos(page);
  await expectVisibleTabs(page);
  for (let count = 2; count <= 9; count++) {
    await page.getByRole('button', { name: 'Abrir nuevo carrito', exact: true }).click();
    await expect(page.getByRole('tab', { name: `Carrito ${count}`, exact: true })).toHaveAttribute('aria-selected', 'true');
    await expectVisibleTabs(page);
    if (count === 3) {
      expect(await page.locator('.pos-cart-tab-rail').evaluate((rail) => rail.scrollWidth - rail.clientWidth)).toBeLessThanOrEqual(1);
    }
  }
  for (const viewport of [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(viewport);
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
      await expectVisibleTabs(page);
      const add = page.getByRole('button', { name: 'Abrir nuevo carrito', exact: true });
      await expect(add).toBeInViewport();
    }
  }
});

test('cambiar y cerrar pestañas conserva el pedido de cada carrito', async ({ page }) => {
  await openPos(page);
  await page.getByRole('button', { name: /Pack Globos Metalizados Dorados/ }).first().click();
  await page.getByRole('button', { name: 'Abrir nuevo carrito', exact: true }).click();
  await page.getByRole('button', { name: /Set Vasos Neón Fluo/ }).first().click();
  await page.getByRole('button', { name: 'Abrir nuevo carrito', exact: true }).click();
  await page.getByRole('tab', { name: 'Carrito 1', exact: true }).click();
  await expect(page.locator('.pos-cart-item')).toHaveCount(1);
  await expect(page.locator('.pos-cart-item')).toContainText('Pack Globos');
  await page.getByRole('tab', { name: 'Carrito 2', exact: true }).click();
  await expect(page.locator('.pos-cart-item')).toHaveCount(1);
  await expect(page.locator('.pos-cart-item')).toContainText('Set Vasos');
  await page.getByRole('button', { name: 'Cerrar carrito 3', exact: true }).click();
  await expect(page.getByRole('tab')).toHaveCount(2);
  await expect(page.locator('.pos-cart-item')).toContainText('Set Vasos');
  await expectVisibleTabs(page);
});
