import React, { useLayoutEffect, useRef, useState } from 'react';
import { BarChart3, CalendarDays, Minus, Plus, ShoppingCart, X } from 'lucide-react';
import { FancyPrice } from '../FancyPrice';

export const SalesChart = ({ chartData, maxSales, globalFilter, getEmptyStateMessage }) => {
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [selectedDay, setSelectedDay] = useState(null);
  const [annualZoom, setAnnualZoom] = useState(1);
  const [annualMetricMode, setAnnualMetricMode] = useState('net');
  const annualWidgetRef = useRef(null);
  const annualScrollRef = useRef(null);
  const dragStateRef = useRef({ active: false, moved: false, startX: 0, startScrollLeft: 0 });
  const annualScrollRatioRef = useRef(null);
  const didInitAnnualScrollRef = useRef(false);
  const annualUserMovedRef = useRef(false);
  const annualAnchorRightRef = useRef(true);
  const annualSyncingScrollRef = useRef(false);

  useLayoutEffect(() => {
    if (globalFilter !== 'year') {
      didInitAnnualScrollRef.current = false;
      annualScrollRatioRef.current = null;
       annualUserMovedRef.current = false;
       annualAnchorRightRef.current = true;
      return;
    }
    if (!annualScrollRef.current) return;

    const scrollElement = annualScrollRef.current;
    const frameId = requestAnimationFrame(() => {
      const maxScroll = Math.max(scrollElement.scrollWidth - scrollElement.clientWidth, 0);

      if (!didInitAnnualScrollRef.current || annualAnchorRightRef.current) {
        annualSyncingScrollRef.current = true;
        scrollElement.scrollLeft = maxScroll;
        annualAnchorRightRef.current = false;
        annualScrollRatioRef.current = null;
        didInitAnnualScrollRef.current = true;
      } else if (annualScrollRatioRef.current != null) {
        annualSyncingScrollRef.current = true;
        scrollElement.scrollLeft = maxScroll * annualScrollRatioRef.current;
        annualScrollRatioRef.current = null;
      }

      scrollElement.style.cursor = 'grab';
      requestAnimationFrame(() => {
        annualSyncingScrollRef.current = false;
      });
    });

    return () => cancelAnimationFrame(frameId);
  }, [globalFilter, annualZoom, chartData.length]);

  if (globalFilter === 'year') {
    const annualZoomBase = 2.5;
    const chartHeight = 340;
    const annualTopInset = 74;
    const annualDatesHeight = 40;
    const padding = { top: 18, right: 0, bottom: 18, left: 10 };
    const baseDayStep = 4.6;
    const baseMonthGap = 56;
    const effectiveAnnualZoom = annualZoom * annualZoomBase;
    const dayStep = baseDayStep * effectiveAnnualZoom;
    const monthGap = baseMonthGap * effectiveAnnualZoom;
    const totalMonthGaps = Math.max(chartData.filter((item, idx) => idx > 0 && item.isMonthStart).length, 0) * monthGap;
    const chartWidth = Math.max(365, ((chartData.length - 1) * dayStep) + totalMonthGaps + padding.left + padding.right);
    const drawableWidth = chartWidth - padding.left - padding.right;
    const drawableHeight = chartHeight - padding.top - padding.bottom;
    let runningSales = 0;
    let accumulatedMonthGap = 0;
    const points = chartData.map((item, idx) => {
      runningSales += item.sales || 0;
      if (idx > 0 && item.isMonthStart) {
        accumulatedMonthGap += monthGap;
      }
      return {
        ...item,
        cumulativeSales: runningSales,
        cumulativeNet: 0,
        x: padding.left + (idx * dayStep) + accumulatedMonthGap,
        y: 0,
      };
    });
    let runningNet = 0;
    points.forEach((point) => {
      runningNet += point.net || 0;
      point.cumulativeNet = runningNet;
    });
    points.forEach((point) => {
      point.metricValue = annualMetricMode === 'net' ? point.cumulativeNet : point.cumulativeSales;
      point.dayMetric = annualMetricMode === 'net' ? (point.net || 0) : (point.sales || 0);
      point.isNegativeDay = annualMetricMode === 'net' && point.dayMetric < 0;
    });
    const metricValues = points.map((point) => point.metricValue);
    const metricMin = annualMetricMode === 'net' ? Math.min(0, ...metricValues) : 0;
    const metricMax = Math.max(...metricValues, annualMetricMode === 'net' ? 0 : 1);
    const metricRange = Math.max(metricMax - metricMin, 1);
    const scaleValues = [
      metricMax,
      metricMin + (metricRange * 0.66),
      metricMin + (metricRange * 0.33),
      metricMin,
    ];
    points.forEach((point) => {
      point.y = padding.top + drawableHeight - (((point.metricValue - metricMin) / metricRange) * drawableHeight);
    });
    const annualMetricMeta = annualMetricMode === 'net'
      ? { id: 'net', label: 'Ganancia neta', shortLabel: 'Neto', accent: 'emerald' }
      : { id: 'sales', label: 'Facturacion', shortLabel: 'Facturacion', accent: 'sky' };
    const hoveredPoint = hoveredIndex != null ? points[hoveredIndex] : null;
    const linePath = points.map((point, idx) => `${idx === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
    const areaPath = `${linePath} L ${padding.left + drawableWidth} ${padding.top + drawableHeight} L ${padding.left} ${padding.top + drawableHeight} Z`;
    const monthMarkers = points.filter((point) => point.isMonthStart);
    const currentPoint = points.find((point) => point.isCurrent) || points[points.length - 1];
    const activeDays = chartData.filter((item) => item.sales > 0).length;
    const totalTransactions = chartData.reduce((acc, item) => acc + item.count, 0);
    const accumulatedNet = points[points.length - 1]?.cumulativeNet || 0;
    const hoveredTooltipLeft = hoveredPoint && annualScrollRef.current
      ? annualScrollRef.current.offsetLeft + hoveredPoint.x - annualScrollRef.current.scrollLeft
      : null;
    const hoveredTooltipTop = hoveredPoint && annualScrollRef.current
      ? Math.max(annualScrollRef.current.offsetTop - 8, 52)
      : null;
    const monthSegments = monthMarkers.map((marker, idx) => {
      const nextMarker = monthMarkers[idx + 1];
      const startX = idx === 0 ? padding.left : marker.x;
      const endX = nextMarker ? nextMarker.x : padding.left + drawableWidth;
      return {
        ...marker,
        startX,
        endX,
        width: Math.max(endX - startX, dayStep * 6),
      };
    });
    const handleAnnualPointerDown = (event) => {
      if (!annualScrollRef.current || event.button !== 0) return;
      dragStateRef.current = {
        active: true,
        moved: false,
        startX: event.clientX,
        startScrollLeft: annualScrollRef.current.scrollLeft,
      };
      annualScrollRef.current.style.cursor = 'grabbing';
      annualScrollRef.current.style.userSelect = 'none';
    };
    const handleAnnualPointerMove = (event) => {
      if (!annualScrollRef.current || !dragStateRef.current.active) return;
      const deltaX = event.clientX - dragStateRef.current.startX;
      if (Math.abs(deltaX) > 6) {
        dragStateRef.current.moved = true;
        annualUserMovedRef.current = true;
      }
      annualScrollRef.current.scrollLeft = dragStateRef.current.startScrollLeft - deltaX;
    };
    const stopAnnualPointerDrag = () => {
      if (!annualScrollRef.current) return;
      dragStateRef.current.active = false;
      annualScrollRef.current.style.cursor = 'grab';
      annualScrollRef.current.style.removeProperty('user-select');
    };
    const updateAnnualZoom = (nextZoom) => {
      if (annualScrollRef.current && annualUserMovedRef.current) {
        const scrollElement = annualScrollRef.current;
        const maxScroll = Math.max(scrollElement.scrollWidth - scrollElement.clientWidth, 0);
        annualScrollRatioRef.current = maxScroll > 0 ? scrollElement.scrollLeft / maxScroll : 1;
        annualAnchorRightRef.current = false;
      } else {
        annualAnchorRightRef.current = true;
        annualScrollRatioRef.current = null;
      }
      setAnnualZoom(nextZoom);
    };
    const handleAnnualDayClick = (point) => {
      if (dragStateRef.current.moved) {
        dragStateRef.current.moved = false;
        return;
      }
      setSelectedDay(point);
    };
    const handleAnnualWheel = (event) => {
      if (!annualScrollRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      const wheelDirection = event.deltaY === 0 ? event.deltaX : event.deltaY;
      if (wheelDirection === 0) return;
      const zoomDelta = wheelDirection < 0 ? 0.25 : -0.25;
      const nextZoom = Math.min(4, Math.max(0.5, Number((annualZoom + zoomDelta).toFixed(2))));
      if (nextZoom !== annualZoom) {
        updateAnnualZoom(nextZoom);
      }
    };
    const handleAnnualScroll = () => {
      if (!annualScrollRef.current || annualSyncingScrollRef.current) return;
      const scrollElement = annualScrollRef.current;
      const maxScroll = Math.max(scrollElement.scrollWidth - scrollElement.clientWidth, 0);
      const distanceToRight = maxScroll - scrollElement.scrollLeft;
      annualUserMovedRef.current = distanceToRight > 2;
      if (!annualUserMovedRef.current) {
        annualAnchorRightRef.current = true;
      }
    };

    return (
      <div ref={annualWidgetRef} className="relative h-full overflow-visible rounded-[30px] border border-slate-200 bg-[linear-gradient(145deg,#fbfffd_0%,#f8fbff_48%,#ffffff_100%)] shadow-[0_24px_60px_rgba(15,23,42,0.08)]">
        {hoveredPoint && hoveredTooltipLeft != null && hoveredTooltipTop != null && (
          <div
            className="pointer-events-none absolute z-[160] -translate-x-1/2 -translate-y-full rounded-[22px] border border-emerald-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(240,253,244,0.98)_100%)] px-3 py-2 text-[10px] text-slate-800 shadow-[0_22px_45px_rgba(15,23,42,0.18)]"
            style={{
              left: `${hoveredTooltipLeft}px`,
              top: `${hoveredTooltipTop}px`,
            }}
          >
            <p className="font-bold capitalize">{hoveredPoint.dayNum} de {hoveredPoint.monthName} {hoveredPoint.year}</p>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{annualMetricMeta.label}</p>
            <p className={`text-xs font-black ${hoveredPoint.metricValue < 0 ? 'text-rose-600' : 'text-emerald-600'}`}><FancyPrice amount={hoveredPoint.metricValue} /></p>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Dia</p>
            <p className="text-[11px] font-bold text-slate-700"><FancyPrice amount={hoveredPoint.sales} /> · {hoveredPoint.count} {hoveredPoint.count === 1 ? 'Venta' : 'Ventas'}</p>
          </div>
        )}
        <div>
          <div className="overflow-hidden rounded-[30px] border border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.9)_0%,rgba(244,252,248,0.94)_45%,rgba(247,250,255,0.98)_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.96),0_18px_38px_rgba(15,23,42,0.08)]">
            <div className="flex gap-1.5 p-1.5">
              <div className="flex flex-col" style={{ minWidth: '78px' }}>
                <div style={{ height: `${annualTopInset}px` }}></div>
                <div className="flex flex-col justify-between rounded-[22px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.94)_0%,rgba(241,248,255,0.88)_100%)] px-2.5 py-3 text-right shadow-[inset_0_1px_0_rgba(255,255,255,0.96)] backdrop-blur-[1px]" style={{ height: `${chartHeight}px` }}>
                  <span className={`text-[10px] font-black ${scaleValues[0] < 0 ? 'text-rose-600' : 'text-indigo-600'}`}><FancyPrice amount={scaleValues[0]} /></span>
                  <span className={`text-[10px] font-bold ${scaleValues[1] < 0 ? 'text-rose-500' : 'text-sky-600'}`}><FancyPrice amount={scaleValues[1]} /></span>
                  <span className={`text-[10px] font-bold ${scaleValues[2] < 0 ? 'text-rose-500' : 'text-cyan-600'}`}><FancyPrice amount={scaleValues[2]} /></span>
                  <span className={`text-[10px] font-black ${scaleValues[3] < 0 ? 'text-rose-600' : 'text-emerald-600'}`}><FancyPrice amount={scaleValues[3]} /></span>
                </div>
                <div style={{ height: `${annualDatesHeight}px` }}></div>
              </div>

              <div className="group relative min-w-0 flex-1 overflow-hidden rounded-[26px] border border-white/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.68)_0%,rgba(248,253,251,0.72)_44%,rgba(246,250,255,0.82)_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.96)]">
                <div className="hidden pointer-events-none absolute inset-x-2 top-2 z-20 flex items-start gap-2 pr-[118px]">
                  <div className="pointer-events-auto w-full max-w-[280px] rounded-[22px] border border-white/90 bg-[linear-gradient(145deg,rgba(255,255,255,0.96)_0%,rgba(241,253,247,0.88)_100%)] px-3 py-3 shadow-[0_14px_32px_rgba(15,23,42,0.08)] backdrop-blur-sm">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[16px] border border-emerald-200 bg-emerald-50 text-emerald-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
                        <BarChart3 size={18} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-800">
                            Evolucion anual
                          </span>
                          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.16em] text-emerald-700">
                            Neto
                          </span>
                        </div>
                        <p className="mt-1 text-[12px] font-semibold leading-tight text-slate-700">
                          Lectura acumulada del periodo con hoy fijo al extremo derecho.
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <div className="rounded-[16px] border border-slate-200/80 bg-white/70 px-2.5 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
                        <span className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-400">
                          Rango
                        </span>
                        <p className="mt-1 text-[12px] font-bold text-slate-800">365 dias</p>
                      </div>
                      <div className="rounded-[16px] border border-slate-200/80 bg-white/70 px-2.5 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
                        <span className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-400">
                          Enfoque
                        </span>
                        <p className="mt-1 text-[12px] font-bold text-slate-800">Hoy a la derecha</p>
                      </div>
                    </div>
                  </div>

                  <div className="pointer-events-auto ml-auto grid min-w-[360px] grid-cols-3 gap-2">
                    <div className="rounded-[20px] border border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(239,246,255,0.92)_100%)] px-3 py-2 shadow-[0_12px_30px_rgba(15,23,42,0.06)] backdrop-blur-sm">
                      <span className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">
                        Ganancia neta
                      </span>
                      <div className="mt-1 text-sm font-black text-slate-800">
                        <FancyPrice amount={accumulatedNet} />
                      </div>
                    </div>
                    <div className="rounded-[20px] border border-sky-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(240,249,255,0.92)_100%)] px-3 py-2 shadow-[0_12px_30px_rgba(15,23,42,0.06)] backdrop-blur-sm">
                      <span className="text-[9px] font-black uppercase tracking-[0.16em] text-sky-700">
                        Dias activos
                      </span>
                      <div className="mt-1 text-sm font-black text-slate-800">
                        {activeDays}
                      </div>
                    </div>
                    <div className="rounded-[20px] border border-emerald-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(236,253,245,0.92)_100%)] px-3 py-2 shadow-[0_12px_30px_rgba(15,23,42,0.06)] backdrop-blur-sm">
                      <span className="text-[9px] font-black uppercase tracking-[0.16em] text-emerald-700">
                        Ventas
                      </span>
                      <div className="mt-1 text-sm font-black text-slate-800">
                        {totalTransactions}
                      </div>
                    </div>
                  </div>
                </div>
              <div className="hidden absolute left-2 top-2 z-20 rounded-[18px] border border-white/90 bg-white/90 px-3 py-2 shadow-[0_10px_24px_rgba(15,23,42,0.08)] backdrop-blur-sm">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] text-white">
                    Informacion
                  </span>
                  <span className="text-[10px] font-semibold text-slate-500">
                    Anual
                  </span>
                </div>
                <div className="mt-1 text-[12px] font-bold text-slate-800">
                  Curva acumulada del periodo.
                </div>
                <div className="mt-1 flex items-center gap-2 text-[10px] font-semibold text-slate-500">
                  <span>365 dias</span>
                  <span>·</span>
                  <span>Hoy a la derecha</span>
                </div>
              </div>
              <div className="hidden absolute left-[236px] top-2 z-20 rounded-[18px] border border-white/90 bg-white/90 px-3 py-2 shadow-[0_10px_24px_rgba(15,23,42,0.08)] backdrop-blur-sm">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] text-white">
                    Metricas
                  </span>
                  <span className="text-[10px] font-semibold text-slate-500">
                    Resumen
                  </span>
                </div>
                <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                  Ganancia neta
                </div>
                <div className="mt-0.5 text-sm font-black text-slate-800">
                  <FancyPrice amount={accumulatedNet} />
                </div>
                <div className="mt-1 flex items-center gap-2 text-[10px] font-semibold text-slate-500">
                  <span>{activeDays} dias activos</span>
                  <span>·</span>
                  <span>{totalTransactions} ventas</span>
                </div>
              </div>
                <div className="pointer-events-none absolute inset-x-0 top-0 z-20">
                  <div className="pointer-events-auto flex items-center justify-between gap-3 border-b border-white/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.96)_0%,rgba(240,250,246,0.92)_45%,rgba(241,246,255,0.94)_100%)] px-3 py-2 shadow-[0_14px_28px_rgba(15,23,42,0.06)] backdrop-blur-sm">
                    <div className="flex min-w-0 items-center gap-2.5">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px] border border-emerald-200 bg-[linear-gradient(180deg,#ecfdf5_0%,#d1fae5_100%)] text-emerald-700 shadow-[0_8px_18px_rgba(16,185,129,0.14)]">
                          <BarChart3 size={18} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-800">
                              Evolucion anual
                            </span>
                            <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.1em] ${annualMetricMode === 'net' ? 'border border-emerald-200 bg-emerald-50 text-emerald-700' : 'border border-sky-200 bg-sky-50 text-sky-700'}`}>
                              {annualMetricMeta.shortLabel}
                            </span>
                          </div>
                          <p className="mt-0.5 text-[10px] font-semibold text-slate-500">
                            {activeDays} dias activos · {totalTransactions} ventas
                          </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setAnnualMetricMode('sales')}
                        className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.08em] transition ${annualMetricMode === 'sales' ? 'border border-sky-200 bg-sky-50 text-sky-700 shadow-sm' : 'border border-slate-200 bg-white/90 text-slate-500 hover:bg-white'}`}
                      >
                        Facturacion
                      </button>
                      <button
                        type="button"
                        onClick={() => setAnnualMetricMode('net')}
                        className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.08em] transition ${annualMetricMode === 'net' ? 'border border-emerald-200 bg-emerald-50 text-emerald-700 shadow-sm' : 'border border-slate-200 bg-white/90 text-slate-500 hover:bg-white'}`}
                      >
                        Ganancia neta
                      </button>
                    </div>
                  </div>
                </div>
              <div
                className="absolute left-3 z-20 flex items-center gap-1 rounded-[18px] border border-slate-200/90 bg-white/92 px-2 py-1 opacity-0 shadow-[0_10px_24px_rgba(15,23,42,0.08)] transition duration-150 group-hover:opacity-100"
                style={{ top: `${annualTopInset + 8}px` }}
              >
                <button
                  type="button"
                  onClick={() => updateAnnualZoom(Math.max(0.5, Number((annualZoom - 0.25).toFixed(2))))}
                  disabled={annualZoom <= 0.5}
                  className="rounded-lg p-1 text-slate-500 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Alejar grafica"
                >
                  <Minus size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => updateAnnualZoom(1)}
                  className="min-w-[52px] rounded-lg px-2 py-1 text-[11px] font-bold text-slate-600 transition hover:bg-slate-100"
                >
                  {Math.round(annualZoom * 100)}%
                </button>
                <button
                  type="button"
                  onClick={() => updateAnnualZoom(Math.min(4, Number((annualZoom + 0.25).toFixed(2))))}
                  disabled={annualZoom >= 4}
                  className="rounded-lg p-1 text-slate-500 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Acercar grafica"
                >
                  <Plus size={14} />
                </button>
              </div>
              <div className="absolute inset-x-0 top-0 flex flex-col justify-between pointer-events-none" style={{ height: `${chartHeight}px` }}>
                <div></div>
                <div className="border-t border-dashed border-slate-200"></div>
                <div className="border-t border-dashed border-slate-200"></div>
                <div></div>
              </div>

              {!chartData.some((item) => item.sales > 0) && (
                <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[24px] bg-white/70 backdrop-blur-[1px]">
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold uppercase tracking-wide text-slate-400 shadow-sm">
                    {getEmptyStateMessage()}
                  </span>
                </div>
              )}

              <div
                ref={annualScrollRef}
                className="overflow-x-auto overflow-y-visible pb-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                style={{ cursor: 'grab', overscrollBehavior: 'contain', paddingTop: `${annualTopInset}px` }}
                onMouseDown={handleAnnualPointerDown}
                onMouseMove={handleAnnualPointerMove}
                onMouseUp={stopAnnualPointerDrag}
                onMouseLeave={stopAnnualPointerDrag}
                onScroll={handleAnnualScroll}
                onWheelCapture={handleAnnualWheel}
                onWheel={handleAnnualWheel}
              >
                <div className="relative" style={{ width: `${chartWidth}px`, minWidth: '240px' }}>
                  <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="overflow-visible" style={{ width: `${chartWidth}px`, minWidth: '240px', height: `${chartHeight}px` }}>
                    <defs>
                      <linearGradient id="yearChartArea" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor={annualMetricMode === 'net' ? '#059669' : '#0ea5e9'} stopOpacity="0.28" />
                        <stop offset="58%" stopColor={annualMetricMode === 'net' ? '#10b981' : '#38bdf8'} stopOpacity="0.14" />
                        <stop offset="100%" stopColor="#ffffff" stopOpacity="0.02" />
                      </linearGradient>
                      <linearGradient id="yearChartStroke" x1="0" x2="1" y1="0" y2="0">
                        <stop offset="0%" stopColor={annualMetricMode === 'net' ? '#34d399' : '#38bdf8'} />
                        <stop offset="52%" stopColor={annualMetricMode === 'net' ? '#10b981' : '#0ea5e9'} />
                        <stop offset="100%" stopColor={annualMetricMode === 'net' ? '#14b8a6' : '#2563eb'} />
                      </linearGradient>
                      <filter id="yearLineGlow" x="-20%" y="-20%" width="140%" height="140%">
                        <feGaussianBlur stdDeviation="4.5" result="blur" />
                        <feMerge>
                          <feMergeNode in="blur" />
                          <feMergeNode in="SourceGraphic" />
                        </feMerge>
                      </filter>
                    </defs>

                    {monthSegments.map((segment, idx) => (
                      <g key={`segment-${idx}`}>
                        <rect
                          x={segment.startX}
                          y={padding.top}
                          width={segment.width}
                          height={drawableHeight}
                          fill={idx % 2 === 0 ? '#f8fafc' : '#ecfdf5'}
                          opacity="0.78"
                          rx="10"
                        />
                        <line
                          x1={segment.startX}
                          x2={segment.startX}
                          y1={padding.top}
                          y2={padding.top + drawableHeight}
                          stroke="#cbd5e1"
                          strokeDasharray="4 6"
                          strokeWidth="1"
                        />
                      </g>
                    ))}

                    {monthMarkers.map((marker, idx) => (
                      <line
                        key={`marker-${idx}`}
                        x1={marker.x}
                        x2={marker.x}
                        y1={padding.top}
                        y2={padding.top + drawableHeight}
                        stroke={marker.isCurrent ? '#16a34a' : '#e2e8f0'}
                        strokeDasharray={marker.isCurrent ? '0' : '2 4'}
                        strokeWidth={marker.isCurrent ? '1.2' : '1'}
                        opacity={marker.isCurrent ? 0.9 : 1}
                      />
                    ))}

                    {currentPoint && (
                      <line
                        x1={currentPoint.x}
                        x2={currentPoint.x}
                        y1={padding.top}
                        y2={padding.top + drawableHeight}
                        stroke={currentPoint.isNegativeDay ? '#e11d48' : (annualMetricMode === 'net' ? '#16a34a' : '#2563eb')}
                        strokeWidth="1.3"
                        opacity="0.9"
                      />
                    )}

                    <path d={areaPath} fill="url(#yearChartArea)" opacity={chartData.some((item) => item.sales > 0) ? 1 : 0.4} />
                    <path
                      d={linePath}
                      fill="none"
                      stroke="url(#yearChartStroke)"
                      strokeWidth="3.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      filter="url(#yearLineGlow)"
                      opacity={chartData.some((item) => item.sales > 0) ? 1 : 0.35}
                    />

                    {points.map((point, idx) => (
                      <g
                        key={`${point.shortLabel}-${point.year}-${idx}`}
                        onMouseEnter={() => setHoveredIndex(idx)}
                        onMouseLeave={() => setHoveredIndex(null)}
                      >
                        {point.isCurrent && (
                        <circle
                          cx={point.x}
                          cy={point.y}
                          r="9"
                          fill={point.isNegativeDay ? '#f43f5e' : '#22c55e'}
                          opacity="0.18"
                          className="pointer-events-none"
                        />
                      )}
                      {(point.isMonthStart || point.isCurrent || hoveredIndex === idx || point.isNegativeDay) && (
                          <circle
                          cx={point.x}
                          cy={point.y}
                          r={point.isCurrent ? 4.6 : hoveredIndex === idx ? 3.8 : 3.2}
                          fill="#ffffff"
                          stroke={point.isNegativeDay ? '#e11d48' : point.isCurrent ? '#16a34a' : annualMetricMode === 'net' ? '#22c55e' : '#2563eb'}
                          strokeWidth="2"
                          className="cursor-pointer transition-all"
                        />
                        )}
                        <rect
                          x={Math.max(point.x - Math.max(dayStep / 2, 6), 0)}
                          y={0}
                          width={Math.max(dayStep, 12)}
                          height={chartHeight}
                          fill="transparent"
                          className="cursor-pointer"
                          onMouseEnter={() => setHoveredIndex(idx)}
                          onMouseMove={() => setHoveredIndex(idx)}
                          onClick={() => handleAnnualDayClick(point)}
                        />
                      </g>
                    ))}
                  </svg>

                  <div className="relative mt-0 border-t border-slate-200/80 pt-1" style={{ height: `${annualDatesHeight}px` }}>
                    {monthSegments.map((item, idx) => {
                      const centerX = item.startX + (item.width / 2);
                      return (
                        <div
                          key={`${item.label || item.shortLabel}-${idx}`}
                          className="absolute top-1.5 -translate-x-1/2 text-center"
                          style={{ left: `${centerX}px` }}
                        >
                          <span className={`inline-flex whitespace-nowrap rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-[0.14em] ${item.isCurrent ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-500'}`}>
                            {item.label || item.shortLabel}
                          </span>
                        </div>
                      );
                    })}
                    {currentPoint && (
                      <div
                        className="absolute top-1.5 -translate-x-1/2 text-center"
                        style={{ left: `${currentPoint.x}px` }}
                      >
                        <span className="inline-flex whitespace-nowrap rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[9px] font-black uppercase tracking-[0.14em] text-emerald-700">
                          {currentPoint.shortLabel}
                        </span>
                      </div>
                    )}
              </div>
            </div>
          </div>
        </div>
            </div>
          </div>
        </div>
        {selectedDay && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="flex max-h-[80vh] w-full max-w-sm flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b bg-slate-50 p-4">
                <div>
                  <h3 className="text-lg font-bold capitalize text-slate-800">
                    {selectedDay.dayNum} de {selectedDay.monthName} {selectedDay.year}
                  </h3>
                  <p className="text-xs text-slate-500">Movimientos del dia</p>
                </div>
                <button onClick={() => setSelectedDay(null)} className="rounded-full bg-white p-1.5 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-600">
                  <X size={18} />
                </button>
              </div>
              <div className="custom-scrollbar flex-1 overflow-y-auto bg-slate-100/50 p-5">
                <div className="mb-5 grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-slate-200 bg-white p-3 text-center shadow-sm">
                    <p className="text-[10px] font-bold uppercase text-slate-400">Facturacion</p>
                    <p className="text-lg font-black text-emerald-500"><FancyPrice amount={selectedDay.sales} /></p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white p-3 text-center shadow-sm">
                    <p className="text-[10px] font-bold uppercase text-slate-400">Operaciones</p>
                    <p className="text-lg font-black text-blue-600">{selectedDay.count}</p>
                  </div>
                </div>

                <h4 className="mb-3 flex items-center gap-1.5 text-[10px] font-bold uppercase text-slate-500">
                  <ShoppingCart size={12} />
                  Desglose del dia
                </h4>

                <div className="space-y-2">
                  {selectedDay.transactions && selectedDay.transactions.length > 0 ? (
                    selectedDay.transactions.map((tx, idx) => (
                      <div key={idx} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full border border-emerald-100 bg-emerald-50 text-emerald-500">
                            <ShoppingCart size={14} />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-slate-700">Ticket #{tx.id}</p>
                            <p className="text-[10px] font-medium text-slate-400">{tx.time} • {tx.payment}</p>
                          </div>
                        </div>
                        <p className="text-sm font-bold text-emerald-600"><FancyPrice amount={tx.total} /></p>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-white py-6 text-center">
                      <p className="text-xs font-bold text-slate-400">No hubo movimientos este dia.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (globalFilter === 'month') {
    const localMax = Math.max(...chartData.map((item) => item.sales), 1);

    const getIntensityClass = (sales) => {
      if (sales === 0) return 'bg-slate-100 hover:bg-slate-200 border-slate-200';
      const ratio = sales / localMax;

      if (ratio < 0.25) return 'bg-emerald-800 hover:bg-emerald-700 border-emerald-900';
      if (ratio < 0.5) return 'bg-emerald-600 hover:bg-emerald-500 border-emerald-700';
      if (ratio < 0.75) return 'bg-emerald-500 hover:bg-emerald-400 border-emerald-600';
      return 'bg-emerald-400 hover:bg-emerald-300 border-emerald-500 shadow-sm ring-1 ring-emerald-200';
    };

    return (
      <div className="relative flex h-full flex-col rounded-xl border bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="flex items-center gap-2 font-bold text-slate-800">
              <CalendarDays size={18} className="text-emerald-500" />
              Mapa de Facturacion
            </h3>
            <span className="text-xs text-slate-400">Ultimos 30 dias corridos</span>
          </div>
        </div>

        <div className="relative flex min-h-[180px] flex-1 flex-col justify-center">
          {!chartData.some((item) => item.sales > 0) && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60 backdrop-blur-[1px]">
              <span className="rounded border bg-white px-2 py-1 text-xs font-bold uppercase tracking-wide text-slate-400">
                {getEmptyStateMessage()}
              </span>
            </div>
          )}

          <div className="grid grid-cols-10 gap-1.5 pb-6 pt-2 sm:gap-2">
            {chartData.map((item, idx) => {
              const isHovered = hoveredIndex === idx;
              const isToday = item.isToday;

              return (
                <div
                  key={idx}
                  className="group relative cursor-pointer"
                  onMouseEnter={() => setHoveredIndex(idx)}
                  onMouseLeave={() => setHoveredIndex(null)}
                  onClick={() => setSelectedDay(item)}
                >
                  <div
                    className={`pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 px-2 py-1.5 text-[10px] text-white shadow-lg transition-all duration-200 ${isHovered ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'}`}
                  >
                    <p className="mb-0.5 font-medium capitalize text-emerald-300">{item.dayName} {item.dayNum} de {item.monthName}</p>
                    <p className="mb-1 text-sm font-bold leading-none"><FancyPrice amount={item.sales} /></p>
                    <p className="leading-none text-slate-400">{item.count} {item.count === 1 ? 'Venta' : 'Ventas'}</p>
                    <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
                  </div>

                  <div
                    className={`aspect-square w-full rounded border transition-all duration-300 ${getIntensityClass(item.sales)} ${isToday ? 'ring-2 ring-offset-1 ring-slate-800' : ''}`}
                  />
                </div>
              );
            })}
          </div>

          <div className="mt-auto flex items-center justify-end gap-1.5 border-t border-slate-100 pt-3">
            <span className="mr-1 text-[10px] font-medium text-slate-400">Menos</span>
            <div className="h-3 w-3 rounded border border-slate-200 bg-slate-100" />
            <div className="h-3 w-3 rounded border border-emerald-900 bg-emerald-800" />
            <div className="h-3 w-3 rounded border border-emerald-700 bg-emerald-600" />
            <div className="h-3 w-3 rounded border border-emerald-600 bg-emerald-500" />
            <div className="h-3 w-3 rounded border border-emerald-500 bg-emerald-400" />
            <span className="ml-1 text-[10px] font-medium text-slate-400">Mas</span>
          </div>
        </div>

        {selectedDay && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="flex max-h-[80vh] w-full max-w-sm flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b bg-slate-50 p-4">
                <div>
                  <h3 className="text-lg font-bold capitalize text-slate-800">
                    {selectedDay.dayName} {selectedDay.dayNum} de {selectedDay.monthName}
                  </h3>
                  <p className="text-xs text-slate-500">Resumen operativo</p>
                </div>
                <button onClick={() => setSelectedDay(null)} className="rounded-full bg-white p-1.5 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-600">
                  <X size={18} />
                </button>
              </div>
              <div className="custom-scrollbar flex-1 overflow-y-auto bg-slate-100/50 p-5">
                <div className="mb-5 grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-slate-200 bg-white p-3 text-center shadow-sm">
                    <p className="text-[10px] font-bold uppercase text-slate-400">Facturacion</p>
                    <p className="text-lg font-black text-emerald-500"><FancyPrice amount={selectedDay.sales} /></p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white p-3 text-center shadow-sm">
                    <p className="text-[10px] font-bold uppercase text-slate-400">Operaciones</p>
                    <p className="text-lg font-black text-blue-600">{selectedDay.count}</p>
                  </div>
                </div>

                <h4 className="mb-3 flex items-center gap-1.5 text-[10px] font-bold uppercase text-slate-500">
                  <ShoppingCart size={12} />
                  Desglose de Ventas
                </h4>

                <div className="space-y-2">
                  {selectedDay.transactions && selectedDay.transactions.length > 0 ? (
                    selectedDay.transactions.map((tx, idx) => (
                      <div key={idx} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full border border-emerald-100 bg-emerald-50 text-emerald-500">
                            <ShoppingCart size={14} />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-slate-700">Ticket #{tx.id}</p>
                            <p className="text-[10px] font-medium text-slate-400">{tx.time} • {tx.payment}</p>
                          </div>
                        </div>
                        <p className="text-sm font-bold text-emerald-600"><FancyPrice amount={tx.total} /></p>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-white py-6 text-center">
                      <p className="text-xs font-bold text-slate-400">No hubo ventas este dia.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="h-full rounded-xl border bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="flex items-center gap-2 font-bold text-slate-800">
            <BarChart3 size={18} className="text-fuchsia-500" />
            Evolucion de Ventas
          </h3>
          <span className="text-xs text-slate-400">
            {globalFilter === 'day' ? 'Por horario' : 'Ultimos 7 dias'}
          </span>
        </div>
      </div>

      <div className="flex">
        <div className="flex flex-col justify-between pr-2 py-1 text-right" style={{ height: '180px', minWidth: '50px' }}>
          <span className="text-[9px] text-slate-400"><FancyPrice amount={maxSales} /></span>
          <span className="text-[9px] text-slate-400"><FancyPrice amount={Math.round(maxSales / 2)} /></span>
          <span className="text-[9px] text-slate-400"><FancyPrice amount={0} /></span>
        </div>

        <div className="relative flex-1">
          <div className="absolute inset-0 flex flex-col justify-between pointer-events-none" style={{ height: '180px' }}>
            <div className="border-t border-slate-100"></div>
            <div className="border-t border-dashed border-slate-100"></div>
            <div className="border-t border-slate-200"></div>
          </div>

          {!chartData.some((item) => item.sales > 0) && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60 backdrop-blur-[1px]">
              <span className="rounded border bg-white px-2 py-1 text-xs font-bold uppercase tracking-wide text-slate-400">
                {getEmptyStateMessage()}
              </span>
            </div>
          )}

          <div className="relative flex h-[180px] items-end justify-around gap-2">
            {chartData.map((item, idx) => {
              const heightPercent = maxSales > 0 ? (item.sales / maxSales) * 100 : 0;
              const isHovered = hoveredIndex === idx;

              return (
                <div
                  key={idx}
                  className="group relative flex h-full flex-1 flex-col items-center justify-end"
                  onMouseEnter={() => setHoveredIndex(idx)}
                  onMouseLeave={() => setHoveredIndex(null)}
                >
                  <div
                    className={`pointer-events-none absolute -top-10 left-1/2 z-30 -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 px-2 py-1 text-[10px] text-white shadow-lg transition-all duration-200 ${isHovered ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'}`}
                  >
                    <p className="font-bold"><FancyPrice amount={item.sales} /></p>
                    <p className="text-slate-300">{item.count} Ventas</p>
                  </div>

                  <div
                    className={`w-full max-w-[40px] rounded-t transition-all duration-300 ${
                      item.isCurrent
                        ? 'bg-fuchsia-500 hover:bg-fuchsia-600'
                        : item.sales > 0
                          ? 'bg-fuchsia-300 hover:bg-fuchsia-400'
                          : 'bg-slate-100 hover:bg-slate-200'
                    }`}
                    style={{ height: item.sales > 0 ? `${Math.max(heightPercent, 5)}%` : '4px' }}
                  />
                </div>
              );
            })}
          </div>

          <div className="mt-2 flex justify-around gap-2 border-t border-slate-200 pt-2">
            {chartData.map((item, idx) => (
              <div key={idx} className="flex-1 text-center">
                <p className={`text-[9px] font-bold ${item.isCurrent ? 'text-fuchsia-600' : 'text-slate-500'}`}>{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
