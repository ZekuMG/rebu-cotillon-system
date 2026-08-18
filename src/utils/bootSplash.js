// Detector de pantalla blanca del arranque.
//
// La regla vive acá afuera del componente por dos motivos: se puede testear sin
// montar React ni simular timers, y deja a la vista la única condición que
// importa. Antes estaba inline dentro del setTimeout de DebugAppShell y nadie
// podía verificar que hiciera lo correcto.
//
// Por qué 8000 ms y no 4500: el arranque real (auth + consultas iniciales +
// primer pintado) tranquilamente pasa los 4,5 s en una PC lenta. Con el umbral
// corto le tapábamos la app con una pantalla de crash a gente que estaba
// cargando bien.
export const BLANK_SCREEN_TIMEOUT_MS = 8000;

// Un tiempo sólo sirve si es un número finito y no negativo. Cualquier otra cosa
// (null, NaN, Infinity, texto) significa que no sabemos cuánto pasó, y sin ese
// dato preferimos callarnos antes que acusar una pantalla blanca inexistente.
const esTiempoValido = (value, { permitirCero = true } = {}) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return false;
  if (value < 0) return false;
  if (!permitirCero && value === 0) return false;
  return true;
};

export const shouldReportBlankScreen = ({
  appReady,
  crashed,
  elapsedMs,
  timeoutMs,
} = {}) => {
  // La app dibujó: no hay nada que reportar.
  if (appReady) return false;

  // Ya hay un crash con su stack en pantalla. Pisarlo con un genérico
  // "pantalla blanca" borraría la única pista útil.
  if (crashed) return false;

  // Un timeout de 0 o negativo reportaría siempre, incluso en el instante 0.
  if (!esTiempoValido(timeoutMs, { permitirCero: false })) return false;
  if (!esTiempoValido(elapsedMs)) return false;

  return elapsedMs >= timeoutMs;
};
