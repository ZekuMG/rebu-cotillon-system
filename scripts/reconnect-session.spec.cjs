const { test, expect } = require('playwright/test');
const { pbkdf2Sync } = require('node:crypto');

test('reconectar recupera la sesión del mismo usuario y conserva el carrito y los pagos', async ({ page }) => {
  test.setTimeout(60000);
  const userId = '00000000-0000-4000-8000-000000000123';
  const authId = '00000000-0000-4000-8000-000000000456';
  const password = 'reconnect-fixture';
  const salt = '00112233445566778899aabbccddeeff';
  const digest = pbkdf2Sync(`rebu-offline-login-v2:${userId}:${password}`, Buffer.from(salt, 'hex'), 150000, 32, 'sha256').toString('hex');
  const now = new Date().toISOString();
  const user = { id: userId, name: 'Usuario de prueba', displayName: 'Usuario de prueba', role: 'owner', isActive: true, authUserId: authId, authEmail: 'fixture@example.invalid' };
  const cloudUser = { ...user, display_name: user.name, is_active: true, auth_user_id: authId, auth_email: user.authEmail };
  const register = { id: 1, is_open: true, opening_balance: 0, closing_time: '23:59' };
  const session = { sessionId: 'remembered-fixture', userId, userName: user.name, role: user.role, rememberedSession: true, supabaseAuth: { signedIn: true, authUserId: authId } };
  const local = {
    rebu_local_demo_mode: 'false',
    party_offline_login_verifiers_v1: { savedAt: now, verifiers: { [userId]: { userId, algorithm: 'PBKDF2-SHA256', iterations: 150000, salt, digest, updatedAt: now } } },
    party_shared_users_snapshot_v1: { savedAt: now, authMode: 'supabase', scope: 'active', users: [user] },
    party_cloud_snapshot_core_v2: { savedAt: now, inventoryScope: 'full', inventory: [], categories: [], rewards: [], members: [], offers: [], registerState: register },
    party_cloud_snapshot_transactions_v1: { savedAt: now, transactionsScope: 'full', transactions: [] },
    party_cloud_snapshot_dashboard_v2: { savedAt: now, dashboardScope: 'full', dailyLogs: [], expenses: [], pastClosures: [] },
    party_pos_snapshot_v1: { savedAt: now, activePosCartId: 'retained-cart', posCarts: [{
      id: 'retained-cart', cart: [{ id: 'custom_retained', title: 'Pedido conservado', quantity: 1, price: 3500, product_type: 'quantity', isCustom: true }],
      selectedClient: { id: 'guest', name: 'Consumidor final' }, checkoutDraft: {
        hasPosBag: true, isSplitPaymentMode: true, activeSplitLineIndex: 1,
        paymentLines: [{ id: 'split_primary', method: 'Efectivo', amount: 1000, installments: 1, cashReceived: '' }, { id: 'split_secondary', method: 'MercadoPago', amount: 2550, installments: 1, cashReceived: '' }],
      },
    }] },
  };
  await page.addInitScript(({ local, remembered }) => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    for (const [key, value] of Object.entries(local)) localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
    sessionStorage.setItem('party_remembered_session_v1', JSON.stringify(remembered));
  }, { local, remembered: { userId, sessionMeta: session } });
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: authId, aud: 'authenticated', role: 'authenticated', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 })}.fixture`;
  let signIns = 0;
  let authenticatedReads = 0;
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.routeWebSocket('**/*', (socket) => socket.close());
  await page.route('**/*', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (['localhost', '127.0.0.1'].includes(url.hostname)) return route.continue();
    if (url.pathname === '/auth/v1/token') {
      expect(req.postDataJSON().password).toBe(password);
      signIns++;
      return route.fulfill({ json: { access_token: token, refresh_token: 'fixture-refresh', token_type: 'bearer', expires_in: 3600, user: { id: authId, aud: 'authenticated', role: 'authenticated', email: user.authEmail, app_metadata: { provider: 'email' }, user_metadata: {} } } });
    }
    if (!url.pathname.includes('/rest/v1/')) return route.abort();
    const endpoint = url.pathname.split('/').pop();
    if (endpoint.startsWith('verify_app_user_login')) return route.fulfill({ json: req.postDataJSON().p_password === password ? [cloudUser] : [] });
    if (/app_users/.test(endpoint)) return route.fulfill({ json: [cloudUser] });
    if (req.headers().authorization !== `Bearer ${token}`) return route.fulfill({ status: 401, json: { code: '42501', message: `permission denied for table ${endpoint}` } });
    authenticatedReads++;
    const rows = endpoint === 'register_state' ? [register] : [];
    return route.fulfill({ json: (req.headers().accept || '').includes('vnd.pgrst.object') ? rows[0] || null : rows });
  });
  await page.goto(process.env.REBU_RECONNECT_URL || 'http://127.0.0.1:5174/?demo=0', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: user.name, exact: false }).click();
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: /^Ingresar$/i }).click();
  await expect(page.getByText('Modo local activo - solo lectura', { exact: true })).toBeVisible({ timeout: 40000 });
  await page.getByRole('button', { name: /Punto de Venta/i }).click();
  await expect(page.locator('.pos-cart-panel')).toContainText('Pedido conservado');
  const anchors = async () => page.locator('main, .pos-cart-header, .pos-cart-checkout, .pos-charge-button')
    .evaluateAll((nodes) => nodes.map((node) => { const { x, y, width, height } = node.getBoundingClientRect(); return { x, y, width, height }; }));
  await expect(page.locator('.pos-cart-header')).toBeVisible();
  const beforeReconnect = await anchors();
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
    window.dispatchEvent(new Event('online'));
  });
  await page.getByRole('button', { name: 'Reconectar', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Volvé a ingresar tu clave' });
  await expect(dialog).toBeVisible();
  await page.screenshot({ path: '.codex-tmp/reconectar-con-clave.png', fullPage: true });
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(page.locator('.pos-cart-panel')).toContainText('Pedido conservado');
  expect(signIns).toBe(0);
  await page.getByRole('button', { name: 'Reconectar', exact: true }).click();
  await dialog.locator('input[type="password"]').fill('wrong-password');
  await dialog.getByRole('button', { name: 'Reconectar', exact: true }).click();
  await expect(dialog).toContainText('La clave no es correcta');
  expect(signIns).toBe(0);
  await dialog.locator('input[type="password"]').fill(password);
  await dialog.getByRole('button', { name: 'Reconectar', exact: true }).click();
  await expect(page.getByText('Modo local activo - solo lectura', { exact: true })).toBeHidden({ timeout: 30000 });
  expect(await anchors()).toEqual(beforeReconnect);
  await expect(page.locator('.pos-cart-panel')).toContainText('Pedido conservado');
  await expect(page.getByRole('checkbox', { name: /Lleva bolsita/i })).toHaveAttribute('aria-checked', 'true');
  const values = await page.locator('.pos-cart-checkout input[type="number"]').evaluateAll((inputs) => inputs.map((input) => input.value));
  expect(values).toEqual(['1000', '2550']);
  expect(signIns).toBe(1);
  expect(authenticatedReads).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Entendido', exact: true }).click();
  await page.getByRole('button', { name: /Cargar todo de nuevo/i }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: /Cargar todo de nuevo/i })).toBeEnabled();
  expect(signIns).toBe(1);
  expect(errors).toEqual([]);
});
