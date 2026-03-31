import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import App from '../App.jsx';

const DEBUG_LOG_LIMIT = 40;
const BLANK_SCREEN_TIMEOUT_MS = 4500;

const serializeDebugValue = (value, depth = 0) => {
  if (value instanceof Error) {
    return `${value.name}: ${value.message}${value.stack ? `\n${value.stack}` : ''}`;
  }

  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || value == null) return String(value);
  if (depth > 2) return '[Objeto]';

  try {
    return JSON.stringify(
      value,
      (_, nestedValue) => {
        if (nestedValue instanceof Error) {
          return {
            name: nestedValue.name,
            message: nestedValue.message,
            stack: nestedValue.stack,
          };
        }
        return nestedValue;
      },
      2,
    );
  } catch {
    return Object.prototype.toString.call(value);
  }
};

const formatDebugArgs = (args = []) =>
  args.map((arg) => serializeDebugValue(arg)).join(' ');

const buildDebugDump = (crash, logs) => {
  const sections = [
    '=== REBU DEBUG ===',
    `Tipo: ${crash?.type || 'desconocido'}`,
    `Mensaje: ${crash?.message || 'Sin mensaje'}`,
    crash?.source ? `Origen: ${crash.source}` : null,
    crash?.stack ? `\n--- STACK ---\n${crash.stack}` : null,
    crash?.componentStack ? `\n--- COMPONENT STACK ---\n${crash.componentStack}` : null,
    '\n--- CONSOLA RECIENTE ---',
    logs.length > 0
      ? logs.map((entry) => `[${entry.level.toUpperCase()}] ${entry.message}`).join('\n')
      : 'Sin logs capturados.',
  ].filter(Boolean);

  return sections.join('\n');
};

class DebugErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    this.props.onCrash?.({
      type: 'render',
      message: error?.message || 'La aplicación falló al renderizar.',
      stack: error?.stack || '',
      componentStack: info?.componentStack || '',
      source: 'React Error Boundary',
    });
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

function DebugCrashScreen({ crash, logs }) {
  const debugDump = useMemo(() => buildDebugDump(crash, logs), [crash, logs]);

  const handleCopyDebug = async () => {
    try {
      await navigator.clipboard.writeText(debugDump);
    } catch {
      // Si falla clipboard, no rompemos el fallback.
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#e2e8f0_0%,#f8fafc_46%,#e2e8f0_100%)] p-6 text-slate-900">
      <div className="w-full max-w-4xl overflow-hidden rounded-[28px] border border-rose-200 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.18)]">
        <div className="border-b border-rose-100 bg-[linear-gradient(180deg,rgba(255,241,242,0.95)_0%,rgba(255,255,255,0.98)_100%)] px-6 py-5">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rose-100 text-rose-600">
              <AlertTriangle size={24} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-rose-500">Modo Debug</p>
              <h1 className="mt-1 text-2xl font-black text-slate-900">Quedó la pantalla en blanco</h1>
              <p className="mt-2 text-sm font-medium text-slate-600">
                Es normal: dar aviso para arreglar este bug.
              </p>
              <p className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                {crash?.message || 'Se detectó una falla y activamos el fallback de depuración.'}
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white transition hover:bg-slate-800"
            >
              <RefreshCw size={16} />
              Force reload
            </button>
            <button
              type="button"
              onClick={handleCopyDebug}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50"
            >
              Copiar debug
            </button>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.3fr)]">
            <div className="rounded-[24px] border border-slate-200 bg-slate-50/90 p-4">
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Detalle técnico</p>
              <pre className="mt-3 max-h-[420px] overflow-auto whitespace-pre-wrap break-words rounded-2xl bg-slate-900 px-4 py-4 text-[12px] leading-6 text-emerald-300">
                {debugDump}
              </pre>
            </div>

            <div className="rounded-[24px] border border-slate-200 bg-white p-4">
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Consola reciente</p>
              <div className="mt-3 max-h-[420px] overflow-auto rounded-2xl border border-slate-200 bg-slate-50">
                {logs.length > 0 ? (
                  logs.map((entry) => (
                    <div key={entry.id} className="border-b border-slate-200 px-4 py-3 last:border-b-0">
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] ${
                          entry.level === 'error'
                            ? 'bg-rose-100 text-rose-700'
                            : entry.level === 'warn'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-slate-200 text-slate-700'
                        }`}>
                          {entry.level}
                        </span>
                        <span className="text-[11px] font-semibold text-slate-400">{entry.at}</span>
                      </div>
                      <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-[12px] leading-5 text-slate-700">
                        {entry.message}
                      </pre>
                    </div>
                  ))
                ) : (
                  <div className="px-4 py-6 text-sm font-medium text-slate-500">Todavía no capturamos mensajes de consola.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DebugAppShell() {
  const [crash, setCrash] = useState(null);
  const [logs, setLogs] = useState([]);
  const pushedCrashRef = useRef(false);

  useEffect(() => {
    window.__REBU_APP_READY__ = false;

    const pushLog = (level, args) => {
      const entry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        level,
        at: new Date().toLocaleString('es-AR'),
        message: formatDebugArgs(args),
      };

      setLogs((prev) => [...prev.slice(-(DEBUG_LOG_LIMIT - 1)), entry]);
    };

    const originalConsole = {
      error: console.error,
      warn: console.warn,
      log: console.log,
    };

    console.error = (...args) => {
      pushLog('error', args);
      originalConsole.error(...args);
    };

    console.warn = (...args) => {
      pushLog('warn', args);
      originalConsole.warn(...args);
    };

    console.log = (...args) => {
      pushLog('log', args);
      originalConsole.log(...args);
    };

    const raiseCrash = (nextCrash) => {
      pushedCrashRef.current = true;
      setCrash((prev) => prev || nextCrash);
    };

    const handleWindowError = (event) => {
      raiseCrash({
        type: 'runtime',
        message: event?.error?.message || event?.message || 'Error no controlado en tiempo de ejecución.',
        stack: event?.error?.stack || '',
        source: event?.filename
          ? `${event.filename}:${event.lineno || 0}:${event.colno || 0}`
          : 'window.error',
      });
    };

    const handleUnhandledRejection = (event) => {
      const reason = event?.reason;
      raiseCrash({
        type: 'promise',
        message: reason?.message || serializeDebugValue(reason) || 'Promise rechazada sin manejar.',
        stack: reason?.stack || '',
        source: 'unhandledrejection',
      });
    };

    const timeoutId = window.setTimeout(() => {
      if (!window.__REBU_APP_READY__ && !pushedCrashRef.current) {
        raiseCrash({
          type: 'blank-screen-timeout',
          message: 'La app no terminó de dibujarse y detectamos una posible pantalla blanca.',
          stack: '',
          source: 'blank-screen-detector',
        });
      }
    }, BLANK_SCREEN_TIMEOUT_MS);

    window.addEventListener('error', handleWindowError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener('error', handleWindowError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      console.error = originalConsole.error;
      console.warn = originalConsole.warn;
      console.log = originalConsole.log;
    };
  }, []);

  if (crash) {
    return <DebugCrashScreen crash={crash} logs={logs} />;
  }

  return (
    <DebugErrorBoundary onCrash={setCrash}>
      <App />
    </DebugErrorBoundary>
  );
}
