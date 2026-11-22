const { _electron: electron } = require('playwright');
const { spawn } = require('node:child_process');
const { createServer } = require('node:net');
const { mkdirSync, mkdtempSync, realpathSync, rmSync } = require('node:fs');
const path = require('node:path');
const { version } = require('../package.json');
const root = path.resolve(__dirname, '..');
const temporaryRoot = path.join(root, '.codex-tmp');
const executablePath = path.join(root, 'release', 'win-unpacked', 'Rebu Cotillón System.exe');
const freePort = () => new Promise((resolve, reject) => {
  const server = createServer();
  server.on('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const port = server.address().port;
    server.close(() => resolve(port));
  });
});
const pythonCase = (port, scenario) => new Promise((resolve, reject) => {
  const child = spawn('python', [path.join(__dirname, 'packaged-offline-qa.py'), `http://127.0.0.1:${port}`, scenario], { cwd: root, stdio: 'inherit', windowsHide: true, env: { ...process.env, REBU_TEST_SCREENSHOTS: '0' } });
  child.once('error', reject);
  child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Packaged ${scenario} failed: ${code}`)));
});

(async () => {
  mkdirSync(temporaryRoot, { recursive: true });
  for (const scenario of ['cold', 'live', 'in-flight', 'wan', 'sale', 'lost-response', 'pos-recovery']) {
    const profile = mkdtempSync(path.join(temporaryRoot, 'packaged-offline-'));
    const port = await freePort();
    const app = await electron.launch({ executablePath, args: [`--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, '--disable-renderer-backgrounding', '--disable-background-timer-throttling'] });
    try {
      await app.firstWindow();
      const actualVersion = await app.evaluate(({ app: electronApp, BrowserWindow }) => {
        BrowserWindow.getAllWindows().forEach(window => {
          window.setContentSize(1366, 900);
          window.webContents.setBackgroundThrottling(false);
          // Windows suspends mouse acknowledgements for hidden native windows.
          // Keep the compositor active without exposing or focusing a window.
          window.setOpacity(0);
          window.setSkipTaskbar(true);
          window.setFocusable(false);
          window.setIgnoreMouseEvents(true);
          window.showInactive();
        });
        return electronApp.getVersion();
      });
      if (actualVersion !== version) throw new Error(`Wrong packaged version: ${actualVersion}`);
      await pythonCase(port, scenario);
      console.log(`PACKAGED_PASS ${version} ${scenario}`);
    } finally {
      await app.close();
      const resolvedProfile = realpathSync(profile);
      const resolvedRoot = realpathSync(temporaryRoot) + path.sep;
      if (!resolvedProfile.startsWith(resolvedRoot) || !path.basename(resolvedProfile).startsWith('packaged-offline-')) throw new Error('Profile cleanup is outside the test directory');
      rmSync(resolvedProfile, { recursive: true, force: true });
    }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
