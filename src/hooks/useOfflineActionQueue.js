import { useCallback, useEffect, useRef, useState } from 'react';
import { createOfflineActionQueue, OFFLINE_ACTIONS_KEY } from '../utils/offlineActionQueue';

const LOCK_NAME = 'rebu-offline-action-journal';
export default function useOfflineActionQueue() {
  const [queue] = useState(() => createOfflineActionQueue({ storage: window.localStorage }));
  const [entries, setEntries] = useState([]);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const localLock = useRef(false);
  const refresh = useCallback(() => {
    try { setEntries(queue.read()); setError(''); }
    catch (cause) { setError(cause.message); }
  }, [queue]);
  const exclusive = useCallback(async (callback) => {
    if (localLock.current) throw new Error('Hay una acción en curso. Esperá a que termine.');
    localLock.current = true;
    setBusy(true);
    try {
      return await (navigator.locks
        ? navigator.locks.request(LOCK_NAME, () => callback(queue)) : callback(queue));
    } finally { localLock.current = false; setBusy(false); refresh(); }
  }, [queue, refresh]);
  useEffect(() => {
    let mounted = true;
    const recover = async () => {
      try {
        const run = () => { if (mounted) { queue.recoverInterrupted(); refresh(); } };
        if (navigator.locks) await navigator.locks.request(LOCK_NAME, { ifAvailable: true }, (lock) => { if (lock) run(); else refresh(); });
        else run();
      } catch (cause) { if (mounted) setError(cause.message); }
    };
    void recover();
    const onStorage = (event) => { if (event.key === OFFLINE_ACTIONS_KEY || event.key === null) refresh(); };
    window.addEventListener('storage', onStorage);
    return () => { mounted = false; window.removeEventListener('storage', onStorage); };
  }, [queue, refresh]);
  return { entries, error, open, setOpen, busy, exclusive, refresh };
}
