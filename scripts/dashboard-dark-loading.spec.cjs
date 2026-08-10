const { test, expect } = require('playwright/test');

const appUrl = process.env.REBU_SMOKE_URL || 'http://127.0.0.1:5174/?demo=1';

test('la carga de KPI conserva la tarjeta y el contraste en tema oscuro', async ({ page }, testInfo) => {
  await page.goto(appUrl, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Caja/i }).click();
  await page.locator('input[type="password"]').fill('4321');
  await page.getByRole('button', { name: /^Ingresar$/i }).click();
  await expect(page.getByText('Modo demo local', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Control de Caja/i }).click();
  await expect(page.getByRole('heading', { name: /Panel de Control/i })).toBeVisible();

  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'dark';
    document.querySelector('.app-shell')?.setAttribute('data-theme', 'dark');
  });

  const cards = page.locator('.dashboard-view [aria-busy]');
  const values = page.locator('.dashboard-view [aria-live="polite"][aria-atomic="true"]');
  await expect(cards).toHaveCount(6);
  await expect(values).toHaveCount(6);

  const appearance = await values.first().evaluate((value) => {
    value.classList.add('dashboard-kpi-value-loading');
    const valueStyle = getComputedStyle(value);
    const cardStyle = getComputedStyle(value.closest('[aria-busy]'));
    return {
      animationName: valueStyle.animationName,
      filter: valueStyle.filter,
      valueColor: valueStyle.color,
      cardOpacity: cardStyle.opacity,
    };
  });

  expect(appearance.animationName).toContain('dashboard-kpi-value-loading');
  expect(appearance.filter).toBe('none');
  expect(appearance.valueColor).not.toBe('rgba(0, 0, 0, 0)');
  expect(appearance.cardOpacity).toBe('1');

  await page.screenshot({
    path: testInfo.outputPath('dashboard-dark-loading.png'),
    fullPage: true,
  });
});
