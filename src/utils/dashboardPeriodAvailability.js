const PERIOD_LABELS = {
  day: 'Hoy',
  week: 'Semana',
  month: 'Mes',
  year: 'Año',
};

export const DASHBOARD_WIDGET_SOURCES = Object.freeze({
  sales: ['transactions'],
  revenue: ['transactions'],
  net: ['transactions', 'expenses'],
  opening: [],
  average: ['transactions'],
  expenses: ['expenses'],
});

export const getDashboardWidgetSources = (widgetKey) => (
  DASHBOARD_WIDGET_SOURCES[widgetKey] || []
);

export const dashboardWidgetsShareSources = (widgetKey, otherWidgetKeys = []) => {
  const widgetSources = new Set(getDashboardWidgetSources(widgetKey));
  if (widgetSources.size === 0) return false;

  return otherWidgetKeys.some((otherWidgetKey) => (
    getDashboardWidgetSources(otherWidgetKey).some((source) => widgetSources.has(source))
  ));
};

export const isDashboardSourceStale = ({
  status = 'idle',
  dirty = false,
  cloudRefreshFailed = false,
  snapshotComplete = false,
  offline = false,
} = {}) => (
  ['idle', 'error'].includes(status) ||
  offline ||
  cloudRefreshFailed ||
  (dirty && snapshotComplete)
);

const needsCompletePeriod = (filter) => ['week', 'month', 'year'].includes(filter);

const lacksPeriodCoverage = (source, filter, periodCoverage) => {
  if (!needsCompletePeriod(filter)) return false;
  if (source === 'transactions') return periodCoverage?.transactions !== true;
  if (source === 'expenses') return periodCoverage?.expenses !== true;
  return false;
};

export const getDashboardWidgetDataState = ({
  widgetKey,
  filter = 'day',
  sourceState = {},
  periodCoverage = {},
  targetedWidgetKeys = [],
} = {}) => {
  const normalizedFilter = PERIOD_LABELS[filter] ? filter : 'day';
  const sources = getDashboardWidgetSources(widgetKey);
  const targetedWidgetSet = new Set(targetedWidgetKeys);
  const targetedSources = new Set(
    targetedWidgetKeys.flatMap((targetedWidgetKey) => getDashboardWidgetSources(targetedWidgetKey)),
  );
  const isTargetedRefresh = targetedWidgetSet.has(widgetKey);
  const isRefreshBlocked = !isTargetedRefresh && sources.some((source) => targetedSources.has(source));
  const staleSources = sources.filter((source) => (
    sourceState?.[source]?.stale === true ||
    lacksPeriodCoverage(source, normalizedFilter, periodCoverage)
  ));
  const loadingSources = sources.filter((source) => (
    sourceState?.[source]?.loading === true && !targetedSources.has(source)
  ));
  const isLoading = isTargetedRefresh || loadingSources.length > 0;

  return {
    filter: normalizedFilter,
    periodLabel: PERIOD_LABELS[normalizedFilter],
    displayLabel: PERIOD_LABELS[normalizedFilter],
    sources,
    staleSources,
    loadingSources,
    isStale: staleSources.length > 0,
    isLoading,
    isTargetedRefresh,
    isRefreshBlocked,
    needsAttention: staleSources.length > 0 || isLoading,
  };
};
