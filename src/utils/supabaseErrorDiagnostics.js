const getErrorText = (error) => [
  error?.message,
  error?.details,
  error?.hint,
  error?.code,
  error?.name,
  error?.status,
].filter(Boolean).join(' ');

const diagnostic = (code, message) => ({ code, message: `${message} [${code}]` });

export const getSupabaseErrorDiagnostic = (error) => {
  const errorText = getErrorText(error);
  const normalizedCode = String(error?.code || '').trim().toLowerCase();

  if (/jwt issued at future|jwt.*issued.*future|not before.*future/i.test(errorText)) {
    return diagnostic(
      'AUTH-JWT-FUTURE',
      'Supabase rechazó la sesión porque el token figura emitido en el futuro. Suele ser una sesión guardada que quedó vieja: cerrá sesión e ingresá nuevamente. Si se repite, revisá fecha, hora y zona horaria de Windows (y el reloj de la BIOS) en esta PC y en la que atiende.',
    );
  }

  if (/invalid refresh token|refresh[_ ]token[_ ]not[_ ]found|refresh token.*(?:revoked|already used)/i.test(errorText)) {
    return diagnostic(
      'AUTH-REFRESH-INVALID',
      'Supabase no pudo renovar la sesión guardada en esta PC. La sesión fue revocada, reemplazada o quedó desactualizada; cerrá sesión e ingresá nuevamente.',
    );
  }

  if (/jwt expired|token.*expired|invalidjwtexpiration/i.test(errorText)) {
    return diagnostic(
      'AUTH-JWT-EXPIRED',
      'La sesión segura de Supabase venció y ya no autoriza esta operación. Cerrá sesión e ingresá nuevamente; si se repite, revisá la hora de Windows.',
    );
  }

  if (/missing sub|invalid claim.*sub/i.test(errorText)) {
    return diagnostic(
      'AUTH-JWT-MISSING-USER',
      'Supabase recibió un token que no identifica a ningún usuario. Revisá el vínculo auth_user_id/auth_email y volvé a iniciar sesión.',
    );
  }

  if (
    normalizedCode === 'bad_jwt'
    || normalizedCode === 'pgrst301'
    || /invalid jwt|bad jwt|bad_jwt|malformed jwt|jwt signature|invalid claim/i.test(errorText)
  ) {
    return diagnostic(
      'AUTH-JWT-INVALID',
      'Supabase rechazó el token de esta PC. La sesión local puede estar dañada, revocada o pertenecer a otra configuración; cerrá sesión e ingresá nuevamente.',
    );
  }

  if (normalizedCode === 'invalid_credentials' || /invalid login credentials/i.test(errorText)) {
    return diagnostic(
      'AUTH-CREDENTIALS-MISMATCH',
      'La clave local fue aceptada, pero Supabase Auth rechazó las credenciales vinculadas. Revisá auth_email y que la contraseña esté sincronizada con el usuario de Supabase.',
    );
  }

  if (normalizedCode === '42501' || /permission denied|row-level security|row level security|rls policy/i.test(errorText)) {
    return diagnostic(
      'DB-PERMISSION-DENIED',
      'Supabase respondió, pero rechazó la operación por permisos de base de datos. Revisá la sesión del usuario, las políticas RLS y los permisos de la RPC o tabla indicada en la consola.',
    );
  }

  return null;
};

export const getSupabaseDiagnosticMessage = (error) =>
  getSupabaseErrorDiagnostic(error)?.message || '';
