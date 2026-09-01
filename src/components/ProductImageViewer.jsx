import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Image as ImageIcon, X } from 'lucide-react';

const ProductImageViewer = ({ imageUrl, productTitle, onClose }) => {
  const closeButtonRef = useRef(null);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (!imageUrl) return undefined;
    setHasError(false);
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    closeButtonRef.current?.focus();
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [imageUrl, onClose]);

  if (!imageUrl) return null;

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
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          className="ml-4 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-white/15 bg-white/5 text-slate-200 transition hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-fuchsia-400"
          aria-label="Cerrar foto completa"
        >
          <X size={19} />
        </button>
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

      <p className="shrink-0 pb-4 text-center text-[11px] text-slate-400">Esc para cerrar</p>
    </div>
  ), document.body);
};

export default ProductImageViewer;
