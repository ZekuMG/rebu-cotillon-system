"""Exercise real transport failures while serving packaged-app assets locally."""
import importlib.util
import json
import re
import traceback
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

spec = importlib.util.spec_from_file_location('offline_smoke', Path(__file__).with_name('offline-actions-smoke.py'))
smoke = importlib.util.module_from_spec(spec)
spec.loader.exec_module(smoke)


def run_case(browser, cold=False, in_flight=False, wan_loss=False, capture_screenshots=True):
    context = browser.new_context(viewport={'width': 1366, 'height': 900})
    page = context.new_page()
    page.set_default_timeout(15000)
    sockets = []
    offline_sockets = []
    joins = []
    offline = {'value': cold}
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    def socket_route(socket):
        sockets.append(socket)
        smoke.debug('transport: socket', len(sockets), 'offline', offline['value'], flush=True)
        if offline['value']: offline_sockets.append(socket)
        def receive(message):
            # Hold new handshakes while the WAN is unavailable. Closing from
            # inside a synchronous route callback can deadlock Playwright.
            if offline['value']: return
            data = json.loads(message)
            if isinstance(data, list):
                join_ref, ref, topic, event, _payload = data
                if event not in ['phx_join', 'phx_leave', 'heartbeat']: return
                if event == 'phx_join': joins.append(topic)
                socket.send(json.dumps([join_ref, ref, topic, 'phx_reply', {'status': 'ok', 'response': {}}]))
            else:
                if data['event'] not in ['phx_join', 'phx_leave', 'heartbeat']: return
                if data['event'] == 'phx_join': joins.append(data['topic'])
                socket.send(json.dumps({**data, 'event': 'phx_reply', 'payload': {'status': 'ok', 'response': {}}}))
        socket.on_message(receive)
    state = smoke.fixture(page, realtime_handler=socket_route)
    if cold:
        state['online'] = False
        page.add_init_script("localStorage.setItem('offline_fixture_online', 'false')")
    held = []
    try:
        print('Starting offline transport case', {'cold': cold, 'in_flight': in_flight, 'wan_loss': wan_loss}, flush=True)
        page.goto(smoke.URL, wait_until='domcontentloaded')
        smoke.login(page)
        smoke.debug('transport: logged in', flush=True)
        if not cold:
            expect(page.locator('.app-cloud-status')).to_contain_text('Conectada', timeout=15000)
            for _ in range(100):
                if joins: break
                page.wait_for_timeout(50)
            # Development StrictMode may complete an initial join before its
            # deliberate teardown; count fresh joins from the settled baseline.
            assert joins, 'Initial subscription did not settle'
            smoke.debug('transport: initial join settled', len(joins), flush=True)
            bag = page.get_by_role('checkbox', name=re.compile('Lleva bolsita'))
            bag.click()
            expect(bag).to_be_checked()
            # An older persisted draft must not overwrite the live cart on a cut.
            page.evaluate("const key = 'party_pos_snapshot_v1'; const draft = JSON.parse(localStorage.getItem(key)); draft.posCarts[0].checkoutDraft.hasPosBag = false; localStorage.setItem(key, JSON.stringify(draft))")
            if in_flight:
                page.route('**/rest/v1/**', lambda route: held.append(route))
                page.get_by_role('button', name='Actualizar', exact=True).click()
                page.wait_for_function("document.querySelector('.app-cloud-status')?.textContent.includes('Conectando')")
                for _ in range(100):
                    if held: break
                    page.wait_for_timeout(50)
                assert held, 'The test needs an actual pending cloud request'
            offline['value'] = True
            if wan_loss:
                # Wi-Fi remains connected, but the remote service is unreachable.
                state['online'] = False
                smoke.debug('transport: starting WAN refresh', flush=True)
                page.get_by_role('button', name='Actualizar', exact=True).click()
                smoke.debug('transport: WAN refresh started', flush=True)
            else:
                smoke.network(page, state, False)
            for socket in list(sockets):
                try: socket.close()
                except Exception: pass
            smoke.debug('transport: sockets closed', flush=True)
        # A cached counter must remain usable immediately, without waiting for
        # the 10/30-second cloud request deadlines.
        expect(page.locator('.app-cloud-status')).to_contain_text('Sin conexión', timeout=1500)
        smoke.debug('transport: offline status visible', flush=True)
        page.get_by_role('button', name=re.compile('^Pendientes')).click(timeout=2000)
        dialog = page.get_by_role('dialog', name=re.compile('Pendientes sin conexión'))
        expect(dialog).to_be_visible()
        dialog.get_by_role('button', name='Cerrar pendientes').click(timeout=2000)
        smoke.debug('transport: pending panel responsive', flush=True)
        expect(page.locator('.pos-cart-panel')).to_contain_text('Pedido durante el corte')
        if not cold: expect(bag).to_be_checked()
        attempts_at_cut = len(sockets)
        page.wait_for_timeout(2500)
        smoke.debug('transport: offline backoff observed', len(sockets) - attempts_at_cut, flush=True)
        if not wan_loss:
            assert len(sockets) == (0 if cold else attempts_at_cut), f'Realtime keeps connecting offline: {len(sockets)} attempts'
        else:
            assert len(sockets) - attempts_at_cut <= 3, 'Realtime is reconnecting without backoff'
        assert not errors, errors
        smoke.debug('transport: taking offline screenshot', flush=True)
        if capture_screenshots:
            page.screenshot(path=f'.codex-tmp/offline-loading-{cold}-{in_flight}-{wan_loss}.png')
        smoke.debug('transport: screenshot saved', flush=True)
        if in_flight:
            page.unroute('**/rest/v1/**')
            for route in held:
                try: route.abort('internetdisconnected')
                except Exception: pass
            held.clear()
        # Restore actual WebSocket joins and REST reads without approving work.
        joins_before = len(joins)
        offline['value'] = False
        smoke.network(page, state, True)
        for socket in offline_sockets:
            socket.close()
        smoke.debug('transport: network restored', flush=True)
        expect(page.locator('.app-cloud-status')).to_contain_text('Conectada', timeout=15000)
        assert len(joins) == joins_before + 1, f'Expected one fresh subscription: {joins}'
        page.evaluate("window.dispatchEvent(new Event('online'))")
        page.wait_for_timeout(300)
        assert len(joins) == joins_before + 1, 'Repeated online events created extra subscriptions'
        assert not state['sales'] and not state['expenses'], 'Reconnection applied unapproved work'
        expect(page.locator('.pos-cart-panel')).to_contain_text('Pedido durante el corte')
        if not cold: expect(bag).to_be_checked()
        assert not errors, errors
        print('PASS:', 'cold offline startup' if cold else 'WAN failure while Wi-Fi stays connected' if wan_loss else 'offline interrupts pending cloud reads' if in_flight else 'live connection loss', flush=True)
    except Exception:
        print('Transport state:', {'sockets': len(sockets), 'joins': len(joins), 'requests': state['request_count'], 'errors': errors}, flush=True)
        print('Transport assertion failed:', traceback.format_exc(), flush=True)
        raise
    finally:
        for route in held:
            try: route.abort('internetdisconnected')
            except Exception: pass
        for socket in sockets:
            socket.on_message(lambda _message: None)
        smoke.debug('transport: closing test context', flush=True)
        context.close()


if __name__ == '__main__':
    failures = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        try:
            for options in [{'cold': True}, {}, {'in_flight': True}, {'wan_loss': True}]:
                try: run_case(browser, **options)
                except Exception:
                    failures.append({'options': options, 'error': traceback.format_exc()})
                    print('FAIL:', options, failures[-1]['error'], flush=True)
        finally: browser.close()
    Path('.codex-tmp/offline-loading-results.json').write_text(json.dumps(failures, indent=2), encoding='utf-8')
    raise SystemExit(bool(failures))
