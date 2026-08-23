const { test, expect } = require('playwright/test');

const appUrl = process.env.REBU_SMOKE_URL || 'http://127.0.0.1:5174/?demo=1';

test('Casa Alberto ofrece el historial PDF por período sin romper el modo navegador', async ({ page }, testInfo) => {
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

  const notificationsButton = page.getByRole('button', { name: /Notificaciones, 0 pendientes/i });
  await expect(notificationsButton).toBeVisible();
  await notificationsButton.click();
  const notificationsPanel = page.getByRole('region', { name: 'Bandeja de notificaciones' });
  await expect(notificationsPanel).toBeVisible();
  await expect(notificationsPanel.getByText('No hay pendientes')).toBeVisible();
  const notificationsPanelBox = await notificationsPanel.boundingBox();
  expect(notificationsPanelBox).not.toBeNull();
  const panelOwnsCenterPoint = await page.evaluate(({ x, y }) => (
    Boolean(document.elementFromPoint(x, y)?.closest('[aria-label="Bandeja de notificaciones"]'))
  ), {
    x: notificationsPanelBox.x + (notificationsPanelBox.width / 2),
    y: notificationsPanelBox.y + (notificationsPanelBox.height / 2),
  });
  expect(panelOwnsCenterPoint).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('notifications-panel.png'), fullPage: true });
  await page.keyboard.press('Escape');
  await expect(notificationsPanel).toHaveCount(0);

  await page.getByRole('button', { name: /Productos \(Avanzado\)/i }).click();
  await page.getByRole('button', { name: /Casa Alberto/i }).click();

  const reportButton = page.getByRole('button', { name: /Historial PDF/i });
  await expect(reportButton).toBeVisible();
  await reportButton.click();

  const periodMenu = page.getByRole('menu');
  await expect(periodMenu).toBeVisible();
  await expect(periodMenu.getByRole('menuitem')).toHaveCount(5);
  for (const label of ['Últimas 24 horas', 'Últimos 3 días', 'Últimos 7 días', 'Últimos 15 días', 'Últimos 30 días']) {
    await expect(periodMenu.getByRole('menuitem', { name: new RegExp(label, 'i') })).toBeVisible();
  }

  await page.screenshot({ path: testInfo.outputPath('supplier-price-report-menu.png'), fullPage: true });
  await periodMenu.getByRole('menuitem', { name: /Últimas 24 horas/i }).click();
  await expect(page.getByRole('heading', { name: 'Electron requerido' })).toBeVisible();
  await expect(page.getByText('El historial PDF se guarda desde la aplicación de escritorio.')).toBeVisible();
  expect(pageErrors).toEqual([]);
});
