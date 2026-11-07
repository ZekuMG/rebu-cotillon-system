const { test, expect } = require('playwright/test');

const appUrl = process.env.REBU_SMOKE_URL || 'http://127.0.0.1:5174/?demo=1';

async function expectCheckoutControlsToFit(page) {
  const geometry = await page.locator('.pos-cart-checkout').evaluate((checkout) => {
    const methods = checkout.querySelector('.pos-payment-methods').getBoundingClientRect();
    const editor = checkout.querySelector('.pos-payment-editor').getBoundingClientRect();
    const totals = checkout.querySelector('.pos-checkout-totals').getBoundingClientRect();
    const details = checkout.querySelector('.pos-checkout-details').getBoundingClientRect();
    const total = checkout.querySelector('.pos-checkout-total').getBoundingClientRect();
    const buttons = [...checkout.querySelectorAll('.pos-payment-methods > button')];
    return {
      methodsInsideRow: buttons.every((button) => button.getBoundingClientRect().top >= methods.top - 1 && button.getBoundingClientRect().bottom <= methods.bottom + 1),
      labelsInsideButtons: buttons.every((button) => [...button.querySelectorAll('span')].every((label) => label.getBoundingClientRect().top >= button.getBoundingClientRect().top && label.getBoundingClientRect().bottom <= button.getBoundingClientRect().bottom)),
      editorAfterButtons: buttons.every((button) => button.getBoundingClientRect().bottom < editor.top),
      fieldsInsideEditor: [...checkout.querySelectorAll('.pos-payment-editor input, .pos-payment-editor select')].filter((input) => input.getBoundingClientRect().height > 0).every((input) => input.getBoundingClientRect().top >= editor.top && input.getBoundingClientRect().bottom < totals.top),
      compactSummary: total.top - details.bottom <= 12 && totals.top - editor.bottom <= 12,
      readableDetails: [...checkout.querySelectorAll('.pos-checkout-details > div')].every((row) => parseFloat(getComputedStyle(row).fontSize) >= 12),
    };
  });
  expect(geometry).toEqual({ methodsInsideRow: true, labelsInsideButtons: true, editorAfterButtons: true, fieldsInsideEditor: true, compactSummary: true, readableDetails: true });
}

const checkoutViewports = [
  { width: 1920, height: 1080 },
  { width: 1920, height: 800 },
  { width: 2560, height: 1440 },
  { width: 1280, height: 720 },
  { width: 1008, height: 640 },
];

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
  for (const viewport of checkoutViewports) {
    await page.setViewportSize(viewport);
    await expectCheckoutControlsToFit(page);
  }

  await page
    .getByRole('button', { name: /Pack Globos Metalizados Dorados/i })
    .first()
    .click();

  await expect(bagToggle).toBeEnabled();
  await expect(bagToggle).toHaveAttribute('aria-checked', 'false');

  const totalRow = page.getByText('Total a Pagar', { exact: true }).locator('..');
  await expect(totalRow).toHaveText('Total a Pagar$3.500');

  await bagToggle.click();
  await expect(bagToggle).toHaveAttribute('aria-checked', 'true');
  await expect(totalRow).toHaveText('Total a Pagar$3.550');
  await expect(page.getByText('Bolsita', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: /Crédito/i }).click();
  await expect(totalRow).toHaveText('Total a Pagar$3.905');
  await expect(page.getByText('Recargo credito', { exact: true }).locator('..')).toHaveText('Recargo credito+$355');
  for (const viewport of checkoutViewports) {
    await page.setViewportSize(viewport);
    await expectCheckoutControlsToFit(page);
  }

  const screenshotPath = process.env.REBU_POS_BAG_SCREENSHOT;
  if (screenshotPath) {
    await page.screenshot({ path: screenshotPath, fullPage: true });
  }

  expect(pageErrors).toEqual([]);
});
