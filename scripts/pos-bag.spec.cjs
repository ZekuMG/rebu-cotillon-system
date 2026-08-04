const { test, expect } = require('playwright/test');

const appUrl = process.env.REBU_SMOKE_URL || 'http://127.0.0.1:5174/?demo=1';

test('la bolsita POS suma al cobro y recibe el recargo de credito', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    const isLocal = url.hostname === '127.0.0.1' || url.hostname === 'localhost';
    if (url.protocol.startsWith('http') && !isLocal) {
      await route.abort('internetdisconnected');
      return;
    }
    await route.continue();
  });

  await page.goto(appUrl, { waitUntil: 'networkidle' });
  const logoButton = page.getByRole('button', { name: 'Logo de Rebu' });
  await logoButton.click({ clickCount: 3, delay: 120 });
  await page.locator('input[type="password"]').fill('1234');
  await page.getByRole('button', { name: /^Ingresar$/i }).click();
  await expect(page.getByText('Modo demo local', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: /Punto de Venta/i }).click();
  if (await page.getByRole('heading', { name: 'Caja Cerrada' }).isVisible().catch(() => false)) {
    await page.getByRole('button', { name: 'Abrir Caja', exact: true }).click();
    await page.getByRole('textbox', { name: '0' }).fill('1000');
    await page.getByRole('button', { name: 'Abrir Caja', exact: true }).last().click();
  }

  const bagToggle = page.getByRole('checkbox', { name: /Lleva bolsita/i });
  await expect(bagToggle).toBeDisabled();

  await page
    .getByRole('button', { name: /Pack Globos Metalizados Dorados/i })
    .first()
    .click();

  await expect(bagToggle).toBeEnabled();
  await expect(bagToggle).toHaveAttribute('aria-checked', 'false');

  const totalRow = page.getByText('Total a Pagar', { exact: true }).locator('..');
  await expect(totalRow).toContainText('$3.500,00');

  await bagToggle.click();
  await expect(bagToggle).toHaveAttribute('aria-checked', 'true');
  await expect(totalRow).toContainText('$3.550,00');
  await expect(page.getByText('Bolsita', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: /Crédito/i }).click();
  await expect(totalRow).toContainText('$3.905,00');
  await expect(page.getByText('Recargo credito', { exact: true }).locator('..')).toContainText('$355,00');

  const screenshotPath = process.env.REBU_POS_BAG_SCREENSHOT;
  if (screenshotPath) {
    await page.screenshot({ path: screenshotPath, fullPage: true });
  }

  expect(pageErrors).toEqual([]);
});
