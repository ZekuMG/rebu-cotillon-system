import React, { useMemo, useState } from 'react';
import { Monitor, Search, UserRound, Wifi } from 'lucide-react';
import UserDisplayBadge from '../components/UserDisplayBadge';
import { resolveUserPresentation } from '../utils/userPresentation';
import useIncrementalFeed from '../hooks/useIncrementalFeed';

const SESSION_ABSENT_MS = 10 * 60 * 1000;
const SESSION_EXPIRED_MS = 60 * 60 * 1000;
const SESSION_ACTIONS = new Set([
  'Sesion Iniciada',
  'Sesion Cerrada',
  'Sesion Ausente',
  'Sesion Reanudada',
  'Sesion Expirada',
  'Sesión Iniciada',
  'Sesión Cerrada',
  'Sesión Ausente',
  'Sesión Reanudada',
  'Sesión Expirada',
  'Inicio de Sesión',
  'Cierre de Sesión',
  'Ausencia de Sesión',
  'Reanudación de Sesión',
  'Expiración de Sesión',
]);

const parseSessionTime = (value) => {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatDateTime = (value, fallbackDate = '--/--/--', fallbackTime = '--:--') => {
  if (!value) return `${fallbackDate} ${fallbackTime}`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return `${fallbackDate} ${fallbackTime}`;
  const dateLabel = date.toLocaleDateString('es-AR');
  const timeLabel = date.toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  return `${dateLabel} ${timeLabel}`;
};

const getRoleLabel = (role) => {
  if (role === 'admin') return 'Dueño';
  if (role === 'seller') return 'Caja';
  return 'Usuario';
};

const getSessionRoleLabel = (role) => {
  if (role === 'system') return 'Sistema';
  if (role === 'owner' || role === 'admin') return 'Dueño';
  if (role === 'seller') return 'Caja';
  return 'Usuario';
};

void getRoleLabel;

const matchesSessionDay = (session, dayFilter) => {
  if (!dayFilter) return true;
  const started = session.startedAt ? new Date(session.startedAt) : null;
  if (!started || Number.isNaN(started.getTime())) return false;
  const localYear = started.getFullYear();
  const localMonth = String(started.getMonth() + 1).padStart(2, '0');
  const localDay = String(started.getDate()).padStart(2, '0');
  return `${localYear}-${localMonth}-${localDay}` === dayFilter;
};

const getSessionStatus = (session, nowMs = Date.now()) => {
  if (session.closedAt) return 'Cerrada';
  if (session.expiredAt || session.status === 'Expirada') return 'Expirada';

  const activitySource = session.lastActivityAt || session.startedAt;
  const lastActivityMs = parseSessionTime(activitySource);
  const inactivityMs = lastActivityMs > 0 ? Math.max(0, nowMs - lastActivityMs) : 0;

  if (session.status === 'Ausente' || session.absentAt || inactivityMs >= SESSION_ABSENT_MS) {
    if (inactivityMs >= SESSION_EXPIRED_MS) return 'Expirada';
    return 'Ausente';
  }

  if (inactivityMs >= SESSION_EXPIRED_MS) return 'Expirada';
  return 'Activa';
};

const getStatusTone = (status) => {
  switch (status) {
    case 'Activa':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'Ausente':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    case 'Expirada':
      return 'border-rose-200 bg-rose-50 text-rose-700';
    default:
      return 'border-slate-200 bg-slate-100 text-slate-500';
  }
};

const getStatusMeta = (session, status) => {
  if (status === 'Cerrada') {
    return {
      primary: formatDateTime(session.closedAt, session.closedDate, session.closedTime),
      secondary: 'Cierre manual',
    };
  }

  if (status === 'Ausente') {
    return {
      primary: 'Ausente',
      secondary: `Sin movimiento desde ${formatDateTime(
        session.absentAt || session.lastActivityAt,
        session.date,
        session.timestamp,
      )}`,
    };
  }

  if (status === 'Expirada') {
    return {
      primary: 'Expirada',
      secondary: '1 hora sin actividad',
    };
  }

  return {
    primary: 'Activa',
    secondary: 'Sigue abierta',
  };
};

const getVisibleIpAddress = (ipAddress) => {
  const normalized = String(ipAddress || '').trim().toLowerCase();
  if (!normalized || normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1') {
    return null;
  }
  return ipAddress;
};

const isHiddenTestSession = (session) => {
  const visibleIp = getVisibleIpAddress(session?.ipAddress);
  if (!visibleIp) return true;

  const deviceName = String(session?.deviceName || '').trim().toLowerCase();
  const runtime = String(session?.runtime || '').trim().toLowerCase();
  const platform = String(session?.platform || '').trim().toLowerCase();

  const isUnknownWebSession =
    (runtime === 'web' || platform.includes('web')) &&
    (deviceName === 'equipo desconocido' || deviceName === 'unknown device');

  return isUnknownWebSession;
};

function MiniStat({ label, value, tone = 'slate' }) {
  const toneClasses = {
    slate: 'border-slate-200 bg-slate-100/90 text-slate-700',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  }[tone] || 'border-slate-200 bg-slate-100/90 text-slate-700';

  return (
    <div className={`w-[148px] rounded-[14px] border px-3 py-2 ${toneClasses}`}>
      <p className="text-[10px] font-black uppercase tracking-[0.12em] opacity-75">{label}</p>
      <p className="mt-1 text-[24px] leading-none font-black">{value}</p>
    </div>
  );
}

export default function SessionsView({ dailyLogs = [], currentSessionMeta = null, userCatalog = null, isLoading = false, emptyStateMessage = '' }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('Todos');
  const [dayFilter, setDayFilter] = useState('');

  const sessions = useMemo(() => {
    const logs = (Array.isArray(dailyLogs) ? dailyLogs : [])
      .filter((log) => SESSION_ACTIONS.has(log?.action))
      .slice()
      .sort((a, b) => parseSessionTime(a?.created_at) - parseSessionTime(b?.created_at));

    const sessionsMap = new Map();

    logs.forEach((log) => {
      const details = log?.details && typeof log.details === 'object' ? log.details : {};
      const sessionId =
        details.sessionId ||
        `${log?.user || details.userName || 'Sistema'}-${log?.created_at || log?.date || Date.now()}`;

      const current = sessionsMap.get(sessionId) || {
        sessionId,
        userName: details.userName || log?.user || 'Sistema',
        role: details.role || 'unknown',
        deviceName: details.deviceName || 'Equipo desconocido',
        ipAddress: details.ipAddress || 'No disponible',
        platform: details.platform || '--',
        runtime: details.runtime || '--',
        startedAt: null,
        startedDate: log?.date || '',
        startedTime: log?.timestamp || '',
        lastActivityAt: null,
        status: 'Activa',
        absentAt: null,
        expiredAt: null,
        closedAt: null,
        closedDate: '',
        closedTime: '',
      };

      current.userName = details.userName || current.userName;
      current.role = details.role || current.role;
      current.deviceName = details.deviceName || current.deviceName;
      current.ipAddress = details.ipAddress || current.ipAddress;
      current.platform = details.platform || current.platform;
      current.runtime = details.runtime || current.runtime;

      switch (log.action) {
        case 'Sesion Iniciada':
        case 'Sesión Iniciada':
          current.startedAt = details.startedAt || log.created_at || current.startedAt;
          current.startedDate = details.startedDate || log.date || current.startedDate;
          current.startedTime = details.startedTime || log.timestamp || current.startedTime;
          current.lastActivityAt = details.lastActivityAt || current.startedAt;
          current.status = details.status || 'Activa';
          break;
        case 'Sesion Ausente':
        case 'Sesión Ausente':
          current.status = 'Ausente';
          current.absentAt = details.absentAt || log.created_at || current.absentAt;
          current.lastActivityAt = details.lastActivityAt || current.lastActivityAt || current.startedAt;
          break;
        case 'Sesion Reanudada':
        case 'Sesión Reanudada':
          current.status = 'Activa';
          current.absentAt = null;
          current.lastActivityAt = details.lastActivityAt || log.created_at || current.lastActivityAt;
          break;
        case 'Sesion Expirada':
        case 'Sesión Expirada':
          current.status = 'Expirada';
          current.expiredAt = details.expiredAt || log.created_at || current.expiredAt;
          current.lastActivityAt = details.lastActivityAt || current.lastActivityAt || current.startedAt;
          break;
        case 'Sesion Cerrada':
        case 'Sesión Cerrada':
          current.status = 'Cerrada';
          current.closedAt = details.closedAt || log.created_at || current.closedAt;
          current.closedDate = details.closedDate || log.date || current.closedDate;
          current.closedTime = details.closedTime || log.timestamp || current.closedTime;
          current.lastActivityAt = details.lastActivityAt || current.lastActivityAt || current.startedAt;
          break;
        default:
          break;
      }

      sessionsMap.set(sessionId, current);
    });

    if (currentSessionMeta) {
      const current = sessionsMap.get(currentSessionMeta.sessionId) || {
        sessionId: currentSessionMeta.sessionId,
        userName: currentSessionMeta.userName || 'Sistema',
        role: currentSessionMeta.role || 'unknown',
        deviceName: currentSessionMeta.deviceName || 'Equipo desconocido',
        ipAddress: currentSessionMeta.ipAddress || 'No disponible',
        platform: currentSessionMeta.platform || '--',
        runtime: currentSessionMeta.runtime || '--',
        startedAt: currentSessionMeta.startedAt || null,
        startedDate: currentSessionMeta.startedDate || '',
        startedTime: currentSessionMeta.startedTime || '',
        lastActivityAt: currentSessionMeta.lastActivityAt || currentSessionMeta.startedAt || null,
        status: currentSessionMeta.status || 'Activa',
        absentAt: currentSessionMeta.absentAt || null,
        expiredAt: currentSessionMeta.expiredAt || null,
        closedAt: null,
        closedDate: '',
        closedTime: '',
      };

      sessionsMap.set(currentSessionMeta.sessionId, {
        ...current,
        ...currentSessionMeta,
      });
    }

    return Array.from(sessionsMap.values())
      .map((session) => ({
        ...session,
        derivedStatus: getSessionStatus(session),
      }))
      .filter((session) => !isHiddenTestSession(session))
      .sort((a, b) => parseSessionTime(b.startedAt) - parseSessionTime(a.startedAt));
  }, [dailyLogs, currentSessionMeta]);

  const filteredSessions = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return sessions.filter((session) => {
      const matchesStatus = statusFilter === 'Todos' || session.derivedStatus === statusFilter;
      if (!matchesStatus) return false;
      if (!matchesSessionDay(session, dayFilter)) return false;
      if (!normalizedSearch) return true;

      const searchableFields = [
        session.userName,
        getSessionRoleLabel(session.role),
        session.deviceName,
        getVisibleIpAddress(session.ipAddress),
        session.sessionId,
        session.platform,
        session.runtime,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return searchableFields.includes(normalizedSearch);
    });
  }, [dayFilter, searchTerm, sessions, statusFilter]);
  const visibleSessionsFeed = useIncrementalFeed(filteredSessions, {
    resetKey: `${searchTerm}|${statusFilter}|${dayFilter}|${filteredSessions.length}`,
  });

  const activeSessions = filteredSessions.filter((session) => session.derivedStatus === 'Activa');
  const sessionsForDayCount = useMemo(() => {
    const source = dayFilter ? sessions.filter((session) => matchesSessionDay(session, dayFilter)) : sessions;
    return source.length;
  }, [dayFilter, sessions]);

  if (isLoading && (!dailyLogs || dailyLogs.length === 0)) {
    return (
      <div className="flex h-full items-center justify-center rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <div className="text-center">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-slate-400">Cargando sesiones</p>
          <p className="mt-2 text-sm font-medium text-slate-500">Estamos trayendo el historial de sesiones y actividad.</p>
        </div>
      </div>
    );
  }

  if (emptyStateMessage && (!dailyLogs || dailyLogs.length === 0)) {
    return (
      <div className="flex h-full items-center justify-center rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <div className="max-w-md text-center">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-slate-400">Sesiones no disponibles</p>
          <p className="mt-2 text-sm font-medium text-slate-500">{emptyStateMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.95)_0%,rgba(248,250,252,0.98)_100%)] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_18px_36px_rgba(15,23,42,0.06)]" onScroll={visibleSessionsFeed.handleScroll}>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
            Gestor de Sesiones
          </p>
          <p className="mt-1 text-[13px] font-medium text-slate-500">
            Ingreso, cierre, estado y última actividad de cada usuario.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <MiniStat label="Activas" value={activeSessions.length} tone="emerald" />
          <MiniStat label={dayFilter ? 'Sesiones fecha' : 'Sesiones del día'} value={sessionsForDayCount} />
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-[18px] border border-slate-200 bg-slate-100/90 p-2 shadow-sm">
        <label className="flex min-w-[320px] flex-[1.4] items-center gap-2 rounded-[14px] border border-slate-200 bg-white px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]">
          <Search size={14} className="text-slate-500" />
          <input
            type="text"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Buscar usuario, equipo, IP o ID..."
            className="w-full bg-transparent text-[13px] font-semibold text-slate-700 outline-none placeholder:text-slate-500"
          />
        </label>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 rounded-[14px] border border-slate-200 bg-white px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]">
            <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Día</span>
            <input
              type="date"
              value={dayFilter}
              onChange={(event) => setDayFilter(event.target.value)}
              className="w-[132px] bg-transparent text-[13px] font-bold text-slate-700 outline-none [color-scheme:light]"
            />
          </label>

          <label className="flex items-center gap-2 rounded-[14px] border border-slate-200 bg-white px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]">
            <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Estado</span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="min-w-[94px] bg-transparent pr-1 text-[13px] font-bold text-slate-700 outline-none"
            >
              <option value="Todos">Todos</option>
              <option value="Activa">Activa</option>
              <option value="Ausente">Ausente</option>
              <option value="Expirada">Expirada</option>
              <option value="Cerrada">Cerrada</option>
            </select>
          </label>
        </div>
      </div>

      <div className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-[1.2fr_0.9fr_1fr_1fr_1fr_0.8fr] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
          <span>Usuario</span>
          <span>Equipo</span>
          <span>Ingreso</span>
          <span>Últ. actividad</span>
          <span>Salida / Estado</span>
          <span>IP</span>
        </div>

        <div className="divide-y divide-slate-100">
          {filteredSessions.length > 0 ? (
            visibleSessionsFeed.visibleItems.map((session) => {
              const status = session.derivedStatus;
              const statusMeta = getStatusMeta(session, status);
              const userPresentation = resolveUserPresentation(
                { name: session.userName, role: session.role },
                userCatalog,
              );

              return (
                <div
                  key={session.sessionId}
                  className="grid grid-cols-[1.2fr_0.9fr_1fr_1fr_1fr_0.8fr] gap-3 px-4 py-2.5 text-[13px] transition-colors hover:bg-slate-50/80"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <UserRound size={14} className="text-slate-400" />
                      <UserDisplayBadge
                        user={{ name: session.userName, role: session.role }}
                        userCatalog={userCatalog}
                        size="sm"
                        className="font-sans"
                        uppercase={false}
                      />
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.1em] ${getStatusTone(
                          status,
                        )}`}
                      >
                        {status}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-[12px] font-semibold text-slate-500">
                      {getSessionRoleLabel(userPresentation.type)} · {session.sessionId}
                    </p>
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Monitor size={14} className="text-slate-400" />
                      <p className="truncate font-bold text-slate-700">{session.deviceName}</p>
                    </div>
                    <p className="mt-0.5 truncate text-[12px] font-medium text-slate-400">
                      {session.platform} · {session.runtime}
                    </p>
                  </div>

                  <div className="min-w-0">
                    <p className="font-bold text-slate-700">
                      {formatDateTime(session.startedAt, session.startedDate, session.startedTime)}
                    </p>
                    <p className="mt-0.5 text-[12px] font-medium text-slate-400">Inicio de sesión</p>
                  </div>

                  <div className="min-w-0">
                    <p className="font-bold text-slate-700">
                      {formatDateTime(session.lastActivityAt, session.startedDate, session.startedTime)}
                    </p>
                    <p className="mt-0.5 text-[12px] font-medium text-slate-400">Último movimiento</p>
                  </div>

                  <div className="min-w-0">
                    <p
                      className={`font-bold ${
                        status === 'Activa'
                          ? 'text-emerald-600'
                          : status === 'Ausente'
                            ? 'text-amber-600'
                            : status === 'Expirada'
                              ? 'text-rose-600'
                              : 'text-slate-700'
                      }`}
                    >
                      {statusMeta.primary}
                    </p>
                    <p className="mt-0.5 text-[12px] font-medium text-slate-400">{statusMeta.secondary}</p>
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Wifi size={14} className="text-slate-400" />
                      <p className="truncate font-mono text-[12px] font-bold text-slate-700">
                        {getVisibleIpAddress(session.ipAddress) || '—'}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="px-6 py-12 text-center">
              <p className="text-base font-black text-slate-600">
                {sessions.length > 0
                  ? 'No hay sesiones que coincidan con el filtro'
                  : 'Todavía no hay sesiones registradas'}
              </p>
              <p className="mt-2 text-sm font-medium text-slate-400">
                {sessions.length > 0
                  ? 'Probá con otro texto o cambiá el estado seleccionado.'
                  : 'Cuando un usuario inicie o cierre sesión, va a aparecer acá.'}
              </p>
            </div>
          )}
        </div>
      </div>
      {filteredSessions.length > 0 && (
        <div className="mt-3 border-t border-slate-200 pt-3 text-[11px] font-semibold text-slate-500">
          Mostrando <span className="font-black text-slate-700">{visibleSessionsFeed.visibleCount}</span> de <span className="font-black text-slate-700">{filteredSessions.length}</span> sesiones
        </div>
      )}
    </div>
  );
}
