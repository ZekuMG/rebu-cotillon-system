const DASHBOARD_PERIODS = new Set(['day', 'week', 'month', 'year']);

export const DASHBOARD_PERIOD_LABELS = Object.freeze({
  day: 'Hoy',
  week: 'Semana',
  month: 'Mes',
  year: 'Año',
});

export const resolveDashboardPeriodView = ({
  requestedFilter = 'day',
  isPeriodDataComplete = true,
  hasTodayData = false,
} = {}) => {
  const normalizedFilter = DASHBOARD_PERIODS.has(requestedFilter) ? requestedFilter : 'day';
  const isExpandedPeriod = normalizedFilter !== 'day';
  const isIncomplete = isExpandedPeriod && !isPeriodDataComplete;
  const isShowingDayFallback = isIncomplete && hasTodayData;

  return {
    requestedFilter: normalizedFilter,
    requestedLabel: DASHBOARD_PERIOD_LABELS[normalizedFilter],
    effectiveFilter: isShowingDayFallback ? 'day' : normalizedFilter,
    isExpandedPeriod,
    isIncomplete,
    isShowingDayFallback,
  };
};
