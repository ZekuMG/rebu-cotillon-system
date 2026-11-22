"""Extended offline integration checks using isolated browser and cloud fixtures.

Run with the development server on port 5174:
    python scripts/offline-actions-qa.py
"""
import importlib.util
import json
import re
import traceback
from pathlib import Path

from playwright.sync_api import sync_playwright, expect

spec = importlib.util.spec_from_file_location('offline_smoke', Path(__file__).with_name('offline-actions-smoke.py'))
smoke = importlib.util.module_from_spec(spec)
spec.loader.exec_module(smoke)
RESULTS = []


def start(browser, role='owner', context=None):
    context = context or browser.new_context(viewport={'width': 1366, 'height': 900})
    page = context.new_page()
    page.set_default_timeout(15000)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    state = smoke.fixture(page, role=role)
    page.goto(smoke.URL, wait_until='networkidle')
    smoke.login(page)
    page.wait_for_load_state('networkidle')
    return context, page, state, errors


def seed(page, type='handleAddExpense', actor=None, args=None):
    page.evaluate('''async input => {
      const { createOfflineActionQueue } = await import('/src/utils/offlineActionQueue.js');
      createOfflineActionQueue({ storage: localStorage }).enqueue({ type: input.type, label: input.label,
        summary: 'Prueba de confirmación', actor: input.actor, args: input.args });
      window.dispatchEvent(new StorageEvent('storage', { key: 'rebu_offline_actions_v1' }));
    }''', {'type': type, 'label': 'Registrar gasto' if type == 'handleAddExpense' else type,
           'actor': actor or {'userId': smoke.USER_ID, 'userName': 'Prueba pendientes'},
           'args': args or [{'description': 'Flete de prueba', 'amount': 2300, 'category': 'Varios', 'paymentMethod': 'Efectivo'}]})


def entries(page):
    return page.evaluate("JSON.parse(localStorage.getItem('rebu_offline_actions_v1') || '{\"entries\":[]}').entries")


def panel(page):
    dialog = page.get_by_role('dialog', name=re.compile('Pendientes sin conexión'))
    if not dialog.is_visible(): page.get_by_role('button', name=re.compile('^Pendientes')).evaluate('(button) => button.click()')
    expect(dialog).to_be_visible()
    return dialog


def reconnect(page, state):
    smoke.network(page, state, True)
    dialog = panel(page)
    button = dialog.get_by_role('button', name='Reconectar', exact=True)
    if button.is_visible():
        button.click()
        smoke.renew_if_needed(page)
        expect(page.get_by_text('Reconectado', exact=True)).to_be_visible(timeout=30000)
        page.get_by_role('button', name='Entendido', exact=True).click()
    expect(dialog.get_by_role('button', name='Confirmar y aplicar')).to_be_enabled(timeout=30000)
    return dialog


def wait_status(page, status, index=0):
    try:
        page.wait_for_function("input => JSON.parse(localStorage.getItem('rebu_offline_actions_v1')).entries[input.index].status === input.status", arg={'index': index, 'status': status})
    except Exception:
        print('Journal after failure:', json.dumps(entries(page), ensure_ascii=False), flush=True)
        raise


def charge(page):
    page.get_by_role('button', name='COBRAR', exact=True).click()
    page.get_by_role('dialog', name='¿Quién hizo la venta?').locator('.pos-sale-user-option').first.click()


def product_form(browser):
    context, page, state, errors = start(browser)
    try:
        page.get_by_role('button', name='Inventario', exact=True).click()
        page.get_by_text(smoke.PRODUCT['title'], exact=True).filter(visible=True).first.click()
        page.get_by_role('button', name='Editar Detalles', exact=True).click()
        form = page.locator('form').filter(has=page.get_by_role('button', name='Guardar Cambios', exact=True))
        form.locator('input[type="number"]').nth(1).fill('1850')
        form.locator('textarea').fill('Precio registrado durante el corte')
        smoke.network(page, state, False)
        navigations = []
        page.on('framenavigated', lambda frame: navigations.append(frame.url) if frame == page.main_frame else None)
        form.get_by_role('button', name='Guardar Cambios', exact=True).click()
        expect(page.get_by_text('Guardado en pendientes', exact=True)).to_be_visible()
        page.get_by_role('button', name='Entendido', exact=True).click()
        saved = entries(page)
        assert len(saved) == 1 and float(saved[0]['args'][1]['price']) == 1850
        assert saved[0]['args'][2] == 'Precio registrado durante el corte'
        assert state['product_writes'] == 0 and not navigations
        dialog = reconnect(page, state)
        dialog.get_by_role('button', name='Confirmar y aplicar', exact=True).click()
        wait_status(page, 'applied')
        assert state['product_writes'] == 1
        assert state['product']['price'] == 1850 and state['product']['stock'] == 10
        assert not errors, errors
    finally:
        context.close()


def expense_lost_response(browser):
    context, page, state, errors = start(browser)
    try:
        seed(page)
        state['lose_expense_response'] = True
        dialog = panel(page)
        dialog.get_by_role('button', name='Confirmar y aplicar').click()
        wait_status(page, 'review')
        expect(dialog.locator('.offline-action-confirm')).to_be_disabled()
        assert state['expense_requests'] == 1 and len(state['expenses']) == 1
        page.reload(wait_until='networkidle')
        smoke.login(page)
        dialog = panel(page)
        expect(dialog).to_contain_text('Revisar resultado')
        expect(dialog.locator('.offline-action-confirm')).to_be_disabled()
        assert state['expense_requests'] == 1
        dialog.get_by_role('button', name='Descartar', exact=True).click()
        dialog.get_by_role('button', name='Confirmar descarte', exact=True).click()
        wait_status(page, 'discarded')
        assert len(state['expenses']) == 1, 'Descartar el pendiente no debe revertir un gasto ya confirmado en la nube'
        assert not errors, errors
    finally:
        context.close()


def interrupted_confirmation(browser):
    context, page, state, errors = start(browser)
    try:
        seed(page)
        state['hold_expense'] = True
        panel(page).get_by_role('button', name='Confirmar y aplicar').click()
        wait_status(page, 'applying')
        page.wait_for_timeout(200)
        assert state['held_expense'] is not None
        assert state['expense_requests'] == 1
        state['hold_expense'] = False
        page.reload(wait_until='networkidle')
        try: state['held_expense'].abort('failed')
        except Exception: pass  # The browser may already have cancelled the old request.
        smoke.login(page)
        wait_status(page, 'review')
        dialog = panel(page)
        expect(dialog.locator('.offline-action-confirm')).to_be_disabled()
        assert state['expense_requests'] == 1
        assert not errors, errors
    finally:
        context.close()


def rapid_confirmation(browser):
    context, page, state, errors = start(browser)
    try:
        seed(page)
        state['hold_expense'] = True
        panel(page)
        page.evaluate("document.querySelector('.offline-action-confirm').click(); document.querySelector('.offline-action-confirm').click()")
        wait_status(page, 'applying')
        page.wait_for_timeout(300)
        assert state['expense_requests'] == 1
        state['held_expense'].fulfill(json=state['expenses'][0])
        wait_status(page, 'applied')
        assert state['expense_requests'] == 1
        assert not errors, errors
    finally:
        context.close()


def two_windows(browser):
    context, page, state, errors = start(browser)
    try:
        assert page.evaluate("Boolean(navigator.locks)"), 'Este escenario necesita Web Locks'
        seed(page)
        state['hold_expense'] = True
        panel(page).get_by_role('button', name='Confirmar y aplicar').click()
        wait_status(page, 'applying')
        page.wait_for_timeout(200)
        _, second, second_state, second_errors = start(browser, context=context)
        second_panel = panel(second)
        expect(second_panel).to_contain_text('Aplicando…')
        # Mounting another window must not classify an active operation as a crash.
        assert entries(second)[0]['status'] == 'applying'
        expect(second_panel.locator('.offline-action-confirm')).to_be_disabled()
        state['held_expense'].fulfill(json=state['expenses'][0])
        wait_status(page, 'applied')
        wait_status(second, 'applied')
        assert state['expense_requests'] == 1 and second_state['expense_requests'] == 0
        assert not errors and not second_errors, [errors, second_errors]
    finally:
        context.close()


def quota_failure(browser):
    context, page, state, errors = start(browser)
    try:
        smoke.network(page, state, False)
        page.evaluate('''() => {
          const original = Storage.prototype.setItem;
          Storage.prototype.setItem = function(key, value) {
            if (key === 'rebu_offline_actions_v1') throw new DOMException('Sin espacio local', 'QuotaExceededError');
            return original.call(this, key, value);
          };
        }''')
        charge(page)
        expect(page.get_by_role('dialog', name='Error', exact=True)).to_be_visible()
        page.get_by_role('button', name='OK', exact=True).click()
        assert entries(page) == [] and state['sales'] == []
        expect(page.locator('.pos-cart-panel')).to_contain_text('Pedido durante el corte')
        assert not errors, errors
    finally:
        context.close()


def corrupted_journal(browser):
    context, page, state, errors = start(browser)
    try:
        page.evaluate("localStorage.setItem('rebu_offline_actions_v1', '{registro roto'); window.dispatchEvent(new StorageEvent('storage', { key: 'rebu_offline_actions_v1' }))")
        dialog = panel(page)
        expect(dialog.locator('.offline-actions-error')).to_be_visible()
        dialog.get_by_role('button', name='Cerrar pendientes').click()
        smoke.network(page, state, False)
        charge(page)
        expect(page.get_by_role('dialog', name='Error', exact=True)).to_be_visible()
        assert page.evaluate("localStorage.getItem('rebu_offline_actions_v1')") == '{registro roto'
        assert state['sales'] == []
        assert not errors, errors
    finally:
        context.close()


def permissions_and_privacy(browser):
    context, page, state, errors = start(browser, role='seller')
    try:
        seed(page)
        dialog = panel(page)
        expect(dialog.locator('.offline-action-confirm')).to_be_disabled()
        assert state['expense_requests'] == 0
        dialog.get_by_role('button', name='Cerrar pendientes').click()
        seed(page, actor={'userId': 'otro-usuario', 'userName': 'Persona privada'}, args=[{'description': 'Dato privado de otra persona', 'amount': 99}])
        dialog = panel(page)
        expect(dialog).not_to_contain_text('Dato privado de otra persona')
        expect(dialog).not_to_contain_text('Persona privada')
        assert len(entries(page)) == 2
        assert not errors, errors
    finally:
        context.close()


def pending_stock(browser):
    context, page, state, errors = start(browser)
    try:
        # Seed a first pending sale and restore a second cart against the same
        # cached stock, as after closing and reopening the app during an outage.
        seed(page, type='offlineSale', args=[{
            'cartId': 'previous-cart', 'createdAt': smoke.NOW, 'status': 'pending',
            'request': {'operationKey': 'previous-stock-sale', 'salePayload': {'total': 6000}, 'stockDeltaByProduct': {'8': -6}},
            'logDetails': {'items': [{'title': 'Globos de prueba', 'quantity': 6}]},
        }])
        page.evaluate('''input => {
          localStorage.setItem('party_pos_snapshot_v1', JSON.stringify({ savedAt: input.now, activePosCartId: 'second-cart', posCarts: [{ id: 'second-cart', cart: [{ ...input.product, quantity: 6 }], selectedClient: { id: 'guest', name: 'Consumidor final' } }] }));
        }''', {'now': smoke.NOW, 'product': smoke.PRODUCT})
        smoke.network(page, state, False)
        page.reload(wait_until='networkidle')
        smoke.login(page)
        charge(page)
        expect(page.get_by_text('Falta Stock', exact=True)).to_be_visible()
        assert len(entries(page)) == 1 and not state['sales']
        assert not errors, errors
    finally:
        context.close()


def dependent_sale_discard(browser):
    context, page, state, errors = start(browser)
    try:
        for cart_id, previous, points in [('first-member-sale', 20, 24), ('second-member-sale', 24, 30)]:
            seed(page, type='offlineSale', args=[{
                'cartId': cart_id, 'status': 'pending', 'createdAt': smoke.NOW,
                'request': {'operationKey': cart_id, 'salePayload': {'client_id': 3, 'total': 1000},
                            'stockDeltaByProduct': {}, 'clientPointUpdates': [{'client_id': 3, 'expected_points': previous, 'points': points}]},
                'logDetails': {'items': [{'title': cart_id, 'quantity': 1, 'price': 1000}]},
            }])
        dialog = panel(page)
        dialog.get_by_role('button', name='Descartar', exact=True).click()
        dialog.get_by_role('button', name='Confirmar descarte', exact=True).click()
        expect(page.get_by_text('No se pudo descartar', exact=True)).to_be_visible()
        expect(page.get_by_text(re.compile('Hay ventas posteriores de este socio'))).to_be_visible()
        assert [entry['status'] for entry in entries(page)] == ['pending', 'pending']
        page.get_by_role('button', name='Entendido', exact=True).click()
        dialog.locator('.offline-actions-list button').nth(1).click()
        dialog.get_by_role('button', name='Descartar', exact=True).click()
        dialog.get_by_role('button', name='Confirmar descarte', exact=True).click()
        wait_status(page, 'discarded', index=1)
        dialog.get_by_role('button', name='Descartar', exact=True).click()
        dialog.get_by_role('button', name='Confirmar descarte', exact=True).click()
        wait_status(page, 'discarded', index=0)
        assert not state['sales'] and not errors, [state['sales'], errors]
    finally:
        context.close()


CASES = [
    ('Formulario real de producto sin conexión y confirmación', product_form),
    ('Respuesta perdida de gasto: revisión y descarte sin duplicar', expense_lost_response),
    ('Reinicio durante confirmación', interrupted_confirmation),
    ('Doble clic de confirmación', rapid_confirmation),
    ('Dos ventanas y bloqueo de escritura', two_windows),
    ('Almacenamiento local lleno', quota_failure),
    ('Registro local dañado sin pérdida del original', corrupted_journal),
    ('Permisos revocados y privacidad entre usuarios', permissions_and_privacy),
    ('Stock compartido por varias ventas pendientes', pending_stock),
    ('Descarte de ventas con puntos dependientes', dependent_sale_discard),
]


if __name__ == '__main__':
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        try:
            for name, scenario in CASES:
                try:
                    scenario(browser)
                    RESULTS.append({'name': name, 'passed': True})
                    print('PASS:', name, flush=True)
                except Exception:
                    failure = traceback.format_exc()
                    RESULTS.append({'name': name, 'passed': False, 'error': failure})
                    print('FAIL:', name, '\n' + failure, flush=True)
        finally:
            browser.close()
    Path('.codex-tmp/offline-qa-results.json').write_text(json.dumps(RESULTS, ensure_ascii=False, indent=2), encoding='utf-8')
    raise SystemExit(1 if any(not result['passed'] for result in RESULTS) else 0)
