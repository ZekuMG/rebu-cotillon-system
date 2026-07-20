const { test, expect } = require('playwright/test');

const appUrl = process.env.REBU_SMOKE_URL || 'http://127.0.0.1:5174/?demo=1';

test('la carga del dashboard conserva contraste en tema oscuro', async ({ page }, testInfo) => {
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

    const card = document.querySelector('.dashboard-view [aria-busy]');
    card?.classList.add('dashboard-kpi-refreshing');

    const indicator = document.createElement('span');
    indicator.dataset.testid = 'dark-loading-indicator';
    indicator.className = 'dashboard-refresh-indicator absolute bottom-2 right-2 inline-flex h-6 w-6 items-center justify-center rounded';
    const sourceIcon = card?.querySelector('svg');
    if (sourceIcon) indicator.append(sourceIcon.cloneNode(true));
    card?.append(indicator);

    const status = document.createElement('span');
    status.dataset.testid = 'dark-loading-status';
    status.className = 'dashboard-refresh-status inline-flex h-6 items-center rounded-md px-2 text-[10px] font-black uppercase';
    status.textContent = 'Recalculando';
    document.querySelector('.dashboard-view h2')?.parentElement?.append(status);
  });

  const appearance = await page.evaluate(() => {
    const indicator = getComputedStyle(document.querySelector('[data-testid="dark-loading-indicator"]'));
    const status = getComputedStyle(document.querySelector('[data-testid="dark-loading-status"]'));
    const card = getComputedStyle(document.querySelector('.dashboard-kpi-refreshing'));
    return {
      indicatorBackground: indicator.backgroundColor,
      indicatorBorder: indicator.borderColor,
      indicatorColor: indicator.color,
      statusBackground: status.backgroundColor,
      statusColor: status.color,
      cardShadow: card.boxShadow,
    };
  });

  expect(appearance.indicatorBackground).toBe('rgba(180, 83, 9, 0.24)');
  expect(appearance.indicatorBorder).toBe('rgba(251, 191, 36, 0.42)');
  expect(appearance.indicatorColor).toBe('rgb(251, 191, 36)');
  expect(appearance.statusBackground).toBe(appearance.indicatorBackground);
  expect(appearance.statusColor).toBe(appearance.indicatorColor);
  expect(appearance.cardShadow).toContain('rgba(251, 191, 36, 0.42)');

  await page.screenshot({
    path: testInfo.outputPath('dashboard-dark-loading.png'),
    fullPage: true,
  });
});
