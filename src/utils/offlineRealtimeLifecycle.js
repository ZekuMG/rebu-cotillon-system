// Keep the channel's own retry timers and worker out of offline mode. Resume
// with a fresh channel: a Supabase channel instance can only subscribe once.
export const createOfflineRealtimeLifecycle = ({ isOffline, subscribe, unsubscribe, disconnect, cleanupState = { pending: null }, onError = () => {} }) => {
  let resource = null;
  let active = false;
  let disposed = false;
  let generation = 0;
  const pause = () => {
    active = false;
    generation += 1;
    const previous = resource;
    resource = null;
    try { disconnect(); }
    catch (error) { onError(error); }
    if (previous) {
      try {
        const removal = Promise.resolve(unsubscribe(previous)).catch(onError);
        cleanupState.pending = removal;
        void removal.then(() => {
          if (cleanupState.pending === removal) cleanupState.pending = null;
        });
      }
      catch (error) { onError(error); }
    }
  };
  return {
    resume() {
      if (disposed || active || isOffline()) return false;
      const currentGeneration = ++generation;
      active = true;
      const isCurrent = () => !disposed && active && generation === currentGeneration && !isOffline();
      const start = () => {
        if (!isCurrent()) return;
        try { resource = subscribe(isCurrent); }
        catch (error) { active = false; onError(error); }
      };
      // removeChannel finishes asynchronously and removes channels by topic.
      // Its old cleanup must finish before a replacement uses the same topic,
      // including across React StrictMode's effect teardown and remount.
      if (cleanupState.pending) void cleanupState.pending.then(start);
      else start();
      return active;
    },
    pause,
    dispose() { disposed = true; pause(); },
  };
};
