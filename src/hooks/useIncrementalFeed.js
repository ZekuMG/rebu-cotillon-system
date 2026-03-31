import { useCallback, useEffect, useMemo, useState } from 'react';

const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_THRESHOLD = 300;

export default function useIncrementalFeed(items = [], options = {}) {
  const {
    batchSize = DEFAULT_BATCH_SIZE,
    threshold = DEFAULT_THRESHOLD,
    resetKey,
  } = options;

  const safeItems = Array.isArray(items) ? items : [];
  const [visibleCount, setVisibleCount] = useState(() => Math.min(batchSize, safeItems.length));

  useEffect(() => {
    setVisibleCount(Math.min(batchSize, safeItems.length));
  }, [batchSize, resetKey, safeItems.length]);

  const handleScroll = useCallback(
    (event) => {
      const element = event.currentTarget;
      const remaining = element.scrollHeight - element.scrollTop - element.clientHeight;

      if (remaining > threshold) return;

      setVisibleCount((current) => {
        if (current >= safeItems.length) return current;
        return Math.min(current + batchSize, safeItems.length);
      });
    },
    [batchSize, safeItems.length, threshold]
  );

  const visibleItems = useMemo(() => safeItems.slice(0, visibleCount), [safeItems, visibleCount]);

  return {
    visibleItems,
    visibleCount,
    totalItems: safeItems.length,
    hasMore: visibleCount < safeItems.length,
    handleScroll,
  };
}
