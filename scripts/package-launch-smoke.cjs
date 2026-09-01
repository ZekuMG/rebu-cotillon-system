const { _electron: electron } = require('playwright');
const { join, resolve } = require('node:path');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');

const executablePath = resolve(
  __dirname,
  '..',
  'release',
  'win-unpacked',
  'Rebu Cotillón System.exe',
);
const screenshotPath = resolve(
  __dirname,
  '..',
  'test-results',
  'package-launch-1.2.35.png',
);

(async () => {
  // Never share Chromium's profile with an already-running installed copy.
  // Concurrent Electron instances can otherwise trip a native 0x80000003
  // breakpoint while locking LevelDB/profile files.
  const isolatedProfilePath = mkdtempSync(join(tmpdir(), 'rebu-packaged-smoke-'));
  const app = await electron.launch({
    executablePath,
    args: [`--user-data-dir=${isolatedProfilePath}`],
  });
  try {
    const version = await app.evaluate(({ app: electronApp }) => electronApp.getVersion());
    const page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2500);
    const rendererText = (await page.locator('body').innerText()).trim();
    if (version !== '1.2.35') throw new Error(`Versión empaquetada inesperada: ${version}`);
    if (!page.url().includes('app.asar') || !rendererText) {
      throw new Error(`El renderer empaquetado no inició correctamente: ${page.url()}`);
    }
    await page.screenshot({ path: screenshotPath });

    console.log(JSON.stringify({
      status: 'PACKAGED_APP_OK',
      version,
      rendererUrl: page.url(),
      executablePath,
      screenshotPath,
    }));
  } finally {
    await app.close();
    rmSync(isolatedProfilePath, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
