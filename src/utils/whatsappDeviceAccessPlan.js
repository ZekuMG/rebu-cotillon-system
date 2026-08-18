// Qué hacer con el permiso de esta PC para usar WhatsApp.
//
// La regla vive acá afuera, sin Supabase ni Electron encima, porque el error
// que causó el callejón sin salida del 17-ago-2026 fue justamente de decisión,
// no de red:
//
//   La app daba por aprobada a la PC central sin preguntarle NUNCA a la base
//   ("si soy la central, estoy aprobada"). El bot, en cambio, sí validaba
//   contra la base y contestaba 403. Resultado: la app se creía habilitada, por
//   lo tanto NO mostraba el botón para pedir acceso, y el panel donde se
//   aprueban dispositivos tampoco abría porque también le pegaba al bot y comía
//   el mismo 403. Para aprobar la PC había que entrar a una pantalla que exigía
//   que la PC ya estuviera aprobada.
//
// De acá en adelante la app nunca inventa una aprobación: pregunta, y si no
// está aprobada lo dice y deja registrado el pedido para que alguien lo apruebe.
//
// La central no es un caso especial que se salte la base: es un caso especial
// que se REGISTRA solo, para que su pedido exista y se pueda aprobar desde
// cualquier PC en vez de quedar trabado en la propia.

export const APROBAR = 'aprobar';
export const REGISTRAR = 'registrar';
export const CONSULTAR = 'consultar';
export const NADA = 'nada';

const ROLES_QUE_APRUEBAN = ['system', 'sistema'];

export const normalizarRol = (valor) => String(valor || '')
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .trim()
  .toLowerCase();

export const puedeAprobar = (rol) => ROLES_QUE_APRUEBAN.includes(normalizarRol(rol));

export const estaAprobado = (estado) => (
  estado?.approved === true || estado?.status === 'approved'
);

// Primer paso: ¿tiene sentido preguntarle a la base?
export const primerPaso = (device) => (
  device?.supported && device?.deviceId && device?.tokenHash ? CONSULTAR : NADA
);

// Segundo paso, ya con la respuesta de la base en la mano.
export const siguientePaso = ({ device, rol, estado }) => {
  if (estaAprobado(estado)) return NADA;

  const yaPidio = Boolean(estado?.id) || estado?.status === 'pending';

  // Sólo un usuario Sistema puede aprobar. Si además es la central, se aprueba
  // sola: es la PC donde corre el bot, no tiene a nadie mas arriba que le firme.
  if (puedeAprobar(rol) && device?.centralMachineActive === true) return APROBAR;
  if (puedeAprobar(rol) && yaPidio) return APROBAR;

  // Cualquier otro caso deja el pedido anotado. Sin esto, una PC que no puede
  // aprobarse sola queda invisible y nadie sabe que esta esperando.
  return yaPidio ? NADA : REGISTRAR;
};

// Lo que ve la persona. Nunca "aprobado" si la base no lo dijo.
export const resultadoDeAcceso = ({ device, estado, error = null }) => {
  if (error) {
    return {
      status: 'error',
      approved: false,
      device,
      error: String(error?.message || error),
    };
  }
  if (!device?.supported) return { status: 'unsupported', approved: false, device };
  if (estaAprobado(estado)) return { ...estado, status: 'approved', approved: true, device };
  return { ...(estado || {}), status: estado?.status || 'pending', approved: false, device };
};
