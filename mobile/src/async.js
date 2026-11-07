export async function boundedFetch(input, init = {}, timeoutMs = 20000) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timer = setTimeout(abort, timeoutMs);
  init.signal?.addEventListener('abort', abort, { once: true });
  if (init.signal?.aborted) controller.abort();
  try { return await fetch(input, { ...init, signal: controller.signal }); }
  finally { clearTimeout(timer); init.signal?.removeEventListener('abort', abort); }
}
export function withDeadline(promise, timeoutMs = 25000) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('La conexión tardó demasiado. Intentá nuevamente.')), timeoutMs); })]).finally(() => clearTimeout(timer));
}
