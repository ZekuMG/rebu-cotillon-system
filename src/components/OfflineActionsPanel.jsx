import React, { useCallback, useRef, useState } from 'react';
import { Check, Clock, WifiOff, X } from 'lucide-react';
import useDialogFocus from '../hooks/useDialogFocus';
import { formatDateAR, formatTimeAR, formatCurrency } from '../utils/helpers';
import { isOfflineActionOpen } from '../utils/offlineActionQueue';
import './OfflineActionsPanel.css';

const statusLabels = { pending: 'Pendiente', applying: 'Aplicando…', applied: 'Aplicada', discarded: 'Descartada', conflict: 'Datos modificados', review: 'Revisar resultado' };
const labels = {
  title: 'Producto', name: 'Nombre', description: 'Descripción', amount: 'Importe', price: 'Precio', purchasePrice: 'Costo', stock: 'Stock',
  totalAmount: 'Total', total: 'Total', note: 'Nota', reason: 'Motivo', phone: 'Teléfono', email: 'Email', category: 'Categoría',
  quantity: 'Cantidad', paymentMethod: 'Medio de pago', expenseDate: 'Fecha del gasto', payment_method: 'Medio de pago',
  openingBalance: 'Monto inicial', closingTime: 'Horario de cierre', depositAmount: 'Seña', pickupDate: 'Retiro',
};
const details = (args, type) => {
  if (type === 'offlineSale') args = [{ total: args[0].request.salePayload.total, paymentMethod: args[0].request.salePayload.payment_method }, ...args[0].logDetails.items.map((item) => ({ title: item.title, quantity: item.quantity ?? item.qty ?? 1, price: item.price }))];
  const rows = [];
  const visit = (value, depth = 0) => {
    if (!value || typeof value !== 'object' || depth > 3 || rows.length > 80) return;
    if (Array.isArray(value)) { value.forEach((item) => visit(item, depth + 1)); return; }
    for (const [key, item] of Object.entries(value)) {
      if (labels[key] && ['string', 'number'].includes(typeof item)) rows.push([labels[key], ['amount', 'price', 'purchasePrice', 'totalAmount', 'total', 'openingBalance', 'depositAmount'].includes(key) ? formatCurrency(item) : String(item)]);
      else if (item && typeof item === 'object' && !['targets', 'actor', 'sessionUser'].includes(key)) visit(item, depth + 1);
    }
  };
  args.forEach((arg) => visit(arg));
  return rows;
};

export default function OfflineActionsPanel({ entries, error, offline, busy, onClose, onConfirm, onDiscard, canConfirm, onReconnect, reconnecting }) {
  const dialog = useRef(null);
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const close = useCallback(() => { if (!busyRef.current) onClose(); }, [onClose]);
  useDialogFocus(dialog, close, busyRef);
  const [selectedId, setSelectedId] = useState(null);
  const [discardId, setDiscardId] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const visible = entries.filter((entry) => showHistory || isOfflineActionOpen(entry));
  const selected = visible.find((entry) => entry.id === selectedId) || visible[0];
  const count = entries.filter(isOfflineActionOpen).length;
  return (
    <div className="offline-actions-backdrop">
      <section ref={dialog} className="offline-actions-panel" role="dialog" aria-modal="true" aria-labelledby="offline-actions-title" tabIndex={-1}>
        <header className="offline-actions-header">
          <div><small>GUARDADO EN ESTA PC</small><h2 id="offline-actions-title">Pendientes sin conexión <span>{count}</span></h2></div>
          <button type="button" aria-label="Cerrar pendientes" onClick={close} disabled={busy}><X size={18} /></button>
        </header>
        <p className="offline-actions-explanation">Revisá cada acción antes de aplicarla. Volver a tener internet no envía los pendientes. Los datos del negocio cambian recién al confirmar.</p>
        {offline && <p className="offline-actions-notice" role="status"><WifiOff size={15} />Podés revisar los pendientes. Reconectá para confirmarlos.<button type="button" disabled={busy || reconnecting} onClick={onReconnect}>{reconnecting ? 'Reconectando…' : 'Reconectar'}</button></p>}
        {error && <p className="offline-actions-error" role="alert">{error}</p>}
        <div className="offline-actions-toolbar"><span>{count} por resolver</span><label><input type="checkbox" checked={showHistory} onChange={(event) => setShowHistory(event.target.checked)} />Ver aplicadas y descartadas</label></div>
        {visible.length === 0 ? <div className="offline-actions-empty"><Check size={24} /><strong>No hay acciones pendientes</strong><p>Los cambios que guardes sin internet aparecerán acá.</p></div> : (
          <div className="offline-actions-body">
            <nav className="offline-actions-list" aria-label="Acciones guardadas">
              {visible.map((entry) => <button key={entry.id} type="button" disabled={busy} aria-pressed={selected?.id === entry.id} onClick={() => { setSelectedId(entry.id); setDiscardId(null); }}>
                <span className={`offline-action-state is-${entry.status}`}>{statusLabels[entry.status]}</span>
                <strong>{entry.label}</strong><span>{entry.summary}</span><small>{formatDateAR(entry.createdAt)} {formatTimeAR(entry.createdAt)} · {entry.actor.userName}</small>
              </button>)}
            </nav>
            {selected && <article className="offline-action-detail">
              <div className="offline-action-content">
              <span className={`offline-action-state is-${selected.status}`}>{statusLabels[selected.status]}</span>
              <h3>{selected.label}</h3><p>{selected.summary}</p>
              <small><Clock size={13} />Guardada el {formatDateAR(selected.createdAt)} a las {formatTimeAR(selected.createdAt)} por {selected.actor.userName}</small>
              {selected.type === 'offlineSale' && <p className="offline-actions-notice">Esta solicitud todavía no es una venta registrada. Se contabiliza al confirmarla; el importe y los productos son los guardados durante el corte.</p>}
              <dl>{details(selected.args, selected.type).map(([label, value], index) => <React.Fragment key={index}><dt>{label}</dt><dd>{value}</dd></React.Fragment>)}</dl>
              {selected.error && <p className="offline-actions-error" role="alert">{selected.error}</p>}
              {selected.status === 'review' && selected.type !== 'offlineSale' && <p>Comprobá si la acción ya aparece en el negocio. Este pendiente no se repite para evitar duplicados; luego podés descartarlo de la bandeja.</p>}
              </div>
              {isOfflineActionOpen(selected) && <footer>
                {discardId === selected.id ? <><span>El descarte solo quita el pendiente; no revierte cambios ya enviados.</span><button type="button" disabled={busy} onClick={() => { onDiscard(selected.id); setDiscardId(null); }}>Confirmar descarte</button><button type="button" disabled={busy} onClick={() => setDiscardId(null)}>Volver</button></> : <>
                  <button type="button" className="offline-action-confirm" disabled={offline || busy || selected.status === 'applying' || !canConfirm(selected) || selected.status === 'conflict' || (selected.status === 'review' && selected.type !== 'offlineSale')} onClick={() => onConfirm(selected.id)}>{busy || selected.status === 'applying' ? 'Procesando…' : selected.status === 'review' ? (selected.type === 'offlineSale' ? 'Verificar venta' : 'Requiere revisión') : 'Confirmar y aplicar'}</button>
                  <button type="button" disabled={busy || selected.status === 'applying'} onClick={() => setDiscardId(selected.id)}>Descartar</button>
                  {!canConfirm(selected) && <span>Ingresá con el usuario que creó la acción o con un administrador que tenga permiso para aplicarla.</span>}
                </>}
              </footer>}
            </article>}
          </div>
        )}
        <div className="offline-actions-local-note">Los pendientes pertenecen a esta PC. Conservá los datos de la aplicación hasta resolverlos.</div>
      </section>
    </div>
  );
}
