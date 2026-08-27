const createTimeoutError = (label, timeoutMs) => {
  const error = new Error(`${label} excedio el tiempo de espera.`);
  error.code = 'REBU_TIMEOUT';
  error.timeoutMs = timeoutMs;
  error.operationLabel = label;
  return error;
};

const waitFor = (delayMs, setTimeoutFn) =>
  new Promise((resolve) => {
    setTimeoutFn(resolve, delayMs);
  });

export const isUsableCloudResult = (result) =>
  result?.status === 'fulfilled' && !result.value?.error;

export const summarizeCloudResults = (namedResults = [], { optionalSources = [] } = {}) => {
  const optionalSourceSet = new Set(optionalSources);
  const failedSources = namedResults
    .filter(([, result]) => !isUsableCloudResult(result))
    .map(([source]) => source);
  const optionalFailedSources = failedSources.filter((source) => optionalSourceSet.has(source));
  const criticalFailedSources = failedSources.filter((source) => !optionalSourceSet.has(source));

  return {
    failedSources,
    optionalFailedSources,
    criticalFailedSources,
    hasCloudConnection: criticalFailedSources.length === 0,
    isComplete: failedSources.length === 0,
  };
};

export const doesCloudLoadCoverRequest = (
  activeRequest,
  requestedRequest,
  requiredFlags = [],
) => {
  if (!activeRequest || !requestedRequest) return false;

  return requiredFlags.every((flag) => (
    requestedRequest[flag] !== true || activeRequest[flag] === true
  ));
};

export const resolveCoveredCloudLoadResult = ({
  loaded,
  requireCloud = false,
  cloudRefreshFailed = false,
} = {}) => (
  requireCloud && cloudRefreshFailed ? false : loaded
);

export const recordCloudSourceMutations = (versions = {}, sources = []) => {
  (Array.isArray(sources) ? sources : [sources]).filter(Boolean).forEach((source) => {
    versions[source] = Number(versions[source] || 0) + 1;
  });
  return versions;
};

export const getIncrementalSyncCutoff = (
  savedAt,
  {
    overlapMs = 5 * 60 * 1000,
    maxAgeMs = 24 * 60 * 60 * 1000,
    now = Date.now(),
  } = {},
) => {
  const savedAtMs = Date.parse(savedAt);
  const safeOverlapMs = Math.max(0, Number(overlapMs) || 0);
  const safeMaxAgeMs = Math.max(0, Number(maxAgeMs) || 0);
  const snapshotAgeMs = now - savedAtMs;

  if (
    !Number.isFinite(savedAtMs) ||
    savedAtMs <= 0 ||
    savedAtMs > now + safeOverlapMs ||
    snapshotAgeMs > safeMaxAgeMs
  ) {
    return null;
  }

  return new Date(Math.max(0, savedAtMs - safeOverlapMs)).toISOString();
};

export const PRODUCT_SNAPSHOT_SCOPE_FULL = 'full';
export const PRODUCT_SNAPSHOT_SCOPE_PARTIAL = 'partial';

export const getProductSnapshotScope = (snapshot) => (
  Array.isArray(snapshot?.inventory) &&
  snapshot?.inventoryScope === PRODUCT_SNAPSHOT_SCOPE_FULL
    ? PRODUCT_SNAPSHOT_SCOPE_FULL
    : PRODUCT_SNAPSHOT_SCOPE_PARTIAL
);

export const getLatestCloudRecordTimestamp = (
  records = [],
  { fallback = null, fields = ['updated_at', 'updatedAt'] } = {},
) => {
  let latestTimestampMs = Date.parse(fallback);
  if (!Number.isFinite(latestTimestampMs)) latestTimestampMs = 0;

  (Array.isArray(records) ? records : []).forEach((record) => {
    const rawTimestamp = fields
      .map((field) => record?.[field])
      .find((value) => value !== undefined && value !== null && value !== '');
    const timestampMs = Date.parse(rawTimestamp);
    if (Number.isFinite(timestampMs) && timestampMs > latestTimestampMs) {
      latestTimestampMs = timestampMs;
    }
  });

  return latestTimestampMs > 0 ? new Date(latestTimestampMs).toISOString() : null;
};

export const shouldUseIncrementalProductSync = ({
  force = false,
  inventoryScope = PRODUCT_SNAPSHOT_SCOPE_PARTIAL,
  inventoryCount = 0,
  productsSyncedThrough = null,
  productsFullSyncedAt = null,
  now = Date.now(),
  fullSyncMaxAgeMs = 24 * 60 * 60 * 1000,
} = {}) => {
  const fullSyncedAtMs = Date.parse(productsFullSyncedAt);
  const syncedThroughMs = Date.parse(productsSyncedThrough);
  const fullSyncAgeMs = now - fullSyncedAtMs;

  return (
    !force &&
    inventoryScope === PRODUCT_SNAPSHOT_SCOPE_FULL &&
    Number(inventoryCount) > 0 &&
    Number.isFinite(syncedThroughMs) &&
    Number.isFinite(fullSyncedAtMs) &&
    fullSyncAgeMs >= 0 &&
    fullSyncAgeMs <= Math.max(0, Number(fullSyncMaxAgeMs) || 0)
  );
};

export const mergeCloudRecordsById = (
  currentRecords = [],
  changedRecords = [],
  { keepRecord = () => true, compareRecords = null } = {},
) => {
  const recordsById = new Map();

  (Array.isArray(currentRecords) ? currentRecords : []).forEach((record) => {
    if (record?.id === undefined || record?.id === null) return;
    recordsById.set(String(record.id), record);
  });
  (Array.isArray(changedRecords) ? changedRecords : []).forEach((record) => {
    if (record?.id === undefined || record?.id === null) return;
    recordsById.set(String(record.id), record);
  });

  const nextRecords = Array.from(recordsById.values()).filter(keepRecord);
  return typeof compareRecords === 'function'
    ? nextRecords.sort(compareRecords)
    : nextRecords;
};

const captureCloudMutationVersions = (versions = {}, sources = []) =>
  Object.fromEntries(sources.map((source) => [source, Number(versions[source] || 0)]));

const getChangedCloudSources = (before = {}, after = {}, sources = []) =>
  sources.filter((source) => Number(after[source] || 0) !== Number(before[source] || 0));

export const fetchCloudPayloadWithMutationGuard = async ({
  fetchPayload,
  getMutationVersions = () => ({}),
  sources = [],
  retryCount = 1,
} = {}) => {
  if (typeof fetchPayload !== 'function') {
    throw new TypeError('fetchPayload debe ser una funcion.');
  }

  const guardedSources = Array.from(new Set((Array.isArray(sources) ? sources : [sources]).filter(Boolean)));
  const normalizedRetryCount = Math.max(0, Math.trunc(Number(retryCount) || 0));

  for (let attempt = 0; attempt <= normalizedRetryCount; attempt += 1) {
    const before = captureCloudMutationVersions(getMutationVersions(), guardedSources);
    const payload = await fetchPayload({ attempt });

    if (guardedSources.length === 0) {
      return {
        ...payload,
        mutationConsistent: true,
        concurrentMutationSources: [],
      };
    }

    const changedSources = getChangedCloudSources(before, getMutationVersions(), guardedSources);
    if (!payload?.hasCloudConnection) {
      return {
        ...payload,
        mutationConsistent: changedSources.length === 0,
        concurrentMutationSources: changedSources,
      };
    }

    if (changedSources.length === 0) {
      return {
        ...payload,
        mutationConsistent: true,
        concurrentMutationSources: [],
      };
    }

    if (attempt === normalizedRetryCount) {
      return {
        ...payload,
        mutationConsistent: false,
        concurrentMutationSources: changedSources,
      };
    }
  }

  return {
    hasCloudConnection: false,
    mutationConsistent: false,
    concurrentMutationSources: guardedSources,
  };
};

export const fetchCloudPayloadWithRetries = async ({
  fetchPayload,
  label = 'Carga en la nube',
  timeoutMs = 10000,
  retryCount = 1,
  retryDelayMs = 750,
  shouldRetryPayload = (payload) => !payload?.hasCloudConnection,
  isRecoverableError = () => false,
  isOffline = () => false,
  createAbortController = () => new AbortController(),
  setTimeoutFn = globalThis.setTimeout.bind(globalThis),
  clearTimeoutFn = globalThis.clearTimeout.bind(globalThis),
} = {}) => {
  if (typeof fetchPayload !== 'function') {
    throw new TypeError('fetchPayload debe ser una funcion.');
  }

  let lastPayload = null;
  let lastError = null;

  for (let attempt = 0; attempt <= retryCount; attempt += 1) {
    const controller = createAbortController();
    const attemptLabel = attempt === 0 ? label : `${label} (reintento ${attempt})`;
    let timeoutId = null;

    try {
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeoutFn(() => {
          controller.abort();
          reject(createTimeoutError(attemptLabel, timeoutMs));
        }, timeoutMs);
      });
      const payload = await Promise.race([
        Promise.resolve().then(() => fetchPayload({ signal: controller.signal, attempt })),
        timeoutPromise,
      ]);
      lastPayload = payload;

      if (!shouldRetryPayload(payload) || attempt === retryCount || isOffline()) {
        return payload;
      }
    } catch (error) {
      lastError = error;

      // A timed-out request is already aborted. Retrying it immediately would
      // recreate the same expensive query and delay the local fallback.
      if (
        error?.code === 'REBU_TIMEOUT' ||
        attempt === retryCount ||
        isOffline() ||
        !isRecoverableError(error)
      ) {
        throw error;
      }
    } finally {
      if (timeoutId !== null) clearTimeoutFn(timeoutId);
    }

    await waitFor(retryDelayMs, setTimeoutFn);
  }

  if (lastPayload) return lastPayload;
  throw lastError || new Error(`${label} no pudo conectar con Supabase.`);
};
