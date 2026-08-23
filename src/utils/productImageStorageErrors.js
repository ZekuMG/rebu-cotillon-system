const STORAGE_PERMISSION_ERROR_PATTERN =
  /row-level security|rls|unauthorized|not authorized|permission denied|jwt expired|invalid jwt/i;

export const getProductImageStorageErrorMessage = (error, fallback = 'No se pudo guardar la foto.') => {
  const rawMessage = String(error?.message || error || '').trim();
  if (STORAGE_PERMISSION_ERROR_PATTERN.test(rawMessage)) {
    return 'La sesion de Rebu no tiene permiso para guardar fotos. Cerra sesion, volve a entrar y reintenta.';
  }
  return rawMessage || fallback;
};
