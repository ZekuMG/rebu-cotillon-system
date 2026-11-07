import { useEffect, useRef, useState } from 'react';
import ArrowDown from 'lucide-react/dist/esm/icons/arrow-down.js';
import ArrowLeft from 'lucide-react/dist/esm/icons/arrow-left.js';
import Check from 'lucide-react/dist/esm/icons/check.js';
import LoaderCircle from 'lucide-react/dist/esm/icons/loader-circle.js';
import PackagePlus from 'lucide-react/dist/esm/icons/package-plus.js';
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw.js';
import { previewStock, stockLabel, stockUnit } from './stock.js';
import { friendlyError, getProduct, isAuthError, saveStock, stockStatus } from './api.js';
import { clearPending, persistPending, readPending } from './pending.js';

export default function StockEditor({ product, profile, online, recovered, onClose, onSaved, onSessionExpired }) {
  const [current, setCurrent] = useState(recovered?.product || product);
  const [mode, setMode] = useState(recovered?.mode || 'add');
  const [quantity, setQuantity] = useState(recovered ? String(recovered.quantity) : '');
  const [reason, setReason] = useState(recovered?.reason || '');
  const [pending, setPending] = useState(recovered || null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(recovered ? 'Hay un movimiento sin confirmar. Comprobá el resultado antes de continuar.' : '');
  const [conflict, setConflict] = useState(false);
  const dialogRef = useRef(null);
  const sending = useRef(false);
  const active = useRef(true);
  const [discarding, setDiscarding] = useState(false);
  useEffect(() => { active.current = true; dialogRef.current.showModal(); return () => { active.current = false; }; }, []);
  useEffect(() => {
    if (!quantity && !reason && !pending) return;
    const warn = (event) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [quantity, reason, pending]);
  let preview;
  let validation = '';
  try { preview = previewStock(current, mode, quantity); } catch (cause) { validation = cause.message; }
  const close = () => { if (!busy && !pending) { if (quantity || reason) setDiscarding(true); else onClose(); } };

  async function refresh() {
    setBusy(true);
    try { const next = await getProduct(current.id); if (active.current) { setCurrent(next); setConflict(false); setError(''); } }
    catch (cause) { if (active.current) setError(friendlyError(cause)); }
    finally { if (active.current) setBusy(false); }
  }
  async function submit(event) {
    event.preventDefault();
    if (sending.current || !online || conflict || (!pending && (!profile.can_edit || !preview || reason.trim().length < 3))) return;
    const other = readPending(profile.id);
    if (!pending && other) { setError('Hay otro movimiento pendiente de comprobación. Volvé a Productos para recuperarlo antes de cargar otro.'); return; }
    const operation = pending || { id: crypto.randomUUID(), createdAt: Date.now(), userId: profile.id, product: current, mode, ...preview, reason: reason.trim() };
    // Retain the exact request through ambiguous network failures and reloads.
    try { persistPending(operation); }
    catch { setError('El navegador no permite guardar la confirmación pendiente. Habilitá el almacenamiento para operar.'); return; }
    sending.current = true;
    setPending(operation);
    setBusy(true);
    setError('');
    let outcomeKnown = !pending;
    try {
      if (pending) {
        const status = await stockStatus(operation.id);
        if (status.status === 'confirmed') {
          clearPending(operation);
          if (active.current) { setPending(null); onSaved(status.result); }
          return;
        }
        if (status.status !== 'not_found') throw new Error('No pudimos comprobar el movimiento. Intentá nuevamente.');
        outcomeKnown = true;
        if (!profile.can_edit) {
          clearPending(operation);
          setPending(null);
          setError('El movimiento no fue registrado y tu usuario ya no tiene permiso para modificar stock.');
          return;
        }
      }
      const result = await saveStock(operation);
      clearPending(operation);
      if (active.current) { setPending(null); onSaved(result); }
    } catch (cause) {
      if (!active.current) return;
      if (isAuthError(cause)) { onSessionExpired(cause); return; }
      const definitive = outcomeKnown && !isAuthError(cause) && ['40001', '22023', 'P0002', 'PGRST202', '22P02'].includes(cause.code);
      if (definitive) { clearPending(operation); setPending(null); }
      if (cause.code === '40001') setConflict(true);
      setError(`${friendlyError(cause)}${definitive ? '' : ' El resultado no está confirmado. Usá “Comprobar movimiento” para reintentar sin duplicarlo.'}`);
    } finally { if (active.current) setBusy(false); sending.current = false; }
  }
  return <dialog ref={dialogRef} className="stock-dialog" aria-labelledby="stock-title" onCancel={(event) => { event.preventDefault(); close(); }}>
    <div className="editor-header"><button className="back-button" onClick={close} disabled={busy || Boolean(pending)}><ArrowLeft size={18} /> Productos</button><span className="eyebrow">MOVIMIENTO DE STOCK</span></div>
    <div className="editor-content">
      {discarding ? <div className="notice" role="alert"><strong>Tenés cambios sin confirmar.</strong><p>Si volvés a Productos, se descarta lo que escribiste.</p><div className="discard-actions"><button className="button secondary" onClick={() => setDiscarding(false)}>Seguir editando</button><button className="button secondary" onClick={onClose}>Descartar cambios</button></div></div> : null}
      <p className="product-code">{current.barcode || `Producto #${current.id}`}</p><h2 id="stock-title">{current.title}</h2>
      <p className="subtle">{[current.brand, current.category].filter(Boolean).join(' · ')}</p>
      <div className="current-stock"><span>Stock consultado</span><strong>{stockLabel(current)}</strong></div>
      {current.product_type === 'weight' ? <p className="notice">Este producto se vende por peso. Cargá las cantidades en <strong>gramos</strong>: 1 kg = 1.000 g.</p> : null}
      {error ? <p className="notice danger" role="alert">{error}</p> : null}
      {!profile.can_edit && !pending ? <p className="notice">Tu usuario puede consultar productos. Para modificar stock necesitás el permiso de edición de inventario.</p> : <form onSubmit={submit}>
        <fieldset disabled={busy || Boolean(pending)} className="movement-fields">
          <legend className="sr-only">Tipo de movimiento</legend>
          <div className="segmented"><button type="button" aria-pressed={mode === 'add'} className={mode === 'add' ? 'active' : ''} onClick={() => { setMode('add'); setQuantity(''); }}><PackagePlus size={18} /> Ingresar mercadería</button><button type="button" aria-pressed={mode === 'set'} className={mode === 'set' ? 'active' : ''} onClick={() => { setMode('set'); setQuantity(''); }}>Ajustar por conteo</button></div>
          <label htmlFor="quantity">{mode === 'add' ? 'Cantidad que ingresa' : 'Cantidad total que contaste'} <span>({stockUnit(current)})</span></label>
          <input id="quantity" className="quantity-input" type="text" inputMode="numeric" pattern="[0-9]+" autoComplete="off" placeholder="0" value={quantity} onChange={(event) => setQuantity(event.target.value)} maxLength={10} required />
          <p className="field-help">{mode === 'add' ? 'Se suma al stock que figura arriba.' : 'Reemplaza el stock por el total real. Para dejarlo sin stock, ingresá 0.'}</p>
          <label htmlFor="reason">Motivo del movimiento</label><textarea id="reason" rows={2} minLength={3} maxLength={300} placeholder={mode === 'add' ? 'Ej.: ingreso de pedido del proveedor' : 'Ej.: conteo de estantería o mercadería dañada'} value={reason} onChange={(event) => setReason(event.target.value)} required />
        </fieldset>
        {quantity && !preview ? <p className="field-error" role="alert">{validation}</p> : null}
        {preview ? <div className="stock-preview"><div><span>Actual</span><strong>{preview.before.toLocaleString('es-AR')} <small>{stockUnit(current)}</small></strong></div><ArrowDown size={20} /><div><span>Quedará en</span><strong>{preview.after.toLocaleString('es-AR')} <small>{stockUnit(current)}</small></strong></div><p>{preview.delta > 0 ? '+' : ''}{preview.delta.toLocaleString('es-AR')} {stockUnit(current)} · {mode === 'add' ? 'Ingreso' : 'Ajuste'}</p></div> : null}
        {conflict ? <button type="button" className="button secondary full" disabled={busy || !online} onClick={refresh}><RefreshCw size={18} /> Actualizar stock y revisar</button> : null}
        <div className="editor-actions"><p className="field-help">{online ? 'Se guarda en el inventario compartido de Rebu.' : 'Sin conexión. Conectate a Internet para guardar.'}</p><button type="submit" className="button primary full" disabled={busy || !online || conflict || (!pending && (!preview || reason.trim().length < 3))}>{busy ? <LoaderCircle className="spin" size={18} /> : <Check size={18} />}{busy ? 'Confirmando…' : pending ? 'Comprobar movimiento' : 'Confirmar movimiento'}</button></div>
      </form>}
    </div>
  </dialog>;
}
