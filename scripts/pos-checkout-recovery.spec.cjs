const { test, expect } = require('playwright/test');
const { pbkdf2Sync } = require('node:crypto');

test.setTimeout(60000);

for (const failure of ['lost-response', 'receipt-read']) {
  test(`el cobro real se recupera tras reiniciar sin duplicarse: ${failure}`, async ({ page }) => {
    const userId = 'checkout-recovery-audit-user';
    const password = 'audit-4321';
    const salt = '00112233445566778899aabbccddeeff';
    const savedAt = new Date().toISOString();
    const user = { id: userId, name: 'Prueba recuperación', displayName: 'Prueba recuperación', role: 'owner', isActive: true, permissionsVersion: 1 };
    const cloudUser = { ...user, display_name: user.name, is_active: true, permissions_version: 1 };
    const register = { id: 1, is_open: true, opening_balance: 0, closing_time: '23:59' };
    const product = { id: 'custom_recovery', title: 'Pedido original', price: 3500, quantity: 1, product_type: 'quantity', isCustom: true, cost: 0 };
    const digest = pbkdf2Sync(`rebu-offline-login-v2:${userId}:${password}`, Buffer.from(salt, 'hex'), 150000, 32, 'sha256').toString('hex');
    const snapshots = {
      rebu_local_demo_mode: 'false',
      party_shared_users_snapshot_v1: { savedAt, authMode: 'supabase', scope: 'active', users: [user] },
      party_offline_login_verifiers_v1: { savedAt, verifiers: { [userId]: { userId, algorithm: 'PBKDF2-SHA256', iterations: 150000, salt, digest, updatedAt: savedAt } } },
      party_cloud_snapshot_core_v2: { savedAt, inventoryScope: 'full', inventory: [], categories: [], rewards: [], members: [], offers: [], registerState: register },
      party_cloud_snapshot_transactions_v1: { savedAt, transactionsScope: 'full', transactions: [] },
      party_cloud_snapshot_dashboard_v2: { savedAt, dashboardScope: 'full', dailyLogs: [], expenses: [], pastClosures: [] },
      party_pos_snapshot_v1: { savedAt, posCarts: [{ id: 'recovery-cart', cart: [product], selectedClient: { id: 'guest', name: 'Consumidor final' }, checkoutDraft: { hasPosBag: true } }], activePosCartId: 'recovery-cart' },
    };
    await page.addInitScript((values) => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
      if (localStorage.getItem('checkout_recovery_fixture')) return;
      for (const [key, value] of Object.entries(values)) localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
      localStorage.setItem('checkout_recovery_fixture', 'ready');
    }, snapshots);
    let canonical = null;
    let receiptFailed = false;
    let commits = 0;
    const requests = [];
    await page.routeWebSocket('**/*', (socket) => socket.close());
    await page.route('**/*', async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      if (['127.0.0.1', 'localhost'].includes(url.hostname) || !url.protocol.startsWith('http')) return route.continue();
      if (!url.pathname.includes('/rest/v1/')) return route.abort('internetdisconnected');
      const endpoint = url.pathname.split('/').pop();
      if (endpoint.startsWith('verify_app_user_login')) return route.fulfill({ json: [cloudUser] });
      if (endpoint === 'register_sale_transaction') {
        const body = req.postDataJSON();
        requests.push(body);
        if (!canonical) {
          commits++;
          canonical = { ...body.p_sale, id: 88, user_name: 'Empleado confirmado', created_at: savedAt, status: 'completed', voided_at: null, clients: null, sale_items: body.p_items.map((item, index) => ({ ...item, product_title: index === 0 ? 'Producto confirmado' : item.product_title, cost: 0, is_custom: true, is_discount: false, is_combo: false })) };
          if (failure === 'lost-response') return route.abort('failed');
        }
        return route.fulfill({ json: { id: 88, _duplicate: requests.length > 1 } });
      }
      if (endpoint === 'sales' && url.searchParams.has('id') && canonical && failure === 'receipt-read' && !receiptFailed) {
        receiptFailed = true;
        return route.abort('failed');
      }
      if (endpoint === 'logs' && req.method() === 'POST') return route.fulfill({ json: [{ id: 100, ...req.postDataJSON() }] });
      const rows = endpoint === 'register_state' ? [register]
        : /app_users/.test(endpoint) ? [cloudUser]
        : endpoint === 'sales' && canonical ? [canonical] : [];
      return route.fulfill({ json: (req.headers().accept || '').includes('vnd.pgrst.object') ? rows[0] || null : rows });
    });
    const login = async () => {
      await page.getByRole('button', { name: /Prueba recuperación/ }).click();
      await page.locator('input[type="password"]').fill(password);
      await page.getByRole('button', { name: /^Ingresar$/i }).click();
      await page.getByRole('button', { name: /Punto de Venta/i }).click();
    };
    await page.goto('http://127.0.0.1:5174/?demo=0', { waitUntil: 'domcontentloaded' });
    await login();
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
      window.dispatchEvent(new Event('online'));
    });
    await expect(page.getByText(/Modo local activo - solo lectura/i)).toBeHidden({ timeout: 30000 });
    await page.getByRole('button', { name: 'COBRAR', exact: true }).click();
    await page.getByRole('dialog', { name: '¿Quién hizo la venta?' }).locator('.pos-sale-user-option').first().click();
    await expect(page.getByRole('button', { name: 'OK', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'OK', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Cobro pendiente de confirmar' })).toBeVisible();
    await page.screenshot({ path: `.codex-tmp/cobro-pendiente-${failure}.png`, fullPage: true });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await login();
    await expect(page.getByRole('heading', { name: 'Cobro pendiente de confirmar' })).toBeVisible();
    await page.getByRole('button', { name: 'Verificar venta', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Venta exitosa' })).toBeVisible();
    const receipt = page.locator('.sale-success-modal');
    await expect(receipt).toContainText('Empleado confirmado');
    await expect(receipt).toContainText('Producto confirmado');
    await page.screenshot({ path: `.codex-tmp/cobro-recuperado-${failure}.png`, fullPage: true });
    expect(commits).toBe(1);
    expect(requests).toHaveLength(failure === 'lost-response' ? 2 : 1);
    if (requests.length === 2) expect(requests[1]).toEqual(requests[0]);
  });
}
