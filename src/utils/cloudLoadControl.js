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
