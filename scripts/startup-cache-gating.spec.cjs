const { test, expect } = require('playwright/test');

const appOrigin = process.env.REBU_SMOKE_ORIGIN || 'http://127.0.0.1:5174';
const userId = 'startup-cache-audit-user';
const password = 'cache-audit-4321';

test('el acceso y Dashboard diario no abren el historial completo de IndexedDB', async ({ page }) => {
  await page.goto(`${appOrigin}/?demo=1`, { waitUntil: 'domcontentloaded' });

  await page.evaluate(async ({ auditUserId, auditPassword }) => {
    const bytesToHex = (bytes) => Array.from(bytes)
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
    const hexToBytes = (hex) => new Uint8Array(
      String(hex).match(/.{1,2}/g).map((byte) => Number.parseInt(byte, 16)),
    );
    const salt = '00112233445566778899aabbccddeeff';
    const source = `rebu-offline-login-v2:${auditUserId}:${auditPassword}`;
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(source),
      'PBKDF2',
      false,
      ['deriveBits'],
    );
    const digestBits = await crypto.subtle.deriveBits({
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: hexToBytes(salt),
      iterations: 150000,
    }, keyMaterial, 256);
    const savedAt = new Date().toISOString();

    localStorage.setItem('rebu_local_demo_mode', 'false');
    localStorage.setItem('party_shared_users_snapshot_v1', JSON.stringify({
      savedAt,
      authMode: 'supabase',
      scope: 'active',
      users: [{
        id: auditUserId,
        name: 'Auditoria de caché',
        displayName: 'Auditoria de caché',
        role: 'seller',
        isActive: true,
        permissionsVersion: 1,
      }],
    }));
    localStorage.setItem('party_offline_login_verifiers_v1', JSON.stringify({
      savedAt,
      verifiers: {
        [auditUserId]: {
          userId: auditUserId,
          algorithm: 'PBKDF2-SHA256',
          iterations: 150000,
          salt,
          digest: bytesToHex(new Uint8Array(digestBits)),
          updatedAt: savedAt,
        },
      },
    }));
    localStorage.setItem('party_cloud_snapshot_transactions_v1', JSON.stringify({
      savedAt,
      transactionsScope: 'partial',
      transactions: [{ id: 'recent-sale', createdAt: savedAt, total: 100, items: [] }],
    }));
    localStorage.setItem('party_cloud_snapshot_dashboard_v2', JSON.stringify({
      savedAt,
      dashboardScope: 'partial',
      dailyLogs: [],
      expenses: [],
      pastClosures: [],
    }));

    const padding = 'x'.repeat(900);
    const fullTransactions = Array.from({ length: 10000 }, (_, index) => ({
      id: `archived-sale-${index}`,
      createdAt: '2026-08-25T12:00:00.000Z',
      total: index,
      paymentMethod: 'cash',
      items: [{ id: index, title: padding, qty: 1, price: index, subtotal: index }],
    }));
    const request = indexedDB.open('rebu-offline-history', 1);
    const database = await new Promise((resolve, reject) => {
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('snapshots')) {
          request.result.createObjectStore('snapshots', { keyPath: 'key' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const transaction = database.transaction('snapshots', 'readwrite');
      transaction.objectStore('snapshots').put({
        key: 'transactions-full',
        cacheVersion: 1,
        savedAt,
        transactionsScope: 'full',
        transactions: fullTransactions,
      });
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  }, { auditUserId: userId, auditPassword: password });

  await page.addInitScript(() => {
    window.__rebuStartupIndexedDbOpens = 0;
    const originalOpen = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function auditedIndexedDbOpen(...args) {
      window.__rebuStartupIndexedDbOpens += 1;
      return originalOpen.apply(this, args);
    };
  });
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    const isLocal = url.hostname === '127.0.0.1' || url.hostname === 'localhost';
    if (url.protocol.startsWith('http') && !isLocal) {
      await route.abort('internetdisconnected');
      return;
    }
    await route.continue();
  });

  await page.goto(`${appOrigin}/`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Seleccioná tu usuario para continuar')).toBeVisible();
  expect(await page.evaluate(() => window.__rebuStartupIndexedDbOpens)).toBe(0);

  await page.getByRole('button', { name: /Auditoria de caché/i }).click();
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: /^Ingresar$/i }).click();
  await expect(page.getByRole('heading', { name: /Panel de Control/i })).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(500);

  expect(await page.evaluate(() => window.__rebuStartupIndexedDbOpens)).toBe(0);

  await page.getByRole('button', { name: /^Socios$/i }).click();
  await expect.poll(
    () => page.evaluate(() => window.__rebuStartupIndexedDbOpens),
    { timeout: 10000 },
  ).toBeGreaterThan(0);
});
