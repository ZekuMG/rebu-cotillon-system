const { test, expect } = require('playwright/test');
const { pbkdf2Sync } = require('node:crypto');
const origin = process.env.REBU_SMOKE_ORIGIN || 'http://127.0.0.1:5174';

for (const withCheckoutDraft of [false, true]) {
test(`el modo real recupera ${withCheckoutDraft ? 'bolsita y pagos combinados' : 'gramos y centavos'} tras reiniciar sin conexion`, async ({ page }) => {
  const userId = 'price-cache-audit-user';
  const password = 'cache-price-4321';
  const salt = '00112233445566778899aabbccddeeff';
  const savedAt = new Date().toISOString();
  const digest = pbkdf2Sync(`rebu-offline-login-v2:${userId}:${password}`, Buffer.from(salt, 'hex'), 150000, 32, 'sha256').toString('hex');
  const user = { id: userId, name: 'Control centavos', displayName: 'Control centavos', role: 'seller', isActive: true, permissionsVersion: 1 };
  const product = { id: 'custom_cache_weight', title: 'Peso con centavos', price: 8.0635, quantity: 333, product_type: 'weight', stock: 5000, cost: 4, isCustom: true };
  const snapshots = {
    rebu_local_demo_mode: 'false',
    party_shared_users_snapshot_v1: { savedAt, authMode: 'supabase', scope: 'active', users: [user] },
    party_offline_login_verifiers_v1: { savedAt, verifiers: { [userId]: { userId, algorithm: 'PBKDF2-SHA256', iterations: 150000, salt, digest, updatedAt: savedAt } } },
    party_cloud_snapshot_core_v2: { savedAt, inventoryScope: 'full', inventory: [], categories: [], rewards: [], members: [], offers: [], registerState: { id: 1, is_open: true, opening_balance: 0, closing_time: '23:59' } },
    party_cloud_snapshot_transactions_v1: { savedAt, transactionsScope: 'full', transactions: [] },
    party_cloud_snapshot_dashboard_v2: { savedAt, dashboardScope: 'full', dailyLogs: [], expenses: [], pastClosures: [] },
    party_pos_snapshot_v1: { savedAt, cart: [product], selectedPayment: 'Efectivo', installments: 1, posViewMode: 'grid' },
  };
  if (withCheckoutDraft) {
    snapshots.party_pos_snapshot_v1.posCarts = [{
      id: 'persisted-cart', cart: [product], selectedPayment: 'Efectivo', selectedUserId: userId,
      checkoutDraft: {
        hasPosBag: true, isSplitPaymentMode: true, activeSplitLineIndex: 1,
        paymentLines: [
          { id: 'split_primary', method: 'Efectivo', amount: 1000, installments: 1, cashReceived: '' },
          { id: 'split_secondary', method: 'MercadoPago', amount: 1735.15, installments: 1, cashReceived: '' },
        ],
      },
    }];
    snapshots.party_pos_snapshot_v1.activePosCartId = 'persisted-cart';
  }
  await page.addInitScript((values) => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    if (localStorage.getItem('price_cache_fixture')) return;
    for (const [key, value] of Object.entries(values)) localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
    localStorage.setItem('price_cache_fixture', 'ready');
  }, snapshots);
  const remoteWrites = [];
  await page.route('**/*', (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.protocol.startsWith('http') && !['127.0.0.1', 'localhost'].includes(url.hostname)) {
      if (request.method() !== 'GET' && request.method() !== 'HEAD') remoteWrites.push(`${request.method()} ${url.pathname}`);
      return route.abort('internetdisconnected');
    }
    return route.continue();
  });
  for (let boot = 0; boot < 2; boot += 1) {
    await page.goto(`${origin}/?demo=0`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /Control centavos/i }).click();
    await page.locator('input[type="password"]').fill(password);
    await page.getByRole('button', { name: /^Ingresar$/i }).click();
    await page.getByRole('button', { name: /Punto de Venta/i }).click();
    await expect(page.getByText('Total a Pagar', { exact: true }).locator('..')).toContainText(withCheckoutDraft ? '$2.735,15' : '$2.685,15');
    if (withCheckoutDraft) {
      await expect(page.locator('.pos-sale-user-picker summary')).toContainText(user.displayName);
      await expect(page.getByRole('checkbox', { name: /Lleva bolsita/ })).toHaveAttribute('aria-checked', 'true');
      await expect(page.getByPlaceholder('Monto', { exact: true }).first()).toHaveValue('1000');
      await expect(page.getByPlaceholder('Monto', { exact: true }).nth(1)).toHaveValue('1735.15');
    }
    await expect(page.getByRole('heading', { name: 'Peso con centavos' })).toBeVisible();
    const cached = await page.evaluate(() => JSON.parse(localStorage.getItem('party_pos_snapshot_v1')).cart[0]);
    expect(cached.price).toBe(8.0635);
    expect(cached.quantity).toBe(333);
  }
  // Las RPC de lectura usan POST. Solo se consideran mutaciones de negocio.
  expect(remoteWrites.filter(path => /\/(products|sales|sale_items|logs|expenses)$|checkout|create_sale|update_sale/i.test(path))).toEqual([]);
});
}
