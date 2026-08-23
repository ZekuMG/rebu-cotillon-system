import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import App from '../App.jsx';
// El umbral y la regla de "¿esto es pantalla blanca?" viven en el util para
// poder testearlos sin montar React. Subió de 4500 a 8000 ms: el arranque real
// (auth, consultas iniciales, primer pintado del árbol) tranquilamente pasa los
// 4,5 s en una PC lenta, y con el umbral corto le tapábamos la app con la
// pantalla de crash a un usuario que estaba cargando bien.
import {
  BLANK_SCREEN_TIMEOUT_MS,
  DYNAMIC_IMPORT_RELOAD_COOLDOWN_MS,
  getDynamicImportRequestUrl,
  isDynamicImportLoadError,
  isViteDevelopmentModuleUrl,
  shouldAutoReloadDynamicImport,
  shouldReportBlankScreen,
} from '../utils/bootSplash.js';

const DEBUG_LOG_LIMIT = 40;
const DYNAMIC_IMPORT_RELOAD_KEY = 'rebu_dynamic_import_reload_at';
const DYNAMIC_IMPORT_PROBE_INTERVAL_MS = 1500;

// El flag arranca en false acá, al importar el módulo, y NO dentro del useEffect
// de abajo. Los efectos corren de hijo a padre: el useEffect de App lo pone en
// true y, justo después, el de este componente (que es el padre) lo volvía a
// pisar con false. Resultado: quedaba en false para siempre y el detector
// acusaba pantalla blanca sobre una app que había cargado bien.
if (typeof window !== 'undefined') {
  window.__REBU_APP_READY__ = false;
}

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
  const dynamicImportFailure = isDynamicImportLoadError(crash);
  const failedModuleUrl = useMemo(() => getDynamicImportRequestUrl(crash), [crash]);
  const shouldProbeVite = isViteDevelopmentModuleUrl(failedModuleUrl);
  const [recoveryStatus, setRecoveryStatus] = useState(
    dynamicImportFailure ? 'waiting' : 'idle',
  );
  const recoveryProbeInFlightRef = useRef(false);
  const recoveryReloadStartedRef = useRef(false);

  const rememberReload = useCallback(() => {
    try {
      window.sessionStorage.setItem(DYNAMIC_IMPORT_RELOAD_KEY, String(Date.now()));
    } catch {
      // sessionStorage puede estar bloqueado; la recuperación manual sigue disponible.
    }
  }, []);

  const reloadApp = useCallback(() => {
    rememberReload();
    window.location.reload();
  }, [rememberReload]);

  const tryDynamicImportRecovery = useCallback(async () => {
    if (!dynamicImportFailure) return false;
    if (recoveryProbeInFlightRef.current || recoveryReloadStartedRef.current) return false;

    recoveryProbeInFlightRef.current = true;
    setRecoveryStatus('checking');
    try {
      if (shouldProbeVite) {
        const response = await fetch(failedModuleUrl, { cache: 'no-store' });
        if (!response.ok) {
          setRecoveryStatus('waiting');
          return false;
        }
      }

      recoveryReloadStartedRef.current = true;
      setRecoveryStatus('reloading');
      reloadApp();
      return true;
    } catch {
      setRecoveryStatus('waiting');
      return false;
    } finally {
      recoveryProbeInFlightRef.current = false;
    }
  }, [dynamicImportFailure, failedModuleUrl, reloadApp, shouldProbeVite]);

  useEffect(() => {
    if (!dynamicImportFailure) return undefined;

    let lastReloadAt = 0;
    try {
      lastReloadAt = Number(window.sessionStorage.getItem(DYNAMIC_IMPORT_RELOAD_KEY) || 0);
    } catch {
      lastReloadAt = 0;
    }

    if (!shouldAutoReloadDynamicImport({ error: crash, lastReloadAt })) {
      setRecoveryStatus('manual');
      return undefined;
    }

    if (!shouldProbeVite) {
      void tryDynamicImportRecovery();
      return undefined;
    }

    void tryDynamicImportRecovery();
    const intervalId = window.setInterval(() => {
      void tryDynamicImportRecovery();
    }, DYNAMIC_IMPORT_PROBE_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [crash, dynamicImportFailure, shouldProbeVite, tryDynamicImportRecovery]);

  const handleCopyDebug = async () => {
    try {
      await navigator.clipboard.writeText(debugDump);
    } catch {
      // Si falla clipboard, no rompemos el fallback.
    }
  };

  const recoveryCopy = {
    checking: 'Comprobando si el servidor local volvió…',
    waiting: 'Esperando que vuelva el servidor local…',
    reloading: 'Conexión recuperada. Recargando…',
    manual: 'La recarga automática ya se intentó. Podés reintentar manualmente.',
  }[recoveryStatus];

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#e2e8f0_0%,#f8fafc_46%,#e2e8f0_100%)] p-6 text-slate-900">
      <div className="w-full max-w-4xl overflow-hidden rounded-[28px] border border-rose-200 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.18)]">
        <div className="border-b border-rose-100 bg-[linear-gradient(180deg,rgba(255,241,242,0.95)_0%,rgba(255,255,255,0.98)_100%)] px-6 py-5">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rose-100 text-rose-600">
              <AlertTriangle size={24} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-rose-500">
                {dynamicImportFailure ? 'Recuperación de conexión' : 'Modo Debug'}
              </p>
              <h1 className="mt-1 text-2xl font-black text-slate-900">
                {dynamicImportFailure ? 'Se interrumpió la aplicación local' : 'Quedó la pantalla en blanco'}
              </h1>
              <p className="mt-2 text-sm font-medium text-slate-600">
                {dynamicImportFailure
                  ? 'Los datos ya guardados están protegidos. Rebu volverá a cargar cuando el módulo esté disponible.'
                  : 'Es normal: dar aviso para arreglar este bug.'}
              </p>
              <p className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                {crash?.message || 'Se detectó una falla y activamos el fallback de depuración.'}
              </p>
              {dynamicImportFailure && recoveryCopy && (
                <p className="mt-2 text-xs font-bold text-amber-700" role="status" aria-live="polite">
                  {recoveryCopy}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={dynamicImportFailure
                ? () => void tryDynamicImportRecovery()
                : () => window.location.reload()}
              className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white transition hover:bg-slate-800"
            >
              <RefreshCw size={16} />
              {dynamicImportFailure ? 'Reintentar ahora' : 'Force reload'}
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
  const pendingLogsRef = useRef([]);
  const logFlushTimerRef = useRef(null);
  const lastLogRef = useRef({ key: '', at: 0 });

  useEffect(() => {
    const pushLog = (level, args) => {
      const message = formatDebugArgs(args);
      const now = Date.now();
      const logKey = `${level}:${message}`;
      if (lastLogRef.current.key === logKey && now - lastLogRef.current.at < 1000) return;
      lastLogRef.current = { key: logKey, at: now };

      const entry = {
        id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
        level,
        at: new Date().toLocaleString('es-AR'),
        message,
      };

      pendingLogsRef.current.push(entry);
      if (logFlushTimerRef.current !== null) return;

      logFlushTimerRef.current = window.setTimeout(() => {
        const pendingLogs = pendingLogsRef.current.splice(0);
        logFlushTimerRef.current = null;
        if (!pendingLogs.length) return;
        setLogs((prev) => [...prev, ...pendingLogs].slice(-DEBUG_LOG_LIMIT));
      }, 0);
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
      const nextCrash = {
        type: 'runtime',
        message: event?.error?.message || event?.message || 'Error no controlado en tiempo de ejecución.',
        stack: event?.error?.stack || '',
        source: event?.filename
          ? `${event.filename}:${event.lineno || 0}:${event.colno || 0}`
          : 'window.error',
      };
      if (isDynamicImportLoadError(nextCrash)) nextCrash.type = 'dynamic-import';
      raiseCrash(nextCrash);
    };

    const handleUnhandledRejection = (event) => {
      const reason = event?.reason;
      const nextCrash = {
        type: 'promise',
        message: reason?.message || serializeDebugValue(reason) || 'Promise rechazada sin manejar.',
        stack: reason?.stack || '',
        source: 'unhandledrejection',
      };
      if (isDynamicImportLoadError(nextCrash)) nextCrash.type = 'dynamic-import';
      raiseCrash(nextCrash);
    };

    // Reloj monótono: con Date.now() un ajuste de hora o una suspensión de la PC
    // podía dar un "elapsed" menor al real y desactivar el detector sin que se
    // notara. Se redondea para arriba porque la resolución del reloj puede
    // devolver 7999,6 ms en un timer que ya venció.
    const ahora = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const bootStartedAt = ahora();

    const timeoutId = window.setTimeout(() => {
      const reportar = shouldReportBlankScreen({
        appReady: window.__REBU_APP_READY__,
        crashed: pushedCrashRef.current,
        elapsedMs: Math.ceil(ahora() - bootStartedAt),
        timeoutMs: BLANK_SCREEN_TIMEOUT_MS,
      });

      if (reportar) {
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
      if (logFlushTimerRef.current !== null) {
        window.clearTimeout(logFlushTimerRef.current);
        logFlushTimerRef.current = null;
      }
      pendingLogsRef.current = [];
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
