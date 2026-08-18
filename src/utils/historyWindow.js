// Cómo se le explica a quien atiende qué conversaciones se ven y cuáles no.
//
// 🚨 REGLA DE ORO: esto lo lee alguien que vende cotillón, no un programador.
// Nada de "ventana de historial", "caché", "corte" ni nombres de la maquinaria.
// Hay un test que falla si se cuela cualquiera de esas palabras.
//
// Y la aclaración que no se puede perder nunca: elegir ver menos NO borra ni
// deja de guardar nada. Una bandeja vacía se lee como datos perdidos — ya pasó
// una vez y asustó.

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

// "27 de julio", como lo diría una persona. Sólo agrega el año si no es el
// actual: "27 de julio de 2025" para algo de hace mucho.
export const fechaLarga = (iso, hoy = new Date()) => {
  if (!iso) return '';
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return '';
  const base = `${fecha.getDate()} de ${MESES[fecha.getMonth()]}`;
  return fecha.getFullYear() === hoy.getFullYear()
    ? base
    : `${base} de ${fecha.getFullYear()}`;
};

const numero = (valor) => (Number.isFinite(Number(valor)) ? Number(valor) : null);

const plural = (n, singular, pluralForma) => (n === 1 ? singular : pluralForma);

// Estado general: qué se está viendo y qué se puede hacer al respecto.
export const describeHistoryWindow = (window = null) => {
  const muestraTodo = !window || window.muestra_todo === true || !window.history_from;
  const importables = numero(window?.importables);

  if (muestraTodo) {
    return {
      recortado: false,
      puedeTraerMas: false,
      puedeTraerDelTelefono: importables === null || importables > 0,
      desde: '',
      title: 'Se ven todas las conversaciones',
      detail: 'La bandeja te muestra todas las conversaciones de este número, desde la primera.',
    };
  }

  const desde = fechaLarga(window.history_from);
  return {
    recortado: true,
    puedeTraerMas: window.agotado !== true,
    puedeTraerDelTelefono: importables === null || importables > 0,
    desde,
    title: 'Qué conversaciones se ven',
    detail: `Ahora mismo la bandeja te muestra lo que llegó desde el ${desde}. `
      + 'Lo de antes sigue guardado, nadie lo borró: podés volver a mostrarlo cuando quieras.',
  };
};

// La línea discreta que queda en la bandeja. No hace nada por su cuenta: sólo
// avisa y lleva a la sección. Sin esto, una bandeja recortada no tiene ninguna
// explicación a la vista y se lee como que se perdieron mensajes.
export const avisoDeBandeja = (window = null) => {
  const estado = describeHistoryWindow(window);
  if (!estado.recortado) return null;
  return {
    texto: `Estás viendo los mensajes desde el ${estado.desde}`,
    accion: 'Ver todas',
  };
};

// --- Traer del teléfono --------------------------------------------------
//
// Acá está la parte delicada. WhatsApp entrega casi todos los chats con un
// identificador que no es un número de teléfono, así que de 463 conversaciones
// sólo se pueden recuperar 22. Decirlo de entrada es la diferencia entre "esto
// está roto" y "ah, bueno, ya sé qué esperar".

export const explicacionDelTelefono = (window = null) => {
  const importables = numero(window?.importables);
  const total = numero(window?.total_chats);

  if (importables === 0) {
    return 'Por ahora no hay conversaciones para traer del teléfono. '
      + 'Las que falten van a aparecer solas apenas esa persona te escriba.';
  }
  if (importables === null || total === null) {
    return 'Traé al teléfono las conversaciones que tenga guardadas. '
      + 'WhatsApp no siempre las entrega todas; las que falten van a aparecer '
      + 'solas apenas esa persona te escriba.';
  }
  return `El teléfono tiene ${total} conversaciones, pero WhatsApp sólo deja `
    + `recuperar ${importables}. Las otras ${total - importables} no se pierden: `
    + 'van a aparecer solas apenas esa persona te escriba.';
};

export const importButtonLabel = (window = null) => {
  const importables = numero(window?.importables);
  if (importables === null) return 'Traer conversaciones del teléfono';
  if (importables === 0) return 'No hay nada para traer del teléfono';
  return `Traer ${importables} ${plural(importables, 'conversación', 'conversaciones')} del teléfono`;
};

// Qué decir cuando terminó de traer. El caso importante es el tercero: trajo
// bien, pero la bandeja las sigue tapando porque son más viejas que lo que se
// está mostrando. Sin este aviso parece que el botón no hizo nada.
export const describeImportResult = ({ importadas = 0, mensajes = 0, ocultas = 0 } = {}) => {
  const traidas = numero(importadas) || 0;
  const tapadas = numero(ocultas) || 0;

  if (traidas === 0) {
    return {
      titulo: 'No había conversaciones nuevas para traer.',
      detalle: 'Ya tenías guardado todo lo que WhatsApp deja recuperar de este teléfono.',
      ofrecerMostrarTodo: false,
    };
  }

  const cuantosMensajes = numero(mensajes) || 0;
  const titulo = `Listo, traje ${traidas} ${plural(traidas, 'conversación', 'conversaciones')} del teléfono`
    + (cuantosMensajes ? ` con ${cuantosMensajes} ${plural(cuantosMensajes, 'mensaje', 'mensajes')}.` : '.');

  if (tapadas === 0) {
    return { titulo, detalle: 'Ya las podés ver en la bandeja.', ofrecerMostrarTodo: false };
  }

  return {
    titulo,
    detalle: `Hay ${tapadas} que todavía no se ${plural(tapadas, 've', 'ven')} en la bandeja, `
      + 'porque está puesta para mostrar sólo lo del último tiempo.',
    ofrecerMostrarTodo: true,
  };
};

// --- Lo que ya está guardado --------------------------------------------
//
// El botón de antes. Se queda, pero rotulado de forma que no se pueda confundir
// con el del teléfono: son dos cosas distintas y esa confusión era el problema
// original.

export const olderButtonLabel = (window = null, batchSize = 10) => {
  const estado = describeHistoryWindow(window);
  if (!estado.recortado) return '';
  if (!estado.puedeTraerMas) return 'Mostrar todas las guardadas';
  return `Mostrar ${batchSize} conversaciones guardadas más`;
};

// --- Confirmaciones ------------------------------------------------------

export const CLEAN_START_CONFIRM = {
  title: '¿Empezar de cero?',
  detail: 'El número sigue conectado y funcionando igual. Vas a ver sólo los mensajes '
    + 'que lleguen de ahora en adelante. Lo de antes no se borra: lo podés volver a '
    + 'mostrar cuando quieras.',
  confirmar: 'Sí, empezar de cero',
  cancelar: 'No, dejar como está',
};

export const MOSTRAR_TODO_CONFIRM = {
  title: '¿Mostrar todas las conversaciones?',
  detail: 'La bandeja va a mostrar todo lo guardado de este número, desde la primera '
    + 'conversación. Lo van a ver todos los que usan la bandeja, no sólo vos.',
  confirmar: 'Sí, mostrar todas',
  cancelar: 'Mejor no',
};
