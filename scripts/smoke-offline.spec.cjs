const { test, expect } = require('playwright/test');

const appUrl = process.env.REBU_SMOKE_URL || 'http://127.0.0.1:5174/?demo=1';

test('modo demo funciona sin recursos externos', async ({ page }) => {
  const externalRequests = [];
  const failedRequests = [];
  const pageErrors = [];
  let phase = 'bootstrap';

  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('requestfailed', (request) => {
    const failure = request.failure();
    failedRequests.push(`${request.method()} ${request.url()} (${failure?.errorText || 'unknown'})`);
  });

  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    const isLocal = url.hostname === '127.0.0.1' || url.hostname === 'localhost';
    if (url.protocol.startsWith('http') && !isLocal) {
      externalRequests.push(`${phase}: ${url.href}`);
      await route.abort('internetdisconnected');
      return;
    }
    await route.continue();
  });

  await page.goto(appUrl, { waitUntil: 'networkidle' });

  const styles = await page.evaluate(() => ({
    flex: getComputedStyle(document.querySelector('.flex')).display,
    screenHeight: getComputedStyle(document.querySelector('.h-screen')).height,
  }));
  expect(styles.flex).toBe('flex');
  expect(Number.parseFloat(styles.screenHeight)).toBeGreaterThan(500);

  await page.getByRole('button', { name: /Caja/i }).click();
  await page.locator('input[type="password"]').fill('4321');
  phase = 'login';
  await page.getByRole('button', { name: /^Ingresar$/i }).click();
  await expect(page.getByText('Modo demo local', { exact: true })).toBeVisible();

  phase = 'navigation:dashboard';
  await page.getByRole('button', { name: /Control de Caja/i }).click();
  await expect(page.getByRole('heading', { name: /Panel de Control/i })).toBeVisible();

  const sections = ['Socios', 'Historial de Ventas', 'Métricas'];
  const visited = [];
  for (const section of sections) {
    phase = `navigation:${section}`;
    const navigationButton = page.getByRole('button', { name: new RegExp(section, 'i') }).first();
    if (await navigationButton.isVisible().catch(() => false)) {
      await navigationButton.click();
      await page.waitForTimeout(400);
      visited.push(section);
    }
  }

  expect(visited.length).toBeGreaterThan(0);
  expect(externalRequests).toEqual([]);
  expect(failedRequests).toEqual([]);
  expect(pageErrors).toEqual([]);
});
