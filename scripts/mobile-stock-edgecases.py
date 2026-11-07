"""Adversarial mobile browser cases. Uses fake data, no real inventory writes."""
import glob
import os
from pathlib import Path
import sys

sys.path.insert(0, str(Path('output/mobile-python').resolve()))
from playwright.sync_api import sync_playwright, expect
from importlib.machinery import SourceFileLoader

smoke = SourceFileLoader('mobile_smoke', 'scripts/mobile-stock-smoke.py').load_module()
def wait_js(page, expression):
    # wait_for_function(string) uses eval in the page, correctly blocked by CSP.
    for _ in range(50):
        if page.evaluate(expression): return
        page.wait_for_timeout(100)
    raise AssertionError(expression)
with sync_playwright() as p:
    exe = sorted(glob.glob(os.path.join(os.environ['LOCALAPPDATA'], 'ms-playwright', 'chromium-*', 'chrome-win64', 'chrome.exe')))[-1]
    browser = p.chromium.launch(executable_path=exe, headless=True)
    def setup():
        context = browser.new_context(viewport={'width': 390, 'height': 844}, service_workers='block')
        state = smoke.mock_api(context)
        page = context.new_page()
        page.on('dialog', lambda dialog: dialog.accept() if dialog.type == 'beforeunload' else dialog.dismiss())
        smoke.sign_in(page)
        return context, state, page

    # A lost receipt survives an actual closed tab. Even a now-read-only user
    # can discover that it committed, without submitting a second receipt.
    context, state, page = setup()
    page.get_by_role('button', name='Globo metalizado', exact=False).click()
    page.get_by_label('Cantidad que ingresa', exact=False).fill('2')
    page.get_by_label('Motivo del movimiento').fill('Recepción con respuesta perdida')
    state['lose_response'] = True
    page.get_by_role('button', name='Confirmar movimiento').click()
    expect(page.get_by_role('button', name='Comprobar movimiento')).to_be_enabled()
    page.close(run_before_unload=False)
    state['can_edit'] = False
    page = context.new_page()
    page.goto(smoke.ORIGIN)
    expect(page.get_by_role('button', name='Comprobar movimiento')).to_be_enabled()
    page.get_by_role('button', name='Comprobar movimiento').click()
    expect(page.get_by_text('Movimiento confirmado ·', exact=False)).to_be_visible()
    assert len(state['calls']) == 1 and state['product']['stock'] == 14
    context.close()

    # Authentication errors must not erase the idempotency key for a request
    # whose outcome is still unknown.
    context, state, page = setup()
    page.get_by_role('button', name='Globo metalizado', exact=False).click()
    page.get_by_label('Cantidad que ingresa', exact=False).fill('1')
    page.get_by_label('Motivo del movimiento').fill('Ingreso previo al vencimiento')
    state['lose_response'] = True
    page.get_by_role('button', name='Confirmar movimiento').click()
    expect(page.get_by_role('button', name='Comprobar movimiento')).to_be_enabled()
    state['deny_status'] = True
    page.get_by_role('button', name='Comprobar movimiento').click()
    expect(page.get_by_role('heading', name='El stock, a mano.')).to_be_visible()
    assert page.evaluate("Object.keys(localStorage).filter(k=>k.startsWith('rebu-stock-operation-v2:')).length") == 1
    state['deny_status'] = False
    page.get_by_label('Contraseña', exact=True).fill('contraseña-de-prueba')
    page.get_by_role('button', name='Ingresar a Rebu Stock').click()
    expect(page.get_by_role('button', name='Comprobar movimiento')).to_be_enabled()
    page.get_by_role('button', name='Comprobar movimiento').click()
    expect(page.get_by_text('Movimiento confirmado ·', exact=False)).to_be_visible()
    assert len(state['calls']) == 1
    context.close()

    # A delayed product lookup must not open the former user's editor after logout.
    context, state, page = setup()
    state['hold_product'] = True
    page.get_by_role('button', name='Globo metalizado', exact=False).click()
    page.wait_for_timeout(100)
    page.get_by_role('button', name='Cerrar sesión de', exact=False).click()
    expect(page.get_by_role('heading', name='El stock, a mano.')).to_be_visible()
    state['held_product'].fulfill(json=state['product'])
    page.wait_for_timeout(150)
    assert page.get_by_role('dialog').count() == 0
    expect(page.get_by_role('heading', name='El stock, a mano.')).to_be_visible()
    context.close()

    # The same rule applies to a profile refresh started while the user was active.
    context, state, page = setup()
    state['hold_profile'] = True
    page.evaluate("window.dispatchEvent(new Event('focus'))")
    page.wait_for_timeout(100)
    page.get_by_role('button', name='Cerrar sesión de', exact=False).click()
    state['held_profile'].fulfill(json={'id': smoke.USER, 'display_name': 'Old session', 'can_edit': True})
    page.wait_for_timeout(150)
    expect(page.get_by_role('heading', name='El stock, a mano.')).to_be_visible()
    context.close()

    # A camera permission dialog can resolve after the scanner was closed.
    context, state, page = setup()
    page.evaluate("""Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {configurable:true,value:()=>new Promise(resolve=>{window.__requestedCamera=true;window.__grantCamera=()=>{const c=document.createElement('canvas');c.width=640;c.height=480;const s=c.captureStream(1);window.__lateTracks=s.getTracks();resolve(s)}})})""")
    page.get_by_role('button', name='Escanear un producto', exact=False).click()
    wait_js(page, 'window.__requestedCamera === true')
    page.get_by_role('button', name='Cerrar cámara').click()
    page.evaluate('window.__grantCamera()')
    wait_js(page, 'window.__lateTracks.every(t=>t.readyState === "ended")')
    assert page.get_by_role('dialog').count() == 0
    context.close()

    # Duplicate rows across pages must not move the next server offset backwards.
    context, state, page = setup()
    items = [{**smoke.PRODUCT, 'id': str(1000+i), 'title': f'Artículo {i}'} for i in range(89)]
    state['pages'] = {0: {'products': items[:30], 'has_more': True}, 30: {'products': [items[29], *items[30:59]], 'has_more': True}, 60: {'products': items[59:], 'has_more': False}}
    page.get_by_role('button', name='Actualizar productos').click()
    expect(page.get_by_text('30+ productos', exact=True)).to_be_visible()
    page.get_by_role('button', name='Ver más productos').click()
    expect(page.get_by_text('59+ productos', exact=True)).to_be_visible()
    page.get_by_role('button', name='Ver más productos').click()
    expect(page.get_by_text('89 productos', exact=True)).to_be_visible()
    assert [q['p_offset'] for q in state['queries']][-3:] == [0, 30, 60]
    context.close()

    # Long and hostile strings stay text, and stock figures fit narrow screens.
    context, state, page = setup()
    state['product'].update(title='Producto'+'X'*130+'<img id="injected" src=x onerror=alert(1)>', brand='Marca'+'Y'*110, barcode='0'*120, stock=2147483647)
    page.get_by_role('button', name='Actualizar productos').click()
    expect(page.get_by_text('2.147.483.647 un.', exact=True)).to_be_visible()
    assert page.locator('#injected').count() == 0
    for width,height in [(320,740),(390,844),(768,1024),(844,390)]:
        page.set_viewport_size({'width': width, 'height': height})
        page.screenshot(path=str(smoke.OUT / f'long-content-{width}.png'), full_page=True)
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), (width, page.evaluate("Array.from(document.querySelectorAll('body *')).filter(e=>e.getBoundingClientRect().right>innerWidth+1).slice(0,6).map(e=>e.className)"))
    page.get_by_role('button', name='ProductoXXXX', exact=False).click()
    assert page.get_by_role('dialog').evaluate('(el)=>el.scrollWidth <= el.clientWidth')
    page.get_by_label('Cantidad que ingresa', exact=False).fill('2')
    expect(page.get_by_role('button', name='Confirmar movimiento')).to_be_disabled()
    page.get_by_role('dialog').get_by_role('button', name='Productos', exact=True).click()
    expect(page.get_by_text('Tenés cambios sin confirmar.')).to_be_visible()
    page.get_by_role('button', name='Descartar cambios').click()
    context.close()

    # Missing scanner chunks get a recoverable error screen, not a blank page.
    context, state, page = setup()
    page.route('**/assets/Scanner-*.js', lambda route: route.abort())
    page.get_by_role('button', name='Escanear un producto', exact=False).click()
    expect(page.get_by_role('heading', name='No pudimos abrir esta pantalla')).to_be_visible()
    context.close()
    # A hostile page must not be able to frame the inventory controls.
    context = browser.new_context(service_workers='block')
    smoke.mock_api(context)
    page = context.new_page()
    page.set_content(f'<iframe src="{smoke.ORIGIN}" title="Embedded Rebu"></iframe>')
    expect(page.frame_locator('iframe').get_by_role('heading', name='Abrí Rebu en su propia pestaña')).to_be_visible()
    assert page.frame_locator('iframe').get_by_role('button', name='Ingresar a Rebu Stock').count() == 0
    context.close()
    browser.close()
    print('PASS: closed-tab recovery, revoked edit permission, expired session recovery, late responses after logout, delayed camera permission, duplicate pagination, hostile/long data, narrow/landscape layouts, unsaved form guard and chunk failures.')
