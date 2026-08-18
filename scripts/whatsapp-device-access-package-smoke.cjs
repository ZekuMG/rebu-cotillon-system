const { _electron: electron } = require('playwright');
const { resolve } = require('node:path');

const packagedExecutablePath = resolve(
  __dirname,
  '..',
  'release',
  'win-unpacked',
  'Rebu Cotillón System.exe',
);
const electronExecutablePath = resolve(
  __dirname,
  '..',
  'node_modules',
  'electron',
  'dist',
  'electron.exe',
);
const appPath = resolve(__dirname, '..');
const screenshotPath = resolve(
  __dirname,
  '..',
  'test-results',
  'whatsapp-device-access-1367.png',
);

(async () => {
  let app;
  try {
    app = await electron.launch({ executablePath: packagedExecutablePath });
  } catch {
    app = await electron.launch({
      executablePath: electronExecutablePath,
      args: [appPath],
      cwd: appPath,
    });
  }
  try {
    const page = await app.firstWindow();
    await page.setViewportSize({ width: 1367, height: 768 });
    await page.waitForTimeout(2500);

    const whatsappButton = page.getByRole('button', { name: /WhatsApp/i }).first();
    if (!(await whatsappButton.isVisible().catch(() => false))) {
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.log(JSON.stringify({ status: 'SESSION_REQUIRED', screenshotPath }));
      return;
    }

    await whatsappButton.click();
    await page.waitForTimeout(4500);
    const bodyText = await page.locator('body').innerText();
    const status = bodyText.includes('No estás habilitado para usar WhatsApp')
      ? 'DEVICE_BLOCKED'
      : bodyText.includes('Bandeja')
        ? 'WHATSAPP_VISIBLE'
        : 'UNKNOWN';
    await page.screenshot({ path: screenshotPath, fullPage: true });

    console.log(JSON.stringify({
      status,
      hasRequestAction: bodyText.includes('Solicitar acceso a la central'),
      hasTailscaleAction: bodyText.includes('Descargar Tailscale'),
      hasCentralUnavailableCopy: bodyText.includes('No se puede llegar a la PC central'),
      screenshotPath,
    }));
  } finally {
    await app.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
