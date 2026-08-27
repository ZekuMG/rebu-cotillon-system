// Bitacora local de errores crudos.
//
// Por que existe: cuando el cobro falla, la app muestra un mensaje ya traducido
// y el error original se pierde. No hay log a disco ni IPC para escribirlo, asi
// que no quedaba forma de saber QUIEN rechaza una sesion. Esto guarda el objeto
// de error tal cual llego, en cada PC, y sobrevive reinicios.
//
// Para leerlo: consola de la app ->
//   JSON.parse(localStorage.getItem('rebu_diag_errors_v1'))

const DIAGNOSTIC_ERRORS_KEY = 'rebu_diag_errors_v1';
const MAX_ENTRIES = 25;

export const describeRawError = (error) => ({
  message: error?.message ?? null,
  code: error?.code ?? null,
  details: error?.details ?? null,
  hint: error?.hint ?? null,
  status: error?.status ?? null,
  name: error?.name ?? null,
});

export const recordDiagnosticError = (scope, error, extra = {}) => {
  const entry = {
    at: new Date().toISOString(),
    // El reloj de la PC importa para interpretar errores de token: se guarda
    // el desfase declarado por el navegador para poder cruzarlo despues.
    tzOffsetMin: new Date().getTimezoneOffset(),
    scope,
    ...describeRawError(error),
    ...extra,
  };

  try {
    if (typeof window === 'undefined' || !window.localStorage) return entry;
    const previous = JSON.parse(window.localStorage.getItem(DIAGNOSTIC_ERRORS_KEY) || '[]');
    const entries = Array.isArray(previous) ? previous : [];
    entries.push(entry);
    window.localStorage.setItem(
      DIAGNOSTIC_ERRORS_KEY,
      JSON.stringify(entries.slice(-MAX_ENTRIES)),
    );
  } catch {
    // Una bitacora de diagnostico nunca puede romper una venta.
  }

  return entry;
};

export const readDiagnosticErrors = () => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return [];
    const stored = JSON.parse(window.localStorage.getItem(DIAGNOSTIC_ERRORS_KEY) || '[]');
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
};
