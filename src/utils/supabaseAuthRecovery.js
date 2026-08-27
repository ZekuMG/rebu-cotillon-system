const getSupabaseErrorText = (error) => [
  error?.message,
  error?.details,
  error?.hint,
  error?.code,
].filter(Boolean).join(' ');

export const isPersistedSupabaseJwtError = (error) =>
  /jwt issued at future|jwt expired|invalid jwt|bad_jwt|invalid claim/i.test(
    getSupabaseErrorText(error),
  );

// PostgREST valida el 'iat' del token contra SU reloj, pero el token lo emite
// GoTrue, que es otro servidor. Un desfase de decimas entre ambos hace que un
// token recien emitido figure "emitido en el futuro" (JWSError JWTIssuedAtFuture).
// No es el reloj de la PC: se corrige solo en un segundo.
export const isSupabaseClockSkewError = (error) =>
  /jwt.*issued.*future|issued at future|not before.*future/i.test(
    getSupabaseErrorText(error),
  );

const defaultWait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

export const retryOnSupabaseClockSkew = async (
  operation,
  { waitMs = 1200, wait = defaultWait } = {},
) => {
  const first = await operation();
  if (!isSupabaseClockSkewError(first?.error)) return first;
  await wait(waitMs);
  return operation();
};

export const runWithSupabaseAuthRecovery = async ({ operation, clearSession }) => {
  try {
    return await operation();
  } catch (error) {
    if (!isPersistedSupabaseJwtError(error)) throw error;

    try {
      const clearResult = await clearSession({ scope: 'local' });
      if (clearResult?.error) throw clearResult.error;
    } catch {
      throw error;
    }

    return operation();
  }
};
