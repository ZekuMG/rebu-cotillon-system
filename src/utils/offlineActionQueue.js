export const OFFLINE_ACTIONS_KEY = 'rebu_offline_actions_v1';
const clone = (value) => JSON.parse(JSON.stringify(value));
const finalStates = new Set(['applied', 'discarded']);
const states = new Set(['pending', 'applying', 'applied', 'discarded', 'conflict', 'review']);

export const offlineValueFingerprint = (value) => {
  const stable = (item) => Array.isArray(item) ? item.map(stable)
    : item && typeof item === 'object'
      ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, stable(item[key])])) : item;
  return JSON.stringify(stable(clone(value)));
};

export const isOfflineActionOpen = (entry) => !finalStates.has(entry.status);

// A previously approved offline sale can also be recovered from the POS. Keep
// both journals consistent, using the confirmed operation key rather than the
// active cart or the current form contents.
export const completeOfflineSaleAction = (queue, attempt) => {
  if (attempt?.status !== 'completed' || !attempt.saleId || !attempt.request?.operationKey) return null;
  const entry = queue.read().find((item) => item.type === 'offlineSale' && isOfflineActionOpen(item)
    && item.args[0]?.cartId === attempt.cartId
    && item.args[0]?.request?.operationKey === attempt.request.operationKey);
  return entry ? queue.patch(entry.id, { status: 'applied', saleId: attempt.saleId, appliedAt: new Date().toISOString(), error: '' }) : null;
};

// This is an operation journal, not a cache. Never trim it or replace unreadable
// data with an empty array: an offline operation may exist nowhere else.
export const createOfflineActionQueue = ({ storage, key = OFFLINE_ACTIONS_KEY, now = () => new Date().toISOString(), uuid = () => crypto.randomUUID() }) => {
  const read = () => {
    const raw = storage.getItem(key);
    if (!raw) return [];
    const data = JSON.parse(raw);
    if (data?.version !== 1 || !Array.isArray(data.entries)) throw new Error('No se pudo leer la bandeja sin conexión. Conservamos el registro original.');
    const ids = new Set();
    for (const entry of data.entries) {
      if (!entry?.id || ids.has(entry.id) || !entry.type || !Array.isArray(entry.args)
        || !entry.actor?.userId || !states.has(entry.status) || !Array.isArray(entry.targets)) {
        throw new Error('La bandeja sin conexión está incompleta. Conservamos el registro original.');
      }
      ids.add(entry.id);
    }
    return data.entries;
  };
  const write = (entries) => {
    const value = JSON.stringify({ version: 1, entries });
    storage.setItem(key, value);
    if (storage.getItem(key) !== value) throw new Error('No se pudo asegurar la acción en esta PC. No se guardó ningún cambio en la nube.');
    return clone(entries);
  };
  const patch = (id, changes) => {
    const entries = read();
    const index = entries.findIndex((entry) => entry.id === id);
    if (index < 0) throw new Error('No se encontró la acción pendiente.');
    entries[index] = { ...entries[index], ...clone(changes), updatedAt: now() };
    write(entries);
    return entries[index];
  };
  return {
    read, patch,
    enqueue: ({ type, args = [], actor, label, targets = [], summary = '', dedupeKey = null }) => {
      if (!actor?.userId) throw new Error('Ingresá con tu usuario antes de guardar acciones sin conexión.');
      const entries = read();
      const duplicate = dedupeKey && entries.find((entry) => entry.dedupeKey === dedupeKey && isOfflineActionOpen(entry));
      if (duplicate) return duplicate;
      const entry = clone({ id: uuid(), type, args, actor, label, summary, targets, dedupeKey, status: 'pending', createdAt: now(), updatedAt: now(), error: '' });
      write([...entries, entry]);
      return entry;
    },
    recoverInterrupted: () => {
      const entries = read();
      if (!entries.some((entry) => entry.status === 'applying')) return entries;
      return write(entries.map((entry) => entry.status === 'applying'
        ? { ...entry, status: 'review', error: 'La app se cerró durante la confirmación. Revisá la nube antes de repetir la acción.' } : entry));
    },
    discard: (id) => {
      const entries = read();
      const index = entries.findIndex((item) => item.id === id);
      const entry = entries[index];
      if (!entry || entry.status === 'applying' || finalStates.has(entry.status)) throw new Error('Esta acción no se puede descartar.');
      const clientId = entry.type === 'offlineSale' ? entry.args[0]?.request?.salePayload?.client_id : null;
      if (clientId != null && entries.slice(index + 1).some((item) => item.type === 'offlineSale' && isOfflineActionOpen(item)
        && String(item.args[0]?.request?.salePayload?.client_id) === String(clientId))) {
        throw new Error('Hay ventas posteriores de este socio que dependen de sus puntos y cupones. Descartá primero esas ventas, desde la última hacia la primera.');
      }
      return patch(id, { status: 'discarded' });
    },
  };
};

export const findOfflineConflicts = async (entry, loadTarget) => {
  const conflicts = [];
  // Sequential reads bound network load for large imports; never send a write
  // if even one original record is missing or changed.
  for (const target of entry.targets) {
    const current = await loadTarget(target);
    if (!current || offlineValueFingerprint(current) !== offlineValueFingerprint(target.value)) {
      conflicts.push(target.label || `${target.table} ${target.id}`);
    }
  }
  return conflicts;
};

export const confirmOfflineAction = async ({ queue, id, isOnline, authorize, loadTarget, apply, retrySafe = false }) => {
  const entry = queue.read().find((item) => item.id === id);
  if (!entry || finalStates.has(entry.status) || entry.status === 'applying') throw new Error('La acción ya fue procesada o está en curso.');
  if ((entry.status === 'review' && !retrySafe) || entry.status === 'conflict') throw new Error('Revisá esta acción antes de continuar. No se volverá a enviar automáticamente.');
  if (!isOnline()) throw new Error('Reconectá la app antes de confirmar. La acción sigue guardada en esta PC.');
  await authorize(entry);
  const conflicts = await findOfflineConflicts(entry, loadTarget);
  if (conflicts.length) return queue.patch(id, { status: 'conflict', error: `Los datos cambiaron en la nube: ${conflicts.join(', ')}. Descartá este pendiente y volvé a cargar el cambio con los datos actuales.` });
  if (!isOnline()) throw new Error('Se interrumpió la conexión. La acción sigue pendiente.');
  // Persist BEFORE the first write. After an ambiguous failure, generic actions
  // require manual inspection. Only an idempotent RPC may be retried safely.
  queue.patch(id, { status: 'applying', error: '' });
  try {
    await apply(entry);
  } catch (error) {
    return queue.patch(id, { status: retrySafe ? 'pending' : 'review', error: error?.message || 'No se pudo confirmar el resultado. Revisá la nube antes de repetir la acción.' });
  }
  return queue.patch(id, { status: 'applied', appliedAt: new Date().toISOString(), error: '' });
};
