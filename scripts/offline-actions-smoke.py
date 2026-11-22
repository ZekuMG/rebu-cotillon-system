"""Isolated browser checks. All remote requests use fixtures; no live writes.

Run against npm run dev -- --host 127.0.0.1 --port 5174 --strictPort:
    python scripts/offline-actions-smoke.py
"""
import base64
import hashlib
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse, parse_qs

from playwright.sync_api import sync_playwright, expect

sys.stdout.reconfigure(encoding='utf-8')

def debug(*args, **kwargs):
    if os.environ.get('REBU_TEST_VERBOSE') == '1': print(*args, **kwargs)
OUTPUT = Path('.codex-tmp')
OUTPUT.mkdir(exist_ok=True)
URL = 'http://127.0.0.1:5174/?demo=0'
CAPTURE_LOGIN_SCREENSHOT = os.environ.get('REBU_TEST_SCREENSHOTS', '1') != '0'
USER_ID = '00000000-0000-4000-8000-000000000345'
AUTH_ID = '00000000-0000-4000-8000-000000000789'
PASSWORD = 'fixture-4321'
SALT = '00112233445566778899aabbccddeeff'
NOW = datetime.now(timezone.utc).isoformat()
USER = {'id': USER_ID, 'name': 'Prueba pendientes', 'displayName': 'Prueba pendientes', 'role': 'owner', 'isActive': True, 'permissionsVersion': 1, 'authUserId': AUTH_ID, 'authEmail': 'offline@example.invalid'}
CLOUD_USER = {**USER, 'display_name': USER['name'], 'is_active': True, 'permissions_version': 1, 'auth_user_id': AUTH_ID, 'auth_email': USER['authEmail']}
REGISTER = {'id': 1, 'is_open': True, 'opening_balance': 0, 'closing_time': '23:59'}
PRODUCT = {'id': 8, 'title': 'Globos de prueba', 'price': 1000, 'purchasePrice': 300, 'stock': 10, 'category': '', 'product_type': 'quantity', 'is_active': True, 'created_at': NOW, 'updated_at': NOW}


def encode(value):
    return base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip('=')


def fixture(page, initial_entries=None, role='owner', realtime_handler=None):
    fixture_user = {**USER, 'role': role}
    cloud_user = {**CLOUD_USER, 'role': role}
    now_seconds = int(datetime.now(timezone.utc).timestamp())
    token = f"{encode({'alg': 'HS256', 'typ': 'JWT'})}.{encode({'sub': AUTH_ID, 'aud': 'authenticated', 'role': 'authenticated', 'iat': now_seconds, 'exp': now_seconds + 3600})}.fixture"
    auth_user = {'id': AUTH_ID, 'aud': 'authenticated', 'role': 'authenticated', 'email': USER['authEmail'], 'app_metadata': {'provider': 'email'}, 'user_metadata': {}}
    digest = hashlib.pbkdf2_hmac('sha256', f'rebu-offline-login-v2:{USER_ID}:{PASSWORD}'.encode(), bytes.fromhex(SALT), 150000).hex()
    snapshots = {
        'rebu_local_demo_mode': 'false',
        'party_shared_users_snapshot_v1': {'savedAt': NOW, 'authMode': 'supabase', 'scope': 'active', 'users': [fixture_user]},
        'party_offline_login_verifiers_v1': {'savedAt': NOW, 'verifiers': {USER_ID: {'userId': USER_ID, 'algorithm': 'PBKDF2-SHA256', 'iterations': 150000, 'salt': SALT, 'digest': digest, 'updatedAt': NOW}}},
        'party_cloud_snapshot_core_v2': {'savedAt': NOW, 'inventoryScope': 'full', 'inventory': [PRODUCT], 'categories': [], 'rewards': [], 'members': [], 'offers': [], 'registerState': REGISTER},
        'party_cloud_snapshot_transactions_v1': {'savedAt': NOW, 'transactionsScope': 'full', 'transactions': []},
        'party_cloud_snapshot_dashboard_v2': {'savedAt': NOW, 'dashboardScope': 'full', 'dailyLogs': [], 'expenses': [], 'pastClosures': []},
        'party_pos_snapshot_v1': {'savedAt': NOW, 'posCarts': [{'id': 'offline-fixture-cart', 'cart': [{'id': 'custom_offline', 'title': 'Pedido durante el corte', 'price': 3500, 'quantity': 1, 'product_type': 'quantity', 'isCustom': True, 'cost': 0}], 'selectedClient': {'id': 'guest', 'name': 'Consumidor final'}, 'checkoutDraft': {'hasPosBag': False}}], 'activePosCartId': 'offline-fixture-cart'},
    }
    if initial_entries:
        snapshots['rebu_offline_actions_v1'] = {'version': 1, 'entries': initial_entries}
    page.add_init_script('''(values => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => localStorage.getItem('offline_fixture_online') !== 'false' });
      if (localStorage.getItem('offline_actions_fixture')) return;
      for (const [key, value] of Object.entries(values)) localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
      localStorage.setItem('offline_actions_fixture', 'ready');
    })(''' + json.dumps(snapshots) + ')')
    state = {'request_count': 0, 'online': True, 'sales': [], 'expenses': [], 'product': dict(PRODUCT), 'canonical': None, 'product_writes': 0, 'lose_sale_response': False, 'lose_expense_response': False, 'hold_expense': False, 'held_expense': None, 'expense_requests': 0, 'mutations': []}
    page.route_web_socket('**/realtime/**', realtime_handler or (lambda socket: None))

    def route_request(route):
        req = route.request
        parsed = urlparse(req.url)
        if parsed.hostname in ['127.0.0.1', 'localhost'] or not parsed.scheme.startswith('http'):
            return route.continue_()
        if not state['online']:
            return route.abort('internetdisconnected')
        if parsed.path == '/auth/v1/token':
            return route.fulfill(json={'access_token': token, 'refresh_token': 'fixture-refresh', 'token_type': 'bearer', 'expires_in': 3600, 'user': auth_user})
        if parsed.path == '/auth/v1/user':
            return route.fulfill(json=auth_user)
        if '/rest/v1/' not in parsed.path:
            return route.abort('internetdisconnected')
        endpoint = parsed.path.split('/')[-1]
        state['request_count'] += 1
        if state['request_count'] <= 10 or state['request_count'] % 250 == 0: debug('fixture request', state['request_count'], endpoint, flush=True)
        params = parse_qs(parsed.query)
        if state['request_count'] <= 15 and endpoint == 'products': debug('product query', parsed.query, flush=True)
        if state['request_count'] > 500: raise AssertionError('Fixture pagination did not terminate')
        if req.method == 'GET' and (int(params.get('offset', ['0'])[0]) > 0 or any(value.startswith('gt.') for value in params.get('id', []))): return route.fulfill(json=[])
        if endpoint.startswith('verify_app_user_login'):
            return route.fulfill(json=[cloud_user])
        if endpoint == 'register_sale_transaction':
            body = req.post_data_json
            state['sales'].append(body)
            duplicate = state['canonical'] is not None
            if not duplicate:
                state['canonical'] = {**body['p_sale'], 'id': 88, 'created_at': NOW, 'status': 'completed', 'voided_at': None, 'clients': None, 'sale_items': [{**item, 'cost': 0, 'is_custom': True, 'is_discount': False, 'is_combo': False} for item in body['p_items']]}
                if state['lose_sale_response']:
                    return route.abort('failed')
            return route.fulfill(json={'id': 88, '_duplicate': duplicate})
        if endpoint == 'products' and req.method in ['PATCH', 'POST', 'DELETE']:
            state['product_writes'] += 1
            state['mutations'].append({'table': endpoint, 'method': req.method, 'body': req.post_data_json})
            if req.method == 'PATCH': state['product'] = {**state['product'], **req.post_data_json}
        if endpoint == 'expenses' and req.method == 'POST':
            state['expense_requests'] += 1
            body = req.post_data_json
            row = body[0] if isinstance(body, list) else body
            row = {**row, 'id': 91, 'created_at': NOW}
            state['expenses'].append(row)
            if state['hold_expense']:
                state['held_expense'] = route
                return
            if state['lose_expense_response']: return route.abort('failed')
            return route.fulfill(json=row)
        if endpoint == 'logs' and req.method == 'POST':
            return route.fulfill(json=[{'id': 100, 'created_at': NOW}])
        rows = [REGISTER] if endpoint == 'register_state' else [cloud_user] if 'app_users' in endpoint else [state['product']] if endpoint == 'products' else [state['canonical']] if endpoint == 'sales' and state['canonical'] else state['expenses'] if endpoint == 'expenses' else []
        return route.fulfill(json=(rows[0] if rows else None) if 'vnd.pgrst.object' in req.headers.get('accept', '') else rows)

    page.route('https://**/*', route_request)
    return state


def login(page):
    page.wait_for_timeout(1000)
    if CAPTURE_LOGIN_SCREENSHOT: page.screenshot(path=str(OUTPUT / 'offline-login-diagnostic.png'))
    debug('login screen:', page.locator('body').inner_text()[:250], flush=True)
    page.get_by_role('button', name=re.compile('Prueba pendientes')).click()
    page.locator('input[type="password"]').fill(PASSWORD)
    page.get_by_role('button', name=re.compile('^Ingresar$')).click()
    page.get_by_role('button', name=re.compile('Punto de Venta')).wait_for(state='visible')
    page.wait_for_load_state('networkidle')
    page.wait_for_timeout(300)
    if page.get_by_role('button', name='Cerrar pendientes', exact=True).is_visible(): page.get_by_role('button', name='Cerrar pendientes', exact=True).click()
    page.get_by_role('button', name=re.compile('Punto de Venta')).click()


def network(page, state, online):
    state['online'] = online
    page.evaluate('''online => { localStorage.setItem('offline_fixture_online', String(online)); window.dispatchEvent(new Event(online ? 'online' : 'offline')); }''', online)


def renew_if_needed(page):
    password = page.locator('.swal2-input[type="password"]')
    try:
        password.wait_for(state='visible', timeout=2500)
        password.fill(PASSWORD)
        page.get_by_role('button', name='Reconectar', exact=True).last.click()
    except Exception as error:
        if 'Timeout' not in type(error).__name__:
            raise


def sale_scenario(browser, lose_response=False, recover_in_pos=False, capture_screenshots=True):
    context = browser.new_context(viewport={'width': 1366, 'height': 900})
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: (errors.append(str(error)), print('page error', error, flush=True)))
    state = fixture(page)
    state['lose_sale_response'] = lose_response
    debug('fixture: loading app', flush=True)
    page.goto(URL, wait_until='domcontentloaded')
    debug('fixture: logging in', flush=True)
    login(page)
    debug('fixture: logged in', flush=True)
    debug('fixture: disconnecting', flush=True)
    network(page, state, False)
    expect(page.get_by_text('Sin conexión · acciones pendientes en esta PC', exact=True)).to_be_visible()
    debug('fixture: preparing offline sale', flush=True)
    page.get_by_role('button', name='COBRAR', exact=True).click()
    page.get_by_role('dialog', name='¿Quién hizo la venta?').locator('.pos-sale-user-option').first.click()
    expect(page.get_by_text('Venta guardada en pendientes', exact=True)).to_be_visible()
    page.get_by_role('button', name='Entendido', exact=True).click()
    assert state['sales'] == [], 'An offline draft must not send a sale'
    debug('fixture: reloading', flush=True)
    page.reload(wait_until='domcontentloaded')
    login(page)
    page.get_by_role('button', name=re.compile('^Pendientes')).click()
    panel = page.get_by_role('dialog', name=re.compile('Pendientes sin conexión'))
    expect(panel).to_contain_text('Pedido durante el corte')
    expect(panel.get_by_role('button', name='Confirmar y aplicar')).to_be_disabled()
    if capture_screenshots: page.screenshot(path=str(OUTPUT / 'offline-actions-light.png'))
    page.evaluate("document.documentElement.dataset.theme='dark';document.querySelector('.app-shell').dataset.theme='dark'")
    if capture_screenshots: page.screenshot(path=str(OUTPUT / 'offline-actions-dark.png'))
    network(page, state, True)
    # Reconnection can refresh data, but must not send the queued sale.
    page.wait_for_timeout(1000)
    assert state['sales'] == [], 'Reconnection must not approve a sale'
    reconnect = panel.get_by_role('button', name='Reconectar', exact=True)
    if reconnect.is_visible():
        reconnect.click()
        renew_if_needed(page)
        expect(page.get_by_text('Reconectado', exact=True)).to_be_visible(timeout=30000)
        page.get_by_role('button', name='Entendido', exact=True).click()
    panel.get_by_role('button', name='Confirmar y aplicar').click(timeout=30000)
    renew_if_needed(page)
    if lose_response:
        expect(panel).to_contain_text('Failed to fetch', timeout=15000)
        assert len(state['sales']) == 1
        if recover_in_pos:
            page.reload(wait_until='domcontentloaded')
            login(page)
            if page.get_by_role('button', name='Cerrar pendientes', exact=True).is_visible(): page.get_by_role('button', name='Cerrar pendientes', exact=True).click()
            page.get_by_role('button', name='Verificar venta', exact=True).click()
        else:
            panel.get_by_role('button', name='Confirmar y aplicar').click()
    expect(page.get_by_role('heading', name='Venta exitosa')).to_be_visible(timeout=30000)
    entries = page.evaluate("JSON.parse(localStorage.getItem('rebu_offline_actions_v1')).entries")
    assert entries[0]['status'] == 'applied'
    assert len(state['sales']) == (2 if lose_response else 1)
    if lose_response:
        assert state['sales'][0] == state['sales'][1], 'Retry must preserve operation key and frozen payload'
    assert errors == [], errors
    context.close()
    print('PASS: offline sale, restart, explicit approval' + (', recovery from POS' if recover_in_pos else ', lost response and safe retry' if lose_response else ''))


def general_scenario(browser):
    context = browser.new_context(viewport={'width': 1366, 'height': 900})
    page = context.new_page()
    state = fixture(page)
    debug('fixture: loading app', flush=True)
    page.goto(URL, wait_until='domcontentloaded')
    debug('fixture: logging in', flush=True)
    login(page)
    debug('fixture: logged in', flush=True)
    page.evaluate('''async values => {
      const { createOfflineActionQueue } = await import('/src/utils/offlineActionQueue.js');
      const { projectOfflineTarget } = await import('/src/utils/offlineActionCatalog.js');
      const { mapInventoryRecords } = await import('/src/utils/cloudMappers.js');
      const queue = createOfflineActionQueue({ storage: localStorage });
      const actor = { userId: values.userId, userName: 'Prueba pendientes' };
      queue.enqueue({ type: 'saveEditProduct', label: 'Editar producto', summary: 'Globos de prueba', args: [null, { ...values.product, price: 2000 }, 'Prueba'], actor, targets: [{ table: 'products', id: '8', label: 'Globos de prueba', value: projectOfflineTarget('products', mapInventoryRecords([values.product])[0]) }] });
      queue.enqueue({ type: 'handleAddExpense', label: 'Registrar gasto', summary: 'Flete pendiente', args: [{ description: 'Flete pendiente', note: 'Flete pendiente', amount: 2300, category: 'Varios', paymentMethod: 'Efectivo' }], actor });
    }''', {'userId': USER_ID, 'product': PRODUCT})
    state['product']['price'] = 5000
    debug('fixture: reloading', flush=True)
    page.reload(wait_until='domcontentloaded')
    login(page)
    page.get_by_role('button', name=re.compile('^Pendientes')).click()
    panel = page.get_by_role('dialog', name=re.compile('Pendientes sin conexión'))
    panel.get_by_role('button', name='Confirmar y aplicar').click()
    expect(panel).to_contain_text('Los datos cambiaron en la nube', timeout=15000)
    assert state['product_writes'] == 0
    panel.get_by_role('button', name=re.compile('Registrar gasto')).click()
    panel.get_by_role('button', name='Confirmar y aplicar').click()
    expect(panel.locator('.offline-actions-empty')).to_have_count(0)
    page.wait_for_function("JSON.parse(localStorage.getItem('rebu_offline_actions_v1')).entries[1].status === 'applied'", timeout=15000)
    assert len(state['expenses']) == 1
    assert state['expenses'][0]['amount'] == 2300
    assert state['expenses'][0]['description'] == 'Flete pendiente'
    context.close()
    print('PASS: cloud conflict blocks overwrite; expense needs explicit approval and applies once')


if __name__ == '__main__':
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        try:
            sale_scenario(browser)
            sale_scenario(browser, lose_response=True)
            sale_scenario(browser, lose_response=True, recover_in_pos=True)
            general_scenario(browser)
        finally:
            browser.close()
