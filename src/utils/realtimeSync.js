const normalizeRecordId = (value) => {
  if (value === undefined || value === null) return '';
  return String(value).trim();
};

export const getRealtimeEventType = (payload = {}) =>
  String(payload.eventType || payload.event || '').trim().toUpperCase();

export const getRealtimeRecordId = (payload = {}, getRecordId = (record) => record?.id) => {
  const eventType = getRealtimeEventType(payload);
  const record = eventType === 'DELETE' ? payload.old : payload.new || payload.old;
  return normalizeRecordId(getRecordId(record || {}));
};

export const reconcileRealtimePayload = (
  currentRecords,
  payload,
  {
    mapRecord = (record) => record,
    getRecordId = (record) => record?.id,
    keepRecord = () => true,
    maxItems = null,
  } = {},
) => {
  const records = Array.isArray(currentRecords) ? currentRecords : [];
  const eventType = getRealtimeEventType(payload);
  const id = getRealtimeRecordId(payload, getRecordId);

  if (!id || !['INSERT', 'UPDATE', 'DELETE'].includes(eventType)) {
    return { records, applied: false, eventType, id };
  }

  if (eventType === 'DELETE') {
    const nextRecords = records.filter(
      (record) => normalizeRecordId(getRecordId(record)) !== id,
    );
    return {
      records: nextRecords,
      applied: nextRecords.length !== records.length,
      eventType,
      id,
    };
  }

  const mappedRecord = mapRecord(payload.new);
  if (!mappedRecord || typeof mappedRecord !== 'object') {
    return { records, applied: false, eventType, id };
  }

  const mappedId = normalizeRecordId(getRecordId(mappedRecord));
  if (!mappedId || mappedId !== id) {
    return { records, applied: false, eventType, id };
  }

  if (!keepRecord(mappedRecord)) {
    const nextRecords = records.filter(
      (record) => normalizeRecordId(getRecordId(record)) !== id,
    );
    return { records: nextRecords, applied: true, eventType, id };
  }

  const existingIndex = records.findIndex(
    (record) => normalizeRecordId(getRecordId(record)) === id,
  );
  const nextRecords = [...records];

  if (existingIndex >= 0) {
    nextRecords[existingIndex] = mappedRecord;
  } else {
    nextRecords.unshift(mappedRecord);
  }

  const normalizedMaxItems = Number(maxItems);
  const limitedRecords = Number.isFinite(normalizedMaxItems) && normalizedMaxItems > 0
    ? nextRecords.slice(0, normalizedMaxItems)
    : nextRecords;

  return { records: limitedRecords, applied: true, eventType, id };
};

export const createRealtimeIdBatcher = ({
  delayMs = 250,
  onFlush,
  onError = () => {},
  setTimeoutFn = globalThis.setTimeout.bind(globalThis),
  clearTimeoutFn = globalThis.clearTimeout.bind(globalThis),
} = {}) => {
  if (typeof onFlush !== 'function') {
    throw new TypeError('onFlush debe ser una funcion.');
  }

  const pendingIds = new Set();
  let timerId = null;
  let flushing = false;
  let disposed = false;

  const schedule = () => {
    if (disposed || flushing || timerId !== null || pendingIds.size === 0) return;
    timerId = setTimeoutFn(() => {
      timerId = null;
      void flush();
    }, delayMs);
  };

  const flush = async () => {
    if (disposed || flushing || pendingIds.size === 0) return;

    flushing = true;
    const ids = Array.from(pendingIds);
    pendingIds.clear();

    try {
      await onFlush(ids);
    } catch (error) {
      onError(error, ids);
    } finally {
      flushing = false;
      schedule();
    }
  };

  return {
    enqueue(ids) {
      const values = Array.isArray(ids) ? ids : [ids];
      values.forEach((id) => {
        const normalizedId = normalizeRecordId(id);
        if (normalizedId) pendingIds.add(normalizedId);
      });
      schedule();
    },
    flush,
    dispose() {
      disposed = true;
      pendingIds.clear();
      if (timerId !== null) clearTimeoutFn(timerId);
      timerId = null;
    },
    getPendingIds() {
      return Array.from(pendingIds);
    },
  };
};
