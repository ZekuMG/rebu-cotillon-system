import React, { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, Loader2, ShieldAlert, X } from 'lucide-react';

export default function SecureSessionReauthPanel({
  isOpen,
  userName,
  error,
  isSubmitting,
  onSubmit,
  onClose,
}) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    setPassword('');
    setShowPassword(false);
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(focusTimer);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !isSubmitting) onClose?.();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) return null;

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!password || isSubmitting) return;
    onSubmit?.(password);
  };

  return (
    <aside
      role="dialog"
      aria-modal="false"
      aria-labelledby="secure-session-title"
      className="fixed bottom-4 right-4 z-[120] w-[min(380px,calc(100vw-32px))] overflow-hidden rounded-lg border border-[var(--rebu-border-strong)] bg-[var(--rebu-surface-2)] text-[var(--rebu-text-primary)]"
    >
      <div className="flex border-l-4 border-l-[var(--rebu-brand)]">
        <div className="min-w-0 flex-1 p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[var(--rebu-warning-border)] bg-[var(--rebu-warning-bg)] text-[var(--rebu-warning)]">
              <ShieldAlert size={19} aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--rebu-text-tertiary)]">
                Autorizacion de caja
              </p>
              <h2 id="secure-session-title" className="mt-0.5 text-sm font-black leading-tight">
                Confirma tu clave para cobrar
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-[var(--rebu-text-secondary)]">
                El carrito queda guardado. Recuperaremos la sesion de {userName || 'este usuario'} y continuaremos la misma venta.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              aria-label="Cerrar reautenticacion"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-[var(--rebu-border-soft)] text-[var(--rebu-text-tertiary)] transition-colors hover:border-[var(--rebu-border-strong)] hover:text-[var(--rebu-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-500 disabled:cursor-wait disabled:opacity-50"
            >
              <X size={15} aria-hidden="true" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="mt-3">
            <label htmlFor="secure-session-password" className="mb-1 block text-[11px] font-bold text-[var(--rebu-text-secondary)]">
              Clave de {userName || 'usuario'}
            </label>
            <div className="flex h-9 items-center rounded-md border border-[var(--rebu-border)] bg-[var(--rebu-control-inset)] focus-within:border-fuchsia-500 focus-within:ring-2 focus-within:ring-fuchsia-500/20">
              <input
                ref={inputRef}
                id="secure-session-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                disabled={isSubmitting}
                className="min-w-0 flex-1 bg-transparent px-3 text-sm font-semibold text-[var(--rebu-text-primary)] outline-none placeholder:text-[var(--rebu-text-muted)] disabled:cursor-wait"
                placeholder="Ingresa la clave"
              />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                disabled={isSubmitting}
                aria-label={showPassword ? 'Ocultar clave' : 'Mostrar clave'}
                className="flex h-full w-9 items-center justify-center text-[var(--rebu-text-tertiary)] hover:text-[var(--rebu-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-fuchsia-500 disabled:opacity-50"
              >
                {showPassword ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
              </button>
            </div>

            {error && (
              <p role="alert" className="mt-2 rounded border border-[var(--rebu-danger-border)] bg-[var(--rebu-danger-bg)] px-2.5 py-2 text-[11px] font-semibold leading-relaxed text-[var(--rebu-danger)]">
                {error}
              </p>
            )}

            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="h-8 rounded-md border border-[var(--rebu-border)] px-3 text-xs font-bold text-[var(--rebu-text-secondary)] transition-colors hover:border-[var(--rebu-border-strong)] hover:text-[var(--rebu-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-500 disabled:cursor-wait disabled:opacity-50"
              >
                Seguir editando
              </button>
              <button
                type="submit"
                disabled={!password || isSubmitting}
                className="inline-flex h-8 items-center justify-center gap-2 rounded-md bg-fuchsia-600 px-3 text-xs font-black text-white transition-colors hover:bg-fuchsia-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-500 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-50"
              >
                {isSubmitting ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : null}
                {isSubmitting ? 'Recuperando...' : 'Continuar cobro'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </aside>
  );
}
