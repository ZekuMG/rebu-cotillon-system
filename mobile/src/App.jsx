import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import ArrowDownToLine from 'lucide-react/dist/esm/icons/arrow-down-to-line.js';
import ArrowRight from 'lucide-react/dist/esm/icons/arrow-right.js';
import CheckCircle2 from 'lucide-react/dist/esm/icons/circle-check-big.js';
import ChevronDown from 'lucide-react/dist/esm/icons/chevron-down.js';
import LoaderCircle from 'lucide-react/dist/esm/icons/loader-circle.js';
import LogOut from 'lucide-react/dist/esm/icons/log-out.js';
import Package from 'lucide-react/dist/esm/icons/package.js';
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw.js';
import ScanBarcode from 'lucide-react/dist/esm/icons/scan-barcode.js';
import Search from 'lucide-react/dist/esm/icons/search.js';
import Wifi from 'lucide-react/dist/esm/icons/wifi.js';
import WifiOff from 'lucide-react/dist/esm/icons/wifi-off.js';
import X from 'lucide-react/dist/esm/icons/x.js';
import { client, configured, friendlyError, getProduct, getProfile, isAuthError, listUsers, login, logout, searchProducts } from './api.js';
import { withDeadline } from './async.js';
import { priceLabel, stockLabel } from './stock.js';
import StockEditor from './StockEditor.jsx';
import { PENDING_PREFIX, readPending } from './pending.js';

const Scanner = lazy(() => import('./Scanner.jsx'));
const EMPTY_PRODUCTS = [];

function Login({ onLogin, online, initialError }) {
  const [users, setUsers] = useState([]);
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError || '');
  const active = useRef(true);
  const submitting = useRef(false);
  const load = useCallback(async (signal) => {
    setLoading(true); setError('');
    try { const result = await listUsers(signal); if (active.current && !signal?.aborted) { setUsers(result); setUserId((previous) => result.some((user) => user.id === previous) ? previous : result[0]?.id || ''); } }
    catch (cause) { if (active.current && !signal?.aborted) setError(friendlyError(cause)); }
    finally { if (active.current && !signal?.aborted) setLoading(false); }
  }, []);
  useEffect(() => { active.current = true; const controller = new AbortController(); if (configured && online) load(controller.signal); else { if (!configured) setError('Falta configurar la conexión de Rebu.'); setLoading(false); } return () => { active.current = false; controller.abort(); }; }, [load, online]);
  useEffect(() => { if (initialError) setError(initialError); }, [initialError]);
  async function submit(event) {
    event.preventDefault(); if (submitting.current || !online) return;
    submitting.current = true;
    setBusy(true); setError('');
    try { const profile = await login(userId, password); if (active.current) { setPassword(''); onLogin(profile); } }
    catch (cause) { if (active.current) setError(friendlyError(cause)); }
    finally { submitting.current = false; if (active.current) setBusy(false); }
  }
  return <main className="login-page"><div className="login-brand"><img src="./icon.svg" alt="" /><span>rebu<span className="brand-dot">.</span></span></div>
    <section className="login-panel"><span className="eyebrow">INVENTARIO INTERNO</span><h1>El stock,<br />a mano.</h1><p className="login-description">Buscá un producto, escaneá su código y actualizá las cantidades desde donde estés.</p>
      <form onSubmit={submit}><label htmlFor="user">Tu usuario de Rebu</label><div className="select-wrap"><select id="user" name="username" autoComplete="username" value={userId} onChange={(event) => setUserId(event.target.value)} disabled={loading || busy || !users.length} required>{loading ? <option>Cargando usuarios…</option> : !users.length ? <option value="">Sin usuarios disponibles</option> : users.map((user) => <option key={user.id} value={user.id}>{user.display_name}</option>)}</select><ChevronDown size={18} aria-hidden="true" /></div>
        <label htmlFor="password">Contraseña</label><input id="password" name="password" type="password" maxLength={256} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} disabled={busy} required />
        {error ? <p className="notice danger" role="alert">{error}</p> : null}{!online ? <p className="notice">Necesitás Internet para ingresar y consultar el stock.</p> : null}
        <button className="button primary full" type="submit" disabled={!configured || loading || busy || !online || !userId || !password}>{busy ? <LoaderCircle className="spin" size={18} /> : null}{busy ? 'Ingresando…' : 'Ingresar a Rebu Stock'}{!busy ? <ArrowRight size={18} /> : null}</button>
        {error && !users.length && configured ? <button type="button" className="button secondary full" onClick={() => load()} disabled={loading || !online}>Volver a cargar usuarios</button> : null}
      </form></section><p className="login-footer"><Package size={16} /> Conectado al inventario de tu punto de venta</p></main>;
}

export default function App() {
  const [profile, setProfile] = useState(null);
  const [booting, setBooting] = useState(true);
  const [online, setOnline] = useState(navigator.onLine);
  const [query, setQuery] = useState('');
  const [exact, setExact] = useState(false);
  const [products, setProducts] = useState(EMPTY_PRODUCTS);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [recovered, setRecovered] = useState(null);
  const [scanner, setScanner] = useState(false);
  const [revision, setRevision] = useState(0);
  const [toast, setToast] = useState('');
  const [installPrompt, setInstallPrompt] = useState(null);
  const [installHelp, setInstallHelp] = useState(false);
  const [installed, setInstalled] = useState(() => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone);
  const [opening, setOpening] = useState(false);
  const searchRef = useRef(null);
  const requestVersion = useRef(0);
  const nextOffset = useRef(0);
  const sessionEpoch = useRef(0);
  const authIdentity = useRef(null);
  const endSession = useCallback((message = '') => {
    sessionEpoch.current++;
    requestVersion.current++;
    setProfile(null); setSelected(null); setRecovered(null); setScanner(false);
    setProducts([]); setQuery(''); setExact(false); setHasMore(false);
    setLoading(false); setLoadingMore(false); setOpening(false); setBooting(false); setToast(''); setError(message);
  }, []);
  const fail = useCallback((cause) => {
    if (isAuthError(cause)) { endSession(friendlyError(cause)); logout().catch(() => {}); }
    else setError(friendlyError(cause));
  }, [endSession]);

  useEffect(() => {
    let active = true;
    const epoch = sessionEpoch.current;
    if (!configured) { setBooting(false); return; }
    withDeadline(client.auth.getSession()).then(async ({ data, error: cause }) => {
      if (cause) throw cause;
      if (data.session) { const user = await getProfile(); if (active && epoch === sessionEpoch.current) { authIdentity.current = data.session.user?.id; setProfile(user); } }
    }).catch((cause) => { if (active && epoch === sessionEpoch.current) fail(cause); }).finally(() => { if (active && epoch === sessionEpoch.current) setBooting(false); });
    const { data } = client.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === 'SIGNED_OUT') { authIdentity.current = null; endSession(); }
      else if (session?.user?.id) {
        if (authIdentity.current && authIdentity.current !== session.user.id) endSession('Se cambió de usuario en otra pestaña. Volvé a ingresar.');
        authIdentity.current = session.user.id;
      }
    });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, [endSession, fail]);
  useEffect(() => {
    const connected = () => { setOnline(true); setRevision((value) => value + 1); };
    const disconnected = () => { setOnline(false); setScanner(false); };
    const installable = (event) => { event.preventDefault(); setInstallPrompt(event); };
    const didInstall = () => { setInstalled(true); setInstallHelp(false); setInstallPrompt(null); };
    const signedOutElsewhere = (event) => { if (event.key === 'rebu-stock-logout-v1') endSession('Se cerró la sesión desde otra pestaña.'); };
    window.addEventListener('online', connected); window.addEventListener('offline', disconnected);
    window.addEventListener('beforeinstallprompt', installable); window.addEventListener('appinstalled', didInstall);
    window.addEventListener('storage', signedOutElsewhere);
    return () => { window.removeEventListener('online', connected); window.removeEventListener('offline', disconnected); window.removeEventListener('beforeinstallprompt', installable); window.removeEventListener('appinstalled', didInstall); window.removeEventListener('storage', signedOutElsewhere); };
  }, [endSession]);
  useEffect(() => {
    if (!profile?.id) return;
    const operation = readPending(profile.id);
    if (operation) { setRecovered(operation); setSelected(operation.product); }
  }, [profile?.id]);
  useEffect(() => {
    if (!profile?.id) return;
    const changed = (event) => {
      if (!event.key?.startsWith(PENDING_PREFIX) || selected) return;
      const operation = readPending(profile.id);
      if (operation) { setRecovered(operation); setSelected(operation.product); }
    };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, [profile?.id, selected]);
  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(''), 6500);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    const version = ++requestVersion.current;
    if (!profile?.id || !online) { setLoading(false); setLoadingMore(false); return; }
    const controller = new AbortController();
    setLoading(true); setError(''); setLoadingMore(false);
    const timeout = window.setTimeout(async () => {
      try {
        const result = await searchProducts(query, 0, controller.signal, exact);
        if (controller.signal.aborted || version !== requestVersion.current) return;
        setProducts(result.products); setHasMore(result.has_more);
        nextOffset.current = result.products.length;
        if (exact && result.products.length === 1 && !readPending(profile.id)) setSelected(result.products[0]);
      } catch (cause) { if (!controller.signal.aborted && version === requestVersion.current) { fail(cause); setProducts([]); setHasMore(false); } }
      finally { if (!controller.signal.aborted && version === requestVersion.current) setLoading(false); }
    }, query ? 250 : 0);
    return () => { controller.abort(); window.clearTimeout(timeout); };
  }, [profile?.id, online, query, exact, revision, fail]);

  useEffect(() => {
    if (!profile?.id) return;
    const refresh = () => {
      if (document.hidden || !navigator.onLine) return;
      const epoch = sessionEpoch.current;
      setRevision((value) => value + 1);
      getProfile().then((user) => { if (epoch === sessionEpoch.current) setProfile(user); }).catch((cause) => { if (epoch === sessionEpoch.current) fail(cause); });
    };
    window.addEventListener('focus', refresh); document.addEventListener('visibilitychange', refresh);
    return () => { window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [profile?.id, fail]);

  const closeScanner = useCallback(() => { setScanner(false); searchRef.current?.focus(); }, []);
  const scanned = useCallback((code) => { setScanner(false); setQuery(code); setExact(true); setRevision((value) => value + 1); }, []);
  async function openProduct(product) {
    if (opening || !online) return;
    const epoch = sessionEpoch.current;
    setOpening(true); setError('');
    try { const result = await getProduct(product.id); if (epoch === sessionEpoch.current) setSelected(result); }
    catch (cause) { if (epoch === sessionEpoch.current) fail(cause); }
    finally { if (epoch === sessionEpoch.current) setOpening(false); }
  }
  async function more() {
    if (loading || loadingMore || !online) return;
    const version = requestVersion.current; setLoadingMore(true);
    try { const result = await searchProducts(query, nextOffset.current, undefined, exact); if (version === requestVersion.current) { nextOffset.current += result.products.length; setProducts((previous) => [...previous, ...result.products.filter((product) => !previous.some((entry) => entry.id === product.id))]); setHasMore(result.has_more && result.products.length > 0); } }
    catch (cause) { if (version === requestVersion.current) fail(cause); }
    finally { if (version === requestVersion.current) setLoadingMore(false); }
  }
  async function install() {
    if (installPrompt) { try { await installPrompt.prompt(); await installPrompt.userChoice; } catch { setInstallHelp(true); } finally { setInstallPrompt(null); } }
    else setInstallHelp((value) => !value);
  }
  function saved(result) {
    const next = readPending(profile.id);
    setSelected(next?.product || null); setRecovered(next); setToast(`Movimiento confirmado · ${result.product.title}: ${result.replayed ? 'stock al registrarlo: ' : ''}${stockLabel(result.product)}`);
    setExact(false); setRevision((value) => value + 1);
  }
  if (booting) return <main className="boot"><img src="./icon.svg" alt="Rebu" /><LoaderCircle className="spin" /><p>Preparando tu inventario…</p></main>;
  if (!profile) return <Login online={online} initialError={error} onLogin={(user) => { setProfile(user); setError(''); }} />;
  return <div className="app-shell">
    <a className="skip-link" href="#inventory-content">Ir a los productos</a>
    <header className="app-header"><a className="wordmark" href="./" aria-label="Rebu Stock, inicio">rebu<span>.</span><small>STOCK</small></a><div className={`connection ${online ? '' : 'offline'}`}>{online ? <Wifi size={14} /> : <WifiOff size={14} />}<span>{online ? 'Con Internet' : 'Sin conexión'}</span></div><button className="icon-button logout" aria-label={`Cerrar sesión de ${profile.display_name}`} onClick={() => { endSession(); logout().catch(() => {}); }}><LogOut size={19} /></button></header>
    <main className="inventory-main" id="inventory-content"><div className="page-heading"><div><span className="eyebrow">INVENTARIO COMPARTIDO</span><h1>Productos</h1></div><button className="icon-button refresh" aria-label="Actualizar productos" disabled={loading || !online} onClick={() => setRevision((value) => value + 1)}><RefreshCw size={20} className={loading ? 'spin' : ''} /></button></div>
      <p className="greeting">Hola, {profile.display_name}. <span>¿Qué producto buscamos?</span></p>
      <div className="search-bar"><Search size={20} /><input ref={searchRef} aria-label="Buscar productos por nombre, marca o código" type="search" autoComplete="off" placeholder="Nombre, marca o código…" maxLength={120} value={query} onChange={(event) => { setQuery(event.target.value); setExact(false); }} />{query ? <button className="icon-button" aria-label="Limpiar búsqueda" onClick={() => { setQuery(''); setExact(false); searchRef.current?.focus(); }}><X size={17} /></button> : null}</div>
      <button className="scan-button" disabled={!online} onClick={() => setScanner(true)}><span className="scan-icon"><ScanBarcode size={26} /></span><span><strong>Escanear un producto</strong><small>Usá la cámara para leer el código</small></span><ArrowRight size={19} /></button>
      {!installed ? <div className="install-strip"><span><ArrowDownToLine size={15} /> Rebu en tu pantalla de inicio</span><button onClick={install}>Instalar</button></div> : null}
      {installHelp ? <div className="notice install-help"><strong>Agregar Rebu al celular</strong><p>En iPhone: abrí este enlace en Safari, tocá Compartir y elegí “Agregar a pantalla de inicio”.</p><p>En Android: abrí el menú de Chrome y elegí “Instalar aplicación” o “Agregar a pantalla de inicio”.</p><button className="text-button" onClick={() => setInstallHelp(false)}>Entendido</button></div> : null}
      {!online ? <p className="notice" role="status">Sin conexión. Los productos visibles pueden estar desactualizados. Conectate para consultar y modificar stock.</p> : null}
      {error ? <div className="notice danger" role="alert">{error}<button className="text-button" disabled={!online} onClick={() => setRevision((value) => value + 1)}>Volver a intentar</button></div> : null}
      <div className="results-heading"><span>{query ? exact ? 'COINCIDENCIAS DEL CÓDIGO' : 'RESULTADOS DE BÚSQUEDA' : 'LISTADO DE PRODUCTOS'}</span><span aria-live="polite">{loading ? 'Buscando…' : `${products.length}${hasMore ? '+' : ''} ${products.length === 1 && !hasMore ? 'producto' : 'productos'}`}</span></div>
      {loading ? <div className="loading-products" role="status"><LoaderCircle className="spin" size={22} /> Consultando inventario…</div> : products.length ? <ul className="product-list">{products.map((product) => <li key={product.id}><button className="product-row" onClick={() => openProduct(product)} disabled={!online || opening}><span className="product-art">{product.image_thumb && /^https:\/\//.test(product.image_thumb) ? <img src={product.image_thumb} loading="lazy" alt="" onError={(event) => { event.currentTarget.hidden = true; }} /> : <Package size={25} />}</span><span className="product-summary"><strong>{product.title}</strong><span>{product.brand || product.category || 'Sin marca'}</span><code>{product.barcode || `#${product.id}`}</code></span><span className="product-numbers"><strong className={Number(product.stock) <= 0 ? 'no-stock' : ''}>{stockLabel(product)}</strong><span>{priceLabel(product)}{product.product_type === 'weight' ? '/kg' : ''}</span></span></button></li>)}</ul> : !error ? <div className="empty-state"><Search size={30} /><h2>{query ? 'No encontramos ese producto' : 'Todavía no hay productos'}</h2><p>{query ? 'Probá con otra palabra o revisá el código. Solo se muestran los productos activos.' : 'Los productos activos de Rebu aparecerán acá.'}</p>{exact ? <button className="button secondary" onClick={() => setExact(false)}>Buscar también por nombre</button> : null}</div> : null}
      {hasMore && !loading ? <button className="button secondary full load-more" onClick={more} disabled={loadingMore || !online}>{loadingMore ? <LoaderCircle className="spin" size={18} /> : null}{loadingMore ? 'Cargando…' : 'Ver más productos'}</button> : null}
      <p className="inventory-footer">{profile.can_edit ? 'Ingresos y ajustes se guardan en el mismo inventario de la PC.' : 'Tu usuario tiene acceso de consulta al inventario.'}</p>
    </main>
    <nav className="bottom-nav" aria-label="Acciones principales"><button className="active" onClick={() => { searchRef.current?.focus(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}><Package size={21} /><span>Productos</span></button><button disabled={!online} onClick={() => setScanner(true)}><ScanBarcode size={23} /><span>Escanear</span></button></nav>
    {toast ? <div className="toast" role="status"><CheckCircle2 size={22} /><span>{toast}</span><button className="icon-button" aria-label="Cerrar confirmación" onClick={() => setToast('')}><X size={16} /></button></div> : null}
    {selected ? <StockEditor key={recovered?.id || selected.id} product={selected} profile={profile} online={online} recovered={recovered} onClose={() => { const next = readPending(profile.id); setSelected(next?.product || null); setRecovered(next); setExact(false); }} onSaved={saved} onSessionExpired={fail} /> : null}
    {scanner ? <Suspense fallback={<div className="scanner-loading" role="status">Preparando escáner…</div>}><Scanner onScan={scanned} onClose={closeScanner} /></Suspense> : null}
  </div>;
}
