import React from 'react';
import { AlertTriangle, CheckCircle2, RefreshCw, WifiOff } from 'lucide-react';

export default function AppWorkspaceStatus({ offline, offlineDetail, demo, test, connection, reconnecting, onReconnect, onCopyDiagnostic }) {
  const tone = offline ? 'danger' : test ? 'warning' : demo ? 'demo' : 'neutral';
  const Icon = offline ? WifiOff : test ? AlertTriangle : CheckCircle2;
  const title = offline ? 'Modo local activo - solo lectura' : test ? 'Compra de prueba' : demo ? 'Modo demo local' : connection.title;
  const detail = offline ? 'No se puede cobrar ni guardar cambios.'
    : test ? 'Esta operación no se contabiliza en los resultados.'
      : demo ? 'No se lee ni se escribe en Supabase. Para salir, abrí la app con ?demo=0.' : connection.detail;
  return (
    <div className={`app-workspace-status is-${tone}`}>
      <div className="app-workspace-status-message" role="status" aria-live="polite" title={`${title}. ${detail}${offline ? ` ${offlineDetail}` : ''}`}>
        <Icon size={13} aria-hidden="true" />
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>
      {offline && (
        <div className="app-workspace-status-actions">
          <button type="button" disabled={reconnecting} onClick={onReconnect}>
            <RefreshCw size={12} className={reconnecting ? 'animate-spin' : ''} aria-hidden="true" />
            {reconnecting ? 'Reconectando' : 'Reconectar'}
          </button>
          <button type="button" onClick={onCopyDiagnostic}>Copiar diagnóstico</button>
        </div>
      )}
    </div>
  );
}
