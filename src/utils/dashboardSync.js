export const DASHBOARD_SNAPSHOT_SCOPE_FULL = 'full';
export const DASHBOARD_SNAPSHOT_SCOPE_PARTIAL = 'partial';

export const getDashboardSnapshotScope = (snapshot) => (
  snapshot &&
  Array.isArray(snapshot.dailyLogs) &&
  Array.isArray(snapshot.expenses) &&
  Array.isArray(snapshot.pastClosures) &&
  snapshot.dashboardScope === DASHBOARD_SNAPSHOT_SCOPE_FULL
    ? DASHBOARD_SNAPSHOT_SCOPE_FULL
    : DASHBOARD_SNAPSHOT_SCOPE_PARTIAL
);

export const shouldUseIncrementalDashboardSync = ({
  fullRequested = false,
  hasExistingDashboardData = false,
  snapshotScope = DASHBOARD_SNAPSHOT_SCOPE_PARTIAL,
} = {}) => (
  !fullRequested &&
  hasExistingDashboardData &&
  snapshotScope === DASHBOARD_SNAPSHOT_SCOPE_FULL
);

export const needsDashboardFullBackfill = ({
  dashboardScope = DASHBOARD_SNAPSHOT_SCOPE_PARTIAL,
  transactionScope = 'partial',
} = {}) => (
  dashboardScope !== DASHBOARD_SNAPSHOT_SCOPE_FULL || transactionScope !== 'full'
);
