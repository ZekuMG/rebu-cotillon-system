// Frescura del QR de WhatsApp. Los umbrales viven acá, juntos, para poder
// moverlos sin salir a buscarlos por la vista.
//
// Por qué 40 s y no menos: pedirle el código a Evolution de nuevo NO lo renueva,
// devuelve el vigente. Renovar de verdad obliga a reiniciar la conexión. Medido
// el 17-ago-2026, el código puede no cambiar en 30 s, así que forzar antes
// dejaría la conexión reiniciándose sin parar y el celular nunca llegaría a
// completar el escaneo.

export const QR_WARN_SECONDS = 15;
export const QR_FORCE_SECONDS = 40;
export const QR_STALE_KEEP_SECONDS = 60;

// La edad la calcula el bot y viaja en la respuesta. No se deriva del reloj
// local porque las PCs remotas pueden tener la hora corrida y el contador
// saldría mal justo donde más importa.
const normalizeAge = (value) => {
  const age = Number(value);
  if (!Number.isFinite(age) || age <= 0) return 0;
  return Math.floor(age);
};

export const qrFreshness = ({ ageSeconds } = {}) => {
  const age = normalizeAge(ageSeconds);

  if (age >= QR_FORCE_SECONDS) {
    return {
      level: 'stale',
      ageSeconds: age,
      shouldForce: true,
      label: 'Renovando código...',
    };
  }

  if (age >= QR_WARN_SECONDS) {
    return {
      level: 'warn',
      ageSeconds: age,
      shouldForce: false,
      label: `Generado hace ${age} s · puede estar por vencer`,
    };
  }

  return {
    level: 'fresh',
    ageSeconds: age,
    shouldForce: false,
    label: `Generado hace ${age} s`,
  };
};

// Cuando una respuesta llega sin QR se conserva el anterior para cubrir un
// hueco puntual, pero sólo mientras siga siendo escaneable. Sin dato de edad
// no se descarta nada: el hueco puede ser de la respuesta, no del código.
export const shouldDropStaleQr = ({ ageSeconds } = {}) => {
  const age = Number(ageSeconds);
  if (!Number.isFinite(age)) return false;
  return age >= QR_STALE_KEEP_SECONDS;
};
