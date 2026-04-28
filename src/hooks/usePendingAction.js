import { useCallback, useReducer, useRef } from 'react';

const rerenderReducer = (value) => value + 1;

export default function usePendingAction() {
  const pendingKeysRef = useRef(new Set());
  const [, forceRerender] = useReducer(rerenderReducer, 0);

  const isPending = useCallback((actionKey) => {
    if (!actionKey) return false;
    return pendingKeysRef.current.has(actionKey);
  }, []);

  const runAction = useCallback(async (actionKey, asyncFn) => {
    if (typeof asyncFn !== 'function') return undefined;
    if (!actionKey) return await asyncFn();
    if (pendingKeysRef.current.has(actionKey)) return undefined;

    pendingKeysRef.current.add(actionKey);
    forceRerender();

    try {
      return await asyncFn();
    } finally {
      pendingKeysRef.current.delete(actionKey);
      forceRerender();
    }
  }, []);

  const wrapAction = useCallback(
    (actionKey, asyncFn) =>
      async (...args) =>
        runAction(actionKey, () => asyncFn(...args)),
    [runAction],
  );

  return {
    isPending,
    runAction,
    wrapAction,
  };
}
