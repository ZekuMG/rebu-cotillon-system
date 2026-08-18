import React from 'react';
import { Clock3, Loader2 } from 'lucide-react';

// Barra de carga de la bandeja de WhatsApp.
//
// Reemplaza al spinner suelto que decía "Preparando la bandeja": ese cartel no
// distinguía entre faltar dos segundos y faltar dos minutos. Acá se ve en qué
// paso está (conectando / trayendo), cuánto llegó, y un aviso discreto cuando
// la espera se pasa de lo normal, que casi siempre significa que el bot está
// caído o reconectando.
//
// El componente no calcula nada: recibe lo que devuelve `describeInboxProgress`
// y sólo lo dibuja. Toda la lógica (y sus tests) vive en
// `src/utils/inboxLoadProgress.js`.
//
// `compact` es la variante fina que se muestra al pie de la lista mientras
// siguen llegando lotes en segundo plano y el operador ya puede trabajar.
function InboxLoadingBar({ progress, compact = false }) {
  const percent = Number.isFinite(Number(progress?.percent))
    ? Math.min(Math.max(Math.round(Number(progress.percent)), 0), 100)
    : 0;
  const label = progress?.label || 'Cargando…';
  const detail = progress?.detail || '';
  const isSlow = Boolean(progress?.isSlow);

  return (
    <div
      className={`wa-inbox-progress ${compact ? 'is-compact' : ''}`}
      role="status"
      aria-live="polite"
    >
      <p className="wa-inbox-progress-head">
        <Loader2 className="animate-spin" />
        <strong>{label}</strong>
        {detail && <small>{detail}</small>}
      </p>
      <div
        className="wa-inbox-progress-track"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={detail ? `${label} ${detail}` : label}
      >
        <span className="wa-inbox-progress-fill" style={{ width: `${percent}%` }} />
      </div>
      {isSlow && (
        <p className="wa-inbox-progress-slow">
          <Clock3 />
          <span>Está tardando más de lo normal. Puede ser que WhatsApp se esté reconectando.</span>
        </p>
      )}
    </div>
  );
}

export default InboxLoadingBar;
