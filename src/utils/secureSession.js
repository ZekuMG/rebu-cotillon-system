export const SECURE_SESSION_STATUS = Object.freeze({
  ACTIVE: 'active',
  MISSING: 'missing',
  MISMATCH: 'mismatch',
  ERROR: 'error',
});

export const assessSecureSession = ({ session, expectedAuthUserId = null, error = null } = {}) => {
  if (error) {
    return {
      status: SECURE_SESSION_STATUS.ERROR,
      isUsable: false,
      reason: error?.message || 'No se pudo comprobar la sesion segura.',
    };
  }

  const accessToken = String(session?.access_token || '').trim();
  const sessionAuthUserId = String(session?.user?.id || '').trim();
  const expectedId = String(expectedAuthUserId || '').trim();

  if (!accessToken || !sessionAuthUserId) {
    return {
      status: SECURE_SESSION_STATUS.MISSING,
      isUsable: false,
      reason: 'La sesion de Supabase no esta disponible en este dispositivo.',
    };
  }

  if (expectedId && sessionAuthUserId !== expectedId) {
    return {
      status: SECURE_SESSION_STATUS.MISMATCH,
      isUsable: false,
      reason: 'La sesion de Supabase pertenece a otro usuario de Rebu.',
      sessionAuthUserId,
      expectedAuthUserId: expectedId,
    };
  }

  return {
    status: SECURE_SESSION_STATUS.ACTIVE,
    isUsable: true,
    reason: null,
    sessionAuthUserId,
  };
};

export const getExpectedAuthUserId = (user, sessionMeta) =>
  user?.authUserId ||
  user?.auth_user_id ||
  sessionMeta?.supabaseAuth?.authUserId ||
  null;
