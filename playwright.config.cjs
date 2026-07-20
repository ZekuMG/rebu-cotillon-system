const { defineConfig } = require('playwright/test');

module.exports = defineConfig({
  testDir: './scripts',
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5174 --strictPort',
    url: 'http://127.0.0.1:5174',
    reuseExistingServer: true,
    timeout: 120000,
  },
});
