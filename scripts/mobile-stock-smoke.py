"""Browser checks use a mocked API; no real products are modified."""
import base64
import glob
import json
import os
from pathlib import Path
import sys
import time
from urllib.parse import urlparse

sys.path.insert(0, str(Path('output/mobile-python').resolve()))
from playwright.sync_api import sync_playwright, expect

OUT = Path('output/mobile-qa')
OUT.mkdir(parents=True, exist_ok=True)
ORIGIN = os.environ.get('REBU_TEST_URL', 'http://127.0.0.1:4176')
USER = '11111111-1111-4111-8111-111111111111'
AUTH = '22222222-2222-4222-8222-222222222222'
PRODUCT = {'id': '123', 'title': 'Globo metalizado estrella dorada', 'brand': 'Rebu', 'barcode': '5901234123457', 'stock': 12, 'price': 1500, 'category': 'Globos', 'product_type': 'quantity', 'image_thumb': None}

def jwt():
    enc = lambda value: base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip('=')
    return f'{enc({"alg":"HS256","typ":"JWT"})}.{enc({"sub":AUTH,"exp":int(time.time())+3600,"role":"authenticated"})}.test'

def mock_api(context, can_edit=True):
    state = {'product': PRODUCT.copy(), 'operations': {}, 'calls': [], 'lose_response': False, 'conflict': False, 'queries': [], 'can_edit': can_edit}
    def handle(route):
        path = urlparse(route.request.url).path
        if path.startswith('/auth/v1/'):
            if path.endswith('/token'):
                route.fulfill(json={'access_token': jwt(), 'token_type': 'bearer', 'expires_in': 3600, 'expires_at': int(time.time())+3600, 'refresh_token': 'test-refresh', 'user': {'id': AUTH, 'aud': 'authenticated', 'role': 'authenticated', 'email': 'test@example.invalid'}})
            elif path.endswith('/user'):
                route.fulfill(json={'id': AUTH, 'email': 'test@example.invalid'})
            else:
                route.fulfill(json={})
            return
        if path.endswith('/app_users_public'):
            route.fulfill(json=[{'id': USER, 'display_name': 'Equipo Rebu'}]); return
        body = route.request.post_data_json or {}
        if path.endswith('/verify_app_user_login_auth_bridge'):
            route.fulfill(json=[{'id': USER, 'auth_email': 'test@example.invalid'}]); return
        if path.endswith('/rebu_mobile_profile'):
            if state.get('hold_profile'):
                state['held_profile'] = route; return
            route.fulfill(json={'id': USER, 'display_name': 'Equipo Rebu', 'can_edit': state['can_edit']}); return
        if path.endswith('/rebu_mobile_product'):
            if state.get('hold_product'):
                state['held_product'] = route; return
            route.fulfill(json=state['product']); return
        if path.endswith('/rebu_mobile_search_products'):
            query = body.get('p_query', '')
            state['queries'].append(body)
            if state.get('pages') is not None:
                route.fulfill(json=state['pages'][body['p_offset']]); return
            match = query == '' or query == PRODUCT['barcode'] or query.lower() in PRODUCT['title'].lower()
            route.fulfill(json={'products': [state['product']] if match else [], 'has_more': False}); return
        if path.endswith('/rebu_mobile_save_stock'):
            state['calls'].append(body)
            op = body['p_operation_id']
            if state['conflict']:
                state['conflict'] = False
                state['product']['stock'] += 1
                route.fulfill(status=400, json={'code': '40001', 'message': 'El stock cambió.'}); return
            if op not in state['operations']:
                before = state['product']['stock']
                after = before + body['p_quantity'] if body['p_mode'] == 'add' else body['p_quantity']
                state['product']['stock'] = after
                state['operations'][op] = {'product': state['product'].copy(), 'before': before, 'after': after, 'replayed': False}
            if state['lose_response']:
                state['lose_response'] = False
                route.abort('failed'); return
            route.fulfill(json=state['operations'][op]); return
        if path.endswith('/rebu_mobile_stock_status'):
            if state.get('deny_status'):
                route.fulfill(status=401, json={'code': 'PGRST303', 'message': 'JWT expired'}); return
            result = state['operations'].get(body['p_operation_id'])
            route.fulfill(json={'status': 'confirmed', 'result': result} if result else {'status': 'not_found'}); return
        route.fulfill(status=404, json={'message': 'Unmocked API call'})
    context.route('**/rest/v1/**', handle)
    context.route('**/auth/v1/**', handle)
    return state

def sign_in(page):
    page.goto(ORIGIN)
    page.wait_for_load_state('networkidle')
    expect(page.get_by_role('heading', name='El stock, a mano.')).to_be_visible()
    page.screenshot(path=str(OUT / 'login-390.png'), full_page=True)
    page.get_by_label('Contraseña', exact=True).fill('contraseña-de-prueba')
    page.get_by_role('button', name='Ingresar a Rebu Stock').click()
    expect(page.get_by_role('heading', name='Productos', exact=True)).to_be_visible()
    expect(page.get_by_role('button', name='Globo metalizado', exact=False)).to_be_visible()

CAMERA_STREAM = r"""
window.__cameraTracks = [];
Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {value: async () => {
 const c=document.createElement('canvas'); c.width=1280;c.height=720;
 const ctx=c.getContext('2d');
 const left=['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011'];
 const odd=['0100111','0110011','0011011','0100001','0011101','0111001','0000101','0010001','0001001','0010111'];
 const right=left.map(bits=>bits.replace(/[01]/g,b=>b==='0'?'1':'0'));
 const code='5901234123457'; const parity='LGGLLG';
 let bits='101';for(let i=1;i<7;i++)bits+=(parity[i-1]==='L'?left:odd)[Number(code[i])];
 bits+='01010';for(let i=7;i<13;i++)bits+=right[Number(code[i])];bits+='101';
 const draw=()=>{ctx.fillStyle='white';ctx.fillRect(0,0,1280,720);ctx.fillStyle='black';[...bits].forEach((b,i)=>{if(b==='1')ctx.fillRect(355+i*6,200,6,320)});};
 draw();const timer=setInterval(draw,100);const stream=c.captureStream(10);window.__cameraTracks.push(...stream.getTracks());
 stream.getTracks().forEach(t=>t.addEventListener('ended',()=>clearInterval(timer)));
 return stream;
}});
"""

def main():
    with sync_playwright() as p:
        webkit = os.environ.get('REBU_TEST_ENGINE') == 'webkit'
        executable = sorted(glob.glob(os.path.join(os.environ['LOCALAPPDATA'], 'ms-playwright', 'webkit-*', 'Playwright.exe') if webkit else os.path.join(os.environ['LOCALAPPDATA'], 'ms-playwright', 'chromium-*', 'chrome-win64', 'chrome.exe')))[-1]
        browser = (p.webkit if webkit else p.chromium).launch(executable_path=executable, headless=True, timeout=30000)
        # Service workers bypass route interception in WebKit. All write-flow
        # tests block them so fake credentials can never reach the real backend.
        context = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=1, service_workers='block')
        state = mock_api(context)
        page = context.new_page()
        page.on('dialog', lambda dialog: dialog.accept() if dialog.type == 'beforeunload' else dialog.dismiss())
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        sign_in(page)
        page.screenshot(path=str(OUT / 'products-390.png'), full_page=True)
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        page.get_by_role('button', name='Instalar', exact=True).click()
        expect(page.get_by_text('Agregar Rebu al celular')).to_be_visible()
        page.get_by_role('button', name='Entendido').click()
        search = page.get_by_role('searchbox')
        search.fill('no-existe')
        expect(page.get_by_role('heading', name='No encontramos ese producto')).to_be_visible()
        page.get_by_role('button', name='Limpiar búsqueda').click()
        page.get_by_role('button', name='Globo metalizado', exact=False).click()
        page.get_by_label('Cantidad que ingresa', exact=False).fill('3')
        page.get_by_label('Motivo del movimiento').fill('Ingreso del proveedor')
        page.screenshot(path=str(OUT / 'receipt-390.png'), full_page=True)
        page.get_by_role('button', name='Confirmar movimiento').click()
        expect(page.get_by_text('Movimiento confirmado ·', exact=False)).to_be_visible()
        assert state['product']['stock'] == 15
        page.get_by_role('button', name='Cerrar confirmación').click()
        page.get_by_role('button', name='Globo metalizado', exact=False).click()
        page.get_by_role('button', name='Ajustar por conteo').click()
        page.get_by_label('Cantidad total que contaste', exact=False).fill('7')
        page.get_by_label('Motivo del movimiento').fill('Conteo de estantería')
        state['conflict'] = True
        page.get_by_role('button', name='Confirmar movimiento').click()
        expect(page.get_by_role('button', name='Actualizar stock y revisar')).to_be_visible()
        expect(page.get_by_role('button', name='Confirmar movimiento')).to_be_disabled()
        page.get_by_role('button', name='Actualizar stock y revisar').click()
        expect(page.get_by_role('button', name='Confirmar movimiento')).to_be_enabled()
        page.get_by_role('button', name='Confirmar movimiento').click()
        expect(page.get_by_text('Movimiento confirmado ·', exact=False)).to_be_visible()
        assert state['product']['stock'] == 7
        page.get_by_role('button', name='Cerrar confirmación').click()
        page.get_by_role('button', name='Globo metalizado', exact=False).click()
        page.get_by_label('Cantidad que ingresa', exact=False).fill('2')
        page.get_by_label('Motivo del movimiento').fill('Ingreso con corte de red')
        state['lose_response'] = True
        page.get_by_role('button', name='Confirmar movimiento').click()
        expect(page.get_by_role('button', name='Comprobar movimiento')).to_be_enabled()
        expect(page.get_by_role('dialog').get_by_role('button', name='Productos', exact=True)).to_be_disabled()
        pending_id = state['calls'][-1]['p_operation_id']
        page.reload()
        expect(page.get_by_role('button', name='Comprobar movimiento')).to_be_enabled()
        page.get_by_role('button', name='Comprobar movimiento').click()
        expect(page.get_by_text('Movimiento confirmado ·', exact=False)).to_be_visible()
        assert state['calls'][-1]['p_operation_id'] == pending_id
        assert state['product']['stock'] == 9
        page.get_by_role('button', name='Cerrar confirmación').click()
        context.set_offline(True)
        expect(page.get_by_text('Sin conexión', exact=True)).to_be_visible()
        expect(page.get_by_role('button', name='Escanear un producto', exact=False)).to_be_disabled()
        expect(page.get_by_role('button', name='Globo metalizado', exact=False)).to_be_disabled()
        context.set_offline(False)
        expect(page.get_by_text('Con Internet')).to_be_visible()
        page.evaluate("if (!navigator.mediaDevices) Object.defineProperty(navigator, 'mediaDevices', {configurable:true,value:{}}); Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {configurable:true,value:async()=>{throw new DOMException('Denied','NotAllowedError')}})")
        page.get_by_role('button', name='Escanear un producto', exact=False).click()
        expect(page.get_by_text('El acceso a la cámara está bloqueado.', exact=False)).to_be_visible(timeout=20000)
        page.get_by_role('button', name='Escribir código manualmente').click()
        if page.evaluate("typeof HTMLCanvasElement.prototype.captureStream === 'function'"):
            page.evaluate(CAMERA_STREAM)
            page.get_by_role('button', name='Escanear un producto', exact=False).click()
            expect(page.get_by_role('heading', name=PRODUCT['title'])).to_be_visible(timeout=30000)
            assert any(query.get('p_exact') is True for query in state['queries'])
            assert page.evaluate('window.__cameraTracks.every(track => track.readyState === "ended")')
            page.get_by_role('dialog').get_by_role('button', name='Productos', exact=True).click()
        elif webkit:
            print('WebKit port has no canvas video capture; camera decoding is covered by Chromium, physical Safari camera remains unverified.', flush=True)
        page.set_viewport_size({'width': 320, 'height': 740})
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        page.screenshot(path=str(OUT / 'products-320.png'), full_page=True)
        page.set_viewport_size({'width': 768, 'height': 1024})
        page.screenshot(path=str(OUT / 'products-768.png'), full_page=True)
        page.get_by_role('button', name='Cerrar sesión de', exact=False).click()
        expect(page.get_by_role('heading', name='El stock, a mano.')).to_be_visible()
        assert not errors, errors
        context.close()
        read_context = browser.new_context(viewport={'width': 390, 'height': 844}, service_workers='block')
        mock_api(read_context, can_edit=False)
        read_page = read_context.new_page()
        sign_in(read_page)
        read_page.get_by_role('button', name='Globo metalizado', exact=False).click()
        expect(read_page.get_by_text('Tu usuario puede consultar productos.', exact=False)).to_be_visible()
        assert read_page.get_by_role('button', name='Confirmar movimiento').count() == 0
        read_context.close()
        # Only the read-only install/cache check permits service workers.
        cache_context = browser.new_context(viewport={'width': 390, 'height': 844})
        mock_api(cache_context)
        cache_page = cache_context.new_page()
        cache_page.goto(ORIGIN)
        registration = cache_page.evaluate("Promise.race([navigator.serviceWorker.ready.then(()=>true),new Promise(resolve=>setTimeout(()=>resolve(false),5000))])")
        if not registration and not webkit: raise AssertionError('Service worker did not install')
        caches = cache_page.evaluate('''async () => {const names=await caches.keys(); return (await Promise.all(names.map(async n=>(await (await caches.open(n)).keys()).map(r=>r.url)))).flat()}''')
        assert not any('/rest/v1/' in url or '/auth/v1/' in url for url in caches)
        cache_context.close()
        browser.close()
        print(f'PASS: {"WebKit" if webkit else "Chromium"} login, search, receipts/counts, conflicts, recovery, offline protection, permissions, camera denial and responsive layout. Camera-video/cache capabilities are checked when supported by the engine.')

if __name__ == "__main__":
    main()
