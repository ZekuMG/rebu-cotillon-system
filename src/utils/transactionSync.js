export const TRANSACTION_SNAPSHOT_SCOPE_FULL = 'full';
export const TRANSACTION_SNAPSHOT_SCOPE_PARTIAL = 'partial';

export const getTransactionSnapshotScope = (snapshot) => (
  Array.isArray(snapshot?.transactions) &&
  snapshot?.transactionsScope === TRANSACTION_SNAPSHOT_SCOPE_FULL
    ? TRANSACTION_SNAPSHOT_SCOPE_FULL
    : TRANSACTION_SNAPSHOT_SCOPE_PARTIAL
);

export const shouldUseIncrementalTransactionSync = ({
  fullRequested = false,
  hasExistingTransactions = false,
  snapshotScope = TRANSACTION_SNAPSHOT_SCOPE_PARTIAL,
} = {}) => (
  !fullRequested &&
  hasExistingTransactions &&
  snapshotScope === TRANSACTION_SNAPSHOT_SCOPE_FULL
);

export const shouldUseIncrementalMetricsSync = ({
  fullRequested = false,
  includeTransactions = true,
  hasExistingMetricsData = false,
  hasExistingTransactions = false,
  transactionSnapshotScope = TRANSACTION_SNAPSHOT_SCOPE_PARTIAL,
} = {}) => (
  !fullRequested &&
  hasExistingMetricsData &&
  (
    !includeTransactions ||
    shouldUseIncrementalTransactionSync({
      hasExistingTransactions,
      snapshotScope: transactionSnapshotScope,
    })
  )
);
