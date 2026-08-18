// Bajar al último mensaje al abrir un chat, con reintentos.
//
// Por qué reintentar en vez de hacerlo una vez: al abrir, la altura real del
// chat cambia varias veces (llegan mensajes, cargan imágenes y audios, se
// acomodan las fuentes). Un único `scrollTop = scrollHeight` puede correr
// cuando el contenido todavía medía poco, y queda arriba para siempre — que es
// justo lo que se reportó el 17-ago-2026.
//
// Se probaron y descartaron: el orden de los datos (llega bien), las
// dependencias del efecto (correctas) y el contenedor del scroll (es el que
// tiene overflow). Al no encontrar la causa, la defensa es insistir.

export const AL_FONDO_TOLERANCIA_PX = 4;
export const REINTENTOS_MAX = 12;
export const REINTENTO_INTERVALO_MS = 120;

// ¿Ya está abajo de todo? Con tolerancia, porque los navegadores redondean.
export const estaAlFondo = (metricas = {}) => {
  const alto = Number(metricas.scrollHeight);
  const visible = Number(metricas.clientHeight);
  const arriba = Number(metricas.scrollTop);
  if (!Number.isFinite(alto) || !Number.isFinite(visible) || !Number.isFinite(arriba)) return false;
  // Si el contenido entra entero no hay nada que scrollear: ya se ve el final.
  if (alto <= visible) return true;
  return alto - arriba - visible <= AL_FONDO_TOLERANCIA_PX;
};

// Decide si conviene volver a intentar. Deja de insistir cuando ya llegó,
// cuando el usuario tomó el control, o cuando se agotaron los intentos: nunca
// hay que pelearle el scroll a la persona que lo está usando.
export const debeReintentar = ({
  metricas,
  intentos = 0,
  usuarioTomoControl = false,
  cancelado = false,
} = {}) => {
  if (cancelado || usuarioTomoControl) return false;
  if (intentos >= REINTENTOS_MAX) return false;
  return !estaAlFondo(metricas || {});
};
