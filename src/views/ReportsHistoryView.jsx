import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  ChevronDown,
  ChevronRight,
  Clock,
  DollarSign,
  FileText,
  Filter,
  Folder,
  FolderOpen,
  Search,
  TrendingUp,
  User,
} from 'lucide-react';
import { normalizeDate } from '../utils/helpers';
import { FancyPrice } from '../components/FancyPrice';
import { DailyReportModal } from '../components/modals/DailyReportModal';
import useIncrementalFeed from '../hooks/useIncrementalFeed';

const getCanonicalType = (rawType) => {
  const normalized = String(rawType || '').toLowerCase();
  return normalized.includes('autom') ? 'Automatico' : 'Manual';
};

const getTypeLabel = (rawType) => (getCanonicalType(rawType) === 'Automatico' ? 'AUTO' : 'MANUAL');

const getDayKey = (report) => {
  const normalized = normalizeDate(report?.date);
  if (normalized && !Number.isNaN(normalized.getTime())) {
    return normalized.toISOString().slice(0, 10);
  }
  return String(report?.date || report?.id || 'sin-fecha');
};

const sortReportsDesc = (reports) =>
  [...reports].sort((a, b) => {
    const dateA = normalizeDate(a?.date) || new Date(0);
    const dateB = normalizeDate(b?.date) || new Date(0);

    if (dateA.getTime() !== dateB.getTime()) {
      return dateB.getTime() - dateA.getTime();
    }

    const idA = parseInt(String(a?.id || '').replace(/\D/g, ''), 10) || 0;
    const idB = parseInt(String(b?.id || '').replace(/\D/g, ''), 10) || 0;
    return idB - idA;
  });

export default function ReportsHistoryView({
  pastClosures,
  members,
  isLoading = false,
  emptyStateMessage = '',
  onLoadReportDetail,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedReport, setSelectedReport] = useState(null);
  const [typeFilter, setTypeFilter] = useState('Todas');
  const [loadingReportId, setLoadingReportId] = useState(null);
  const [detailError, setDetailError] = useState('');
  const [expandedDays, setExpandedDays] = useState({});

  const sortedAndFilteredClosures = useMemo(() => {
    const safeClosures = Array.isArray(pastClosures) ? pastClosures : [];
    const term = searchTerm.toLowerCase().trim();

    return sortReportsDesc(safeClosures).filter((report) => {
      const canonicalType = getCanonicalType(report?.type);
      const matchesType = typeFilter === 'Todas' || canonicalType === typeFilter;
      const matchesSearch =
        !term ||
        String(report?.date || '').toLowerCase().includes(term) ||
        String(report?.user || '').toLowerCase().includes(term) ||
        String(report?.id || '').toLowerCase().includes(term);

      return matchesType && matchesSearch;
    });
  }, [pastClosures, searchTerm, typeFilter]);

  const visibleReportsFeed = useIncrementalFeed(sortedAndFilteredClosures, {
    resetKey: `${searchTerm}|${typeFilter}|${sortedAndFilteredClosures.length}`,
  });

  const groupedVisibleClosures = useMemo(() => {
    const groupsMap = new Map();

    visibleReportsFeed.visibleItems.forEach((report) => {
      const dayKey = getDayKey(report);
      const existingGroup = groupsMap.get(dayKey);

      if (existingGroup) {
        existingGroup.reports.push(report);
        existingGroup.totalSales += Number(report?.totalSales || 0);
        existingGroup.netProfit += Number(report?.netProfit || 0);
        existingGroup.closuresCount += 1;
        existingGroup.newClientsCount += Number(report?.newClientsCount || report?.newClients?.length || 0);
        return;
      }

      groupsMap.set(dayKey, {
        key: dayKey,
        date: report?.date || '--/--/--',
        dateValue: normalizeDate(report?.date) || new Date(0),
        reports: [report],
        totalSales: Number(report?.totalSales || 0),
        netProfit: Number(report?.netProfit || 0),
        closuresCount: 1,
        newClientsCount: Number(report?.newClientsCount || report?.newClients?.length || 0),
      });
    });

    return [...groupsMap.values()].sort((a, b) => b.dateValue.getTime() - a.dateValue.getTime());
  }, [visibleReportsFeed.visibleItems]);

  useEffect(() => {
    if (groupedVisibleClosures.length === 0) {
      setExpandedDays({});
      return;
    }

    setExpandedDays((prev) => {
      const next = {};

      groupedVisibleClosures.forEach((group, index) => {
        next[group.key] = prev[group.key] ?? index === 0;
      });

      const hasAnyOpen = groupedVisibleClosures.some((group) => next[group.key]);
      if (!hasAnyOpen) {
        next[groupedVisibleClosures[0].key] = true;
      }

      return next;
    });
  }, [groupedVisibleClosures]);

  const handleToggleDay = (dayKey) => {
    setExpandedDays((prev) => ({
      ...prev,
      [dayKey]: !prev[dayKey],
    }));
  };

  const handleOpenReport = async (report) => {
    if (!report) return;

    setDetailError('');

    if (!onLoadReportDetail || report.hasDetail) {
      setSelectedReport(report);
      return;
    }

    setLoadingReportId(report.id);

    try {
      const detailedReport = await onLoadReportDetail(report.id);
      setSelectedReport(detailedReport || report);
    } catch (error) {
      console.error('No se pudo cargar el detalle del cierre:', error);
      setDetailError(error?.message || 'No pudimos cargar el detalle del cierre.');
    } finally {
      setLoadingReportId(null);
    }
  };

  if (isLoading && (!pastClosures || pastClosures.length === 0)) {
    return (
      <div className="flex h-full items-center justify-center rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="text-center">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-slate-400">Cargando cierres</p>
          <p className="mt-2 text-sm font-medium text-slate-500">Estamos trayendo reportes y cierres de caja.</p>
        </div>
      </div>
    );
  }

  if (emptyStateMessage && (!pastClosures || pastClosures.length === 0)) {
    return (
      <div className="flex h-full items-center justify-center rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="max-w-md text-center">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-slate-400">Cierres no disponibles</p>
          <p className="mt-2 text-sm font-medium text-slate-500">{emptyStateMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-slate-100">
      <div className="relative z-30 flex shrink-0 flex-wrap items-center justify-between gap-3 border-b bg-white p-4 shadow-sm">
        <div className="flex min-w-[300px] flex-1 items-center gap-2">
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Buscar por fecha, ID o usuario..."
              className="w-full rounded-lg border bg-slate-50 py-2 pl-10 pr-4 text-sm outline-none transition-all focus:bg-white focus:ring-2 focus:ring-fuchsia-500"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <select
              className="cursor-pointer appearance-none rounded-lg border bg-slate-50 py-2 pl-9 pr-8 text-sm outline-none focus:ring-2 focus:ring-fuchsia-500"
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
            >
              <option value="Todas">Todos los tipos</option>
              <option value="Manual">Manual</option>
              <option value="Automatico">Automatico</option>
            </select>
          </div>
        </div>

        <div className="hidden items-center gap-3 rounded-lg border border-fuchsia-100 bg-fuchsia-50 px-4 py-2 md:flex">
          <FolderOpen className="text-fuchsia-600" size={18} />
          <span className="text-sm font-bold uppercase tracking-tight text-fuchsia-900">Reportes por dia</span>
        </div>
      </div>

      {detailError && (
        <div className="mx-4 mt-4 rounded-[18px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} />
            <span>{detailError}</span>
          </div>
        </div>
      )}

      <div className="custom-scrollbar flex-1 overflow-y-auto p-4" onScroll={visibleReportsFeed.handleScroll}>
        {sortedAndFilteredClosures.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-slate-400">
            <FileText size={64} className="mb-4 text-slate-300" />
            <p className="text-lg font-medium">No se encontraron reportes</p>
            <p className="text-sm">Intenta ajustar los filtros de busqueda</p>
          </div>
        ) : (
          <div className="space-y-3 pb-8">
            {groupedVisibleClosures.map((group) => {
              const isExpanded = Boolean(expandedDays[group.key]);

              return (
                <div
                  key={group.key}
                  className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
                >
                  <button
                    type="button"
                    onClick={() => handleToggleDay(group.key)}
                    className="flex w-full items-center gap-4 border-b border-slate-200 bg-slate-50/80 px-4 py-3 text-left transition-colors hover:bg-slate-100/80"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-fuchsia-100 bg-fuchsia-50 text-fuchsia-600">
                        {isExpanded ? <FolderOpen size={20} /> : <Folder size={20} />}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[15px] font-black text-slate-900">{group.date}</span>
                          <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
                            {group.closuresCount} cierres
                          </span>
                        </div>
                        <p className="mt-0.5 text-[11px] font-medium text-slate-500">
                          Reportes agrupados del dia seleccionado
                        </p>
                      </div>
                    </div>

                    <div className="hidden items-center gap-5 md:flex">
                      <div className="text-right">
                        <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Ventas del dia</p>
                        <div className="mt-1 text-lg font-black text-slate-900">
                          <FancyPrice amount={group.totalSales} />
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Ganancia neta</p>
                        <div className={`mt-1 text-lg font-black ${group.netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          <FancyPrice amount={group.netProfit} />
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Nuevos socios</p>
                        <div className="mt-1 text-lg font-black text-sky-600">
                          {group.newClientsCount}
                        </div>
                      </div>
                    </div>

                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500">
                      {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="space-y-2 bg-white p-3">
                      {group.reports.map((report) => (
                        <button
                          key={report.id}
                          type="button"
                          onClick={() => void handleOpenReport(report)}
                          disabled={loadingReportId === report.id}
                          className="relative flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-left transition-all hover:border-fuchsia-300 hover:shadow-sm disabled:cursor-wait"
                        >
                          {loadingReportId === report.id && (
                            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-white/85 text-xs font-black uppercase tracking-[0.12em] text-fuchsia-700">
                              Cargando detalle...
                            </div>
                          )}

                          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                            getCanonicalType(report.type) === 'Automatico'
                              ? 'bg-amber-50 text-amber-600'
                              : 'bg-slate-100 text-slate-700'
                          }`}>
                            <FileText size={18} />
                          </div>

                          <div className="grid min-w-0 flex-1 gap-2 md:grid-cols-[1.1fr_0.7fr_0.7fr_0.7fr_0.8fr_0.7fr]">
                            <div className="min-w-0">
                              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Cierre</p>
                              <div className="mt-1 flex items-center gap-2 text-sm font-black text-slate-900">
                                <Calendar size={13} className="shrink-0 text-fuchsia-500" />
                                <span>{report.date}</span>
                                <Clock size={13} className="shrink-0 text-slate-400" />
                                <span>{report.closeTime || '--:--'}</span>
                              </div>
                            </div>

                            <div>
                              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Tipo</p>
                              <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] ${
                                getCanonicalType(report.type) === 'Automatico'
                                  ? 'bg-amber-100 text-amber-700'
                                  : 'bg-slate-100 text-slate-700'
                              }`}>
                                {getTypeLabel(report.type)}
                              </span>
                            </div>

                            <div>
                              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Ventas</p>
                              <div className="mt-1 text-sm font-black text-slate-900">
                                <FancyPrice amount={report.totalSales} />
                              </div>
                            </div>

                            <div>
                              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Ganancia</p>
                              <div className={`mt-1 text-sm font-black ${report.netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                <FancyPrice amount={report.netProfit} />
                              </div>
                            </div>

                            <div>
                              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Usuario</p>
                              <div className="mt-1 flex items-center gap-1.5 text-sm font-bold text-slate-700">
                                <User size={13} className="shrink-0 text-slate-400" />
                                <span className="truncate">{report.user || 'Sistema'}</span>
                              </div>
                            </div>

                            <div>
                              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Nuevos socios</p>
                              <div className="mt-1 text-sm font-black text-sky-600">
                                {Number(report?.newClientsCount || report?.newClients?.length || 0)}
                              </div>
                            </div>
                          </div>

                          <span className="hidden shrink-0 items-center gap-1 text-xs font-bold text-fuchsia-600 md:inline-flex">
                            Ver detalle <ChevronRight size={14} />
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {sortedAndFilteredClosures.length > 0 && (
        <div className="border-t border-slate-200 bg-white px-4 py-2 text-[11px] font-semibold text-slate-500">
          Mostrando <span className="font-black text-slate-700">{visibleReportsFeed.visibleCount}</span> de{' '}
          <span className="font-black text-slate-700">{sortedAndFilteredClosures.length}</span> cierres
        </div>
      )}

      <DailyReportModal
        isOpen={!!selectedReport}
        onClose={() => setSelectedReport(null)}
        report={selectedReport}
        members={members}
      />
    </div>
  );
}
