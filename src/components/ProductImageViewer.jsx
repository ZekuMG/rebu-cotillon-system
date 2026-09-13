import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Copy, Download, Image as ImageIcon, X } from 'lucide-react';
import { copyProductImage, downloadProductImage } from '../utils/productImageClipboard';

// El aviso se borra solo: la app no tiene toasts y un modal de SweetAlert taparia
// la foto justo cuando el usuario la quiere ver. El error dura mas para llegar a leerlo.
const FEEDBACK_TIMEOUT_MS = { ok: 2500, error: 5000 };

const ProductImageViewer = ({ imageUrl, productTitle, onClose }) => {
  const closeButtonRef = useRef(null);
  const [hasError, setHasError] = useState(false);
  const [busyAction, setBusyAction] = useState('');
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    if (!imageUrl) return undefined;
    setHasError(false);
    setBusyAction('');
    setFeedback(null);
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    closeButtonRef.current?.focus();
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [imageUrl, onClose]);

  useEffect(() => {
    if (!feedback) return undefined;
    const timerId = window.setTimeout(() => setFeedback(null), FEEDBACK_TIMEOUT_MS[feedback.tone]);
    return () => window.clearTimeout(timerId);
  }, [feedback]);

  const runImageAction = useCallback(async (action) => {
    setBusyAction(action);
    setFeedback(null);
    try {
      const result = action === 'copy'
        ? await copyProductImage({ imageUrl })
        : await downloadProductImage({ imageUrl, productTitle });

      // Si cerró el diálogo de guardado no hubo error: no le avisamos nada.
      if (result?.canceled) return;

      if (result?.success) {
        setFeedback({ tone: 'ok', action, message: action === 'copy' ? 'Copiada' : 'Foto guardada' });
        return;
      }

      setFeedback({
        tone: 'error',
        action,
        message: result?.error || (action === 'copy' ? 'No se pudo copiar la foto.' : 'No se pudo descargar la foto.'),
      });
    } catch (error) {
      setFeedback({ tone: 'error', action, message: error?.message || 'No se pudo completar la acción.' });
    } finally {
      setBusyAction('');
    }
  }, [imageUrl, productTitle]);

  if (!imageUrl) return null;

  const actionsDisabled = hasError || Boolean(busyAction);
  const justCopied = feedback?.tone === 'ok' && feedback.action === 'copy';
  const feedbackToneClass = feedback
    ? (feedback.tone === 'error' ? 'font-semibold text-rose-300' : 'font-semibold text-emerald-300')
    : 'text-slate-400';

  return createPortal((
    <div
      className="fixed inset-0 z-[120] flex flex-col bg-slate-950/[0.92]"
      role="dialog"
      aria-modal="true"
      aria-label={`Foto completa de ${productTitle || 'producto'}`}
      onClick={onClose}
    >
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 px-4 text-white">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Foto completa</p>
          <h2 className="truncate text-sm font-bold">{productTitle || 'Producto'}</h2>
        </div>
        {/* Las acciones viven en la barra de arriba para no taparle nada a la foto. */}
        <div className="ml-4 flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={(event) => { event.stopPropagation(); void runImageAction('download'); }}
            disabled={actionsDisabled}
            className="flex h-11 min-w-[44px] items-center justify-center gap-2 rounded-md border border-white/15 bg-white/5 px-3 text-xs font-bold text-slate-200 transition hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-fuchsia-400 disabled:cursor-not-allowed disabled:opacity-50"
            title="Descargar la foto"
            aria-label="Descargar la foto"
          >
            <Download size={18} />
            <span className="hidden sm:inline">{busyAction === 'download' ? 'Guardando…' : 'Descargar'}</span>
          </button>
          <button
            type="button"
            onClick={(event) => { event.stopPropagation(); void runImageAction('copy'); }}
            disabled={actionsDisabled}
            className="flex h-11 min-w-[44px] items-center justify-center gap-2 rounded-md border border-white/15 bg-white/5 px-3 text-xs font-bold text-slate-200 transition hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-fuchsia-400 disabled:cursor-not-allowed disabled:opacity-50"
            title="Copiar la foto para pegarla en WhatsApp o en un mail"
            aria-label="Copiar la foto al portapapeles"
          >
            {justCopied ? <Check size={18} className="text-emerald-300" /> : <Copy size={18} />}
            <span className="hidden sm:inline">
              {busyAction === 'copy' ? 'Copiando…' : (justCopied ? 'Copiada' : 'Copiar')}
            </span>
          </button>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-white/15 bg-white/5 text-slate-200 transition hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-fuchsia-400"
            aria-label="Cerrar foto completa"
          >
            <X size={19} />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 items-center justify-center p-4 md:p-8" onClick={(event) => event.stopPropagation()}>
        {hasError ? (
          <div className="flex flex-col items-center gap-3 text-center text-slate-300">
            <ImageIcon size={36} className="text-slate-500" />
            <p className="text-sm font-semibold">No se pudo abrir la imagen completa.</p>
          </div>
        ) : (
          <img
            src={imageUrl}
            alt={`Foto completa de ${productTitle || 'producto'}`}
            decoding="async"
            onError={() => setHasError(true)}
            className="max-h-full max-w-full object-contain"
          />
        )}
      </div>

      <p
        className={`shrink-0 pb-4 text-center text-[11px] ${feedbackToneClass}`}
        role="status"
        aria-live="polite"
      >
        {feedback ? feedback.message : 'Esc para cerrar'}
      </p>
    </div>
  ), document.body);
};

export default ProductImageViewer;
