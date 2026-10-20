// Red de seguridad contra un token de sesion rechazado.
//
// PostgREST prioriza Authorization sobre la apikey. Un token rechazado deja
// inaccesibles incluso las lecturas publicas necesarias para volver a entrar.
//
// LA CURA. Ante ese 401 se descarta la sesion local, y el pedido se reintenta
// una vez como anonimo. Con varios cuidados aprendidos de la auditoria:
//
//   * SOLO se reintentan GET/HEAD de productos y el directorio publico de
//     usuarios. Las lecturas privadas y las escrituras conservan el 401 para
//     que Rebu pida reingreso. Reintentar un POST podria duplicar una venta.
//   * El descarte es una promesa compartida, no un booleano. Al arrancar, la
//     app dispara muchas consultas en paralelo: con un booleano se reparaba
//     UNA sola y el resto le llegaba rota a la pantalla igual.
//   * El desfase de reloj entre servidores de Supabase queda afuera. Ese error
//     tambien llega como 401 y se corrige solo en un segundo; matar la sesion
//     por un parpadeo seria peor. De eso se ocupa `retryOnSupabaseClockSkew`.
//   * Hay corta-corriente: si descartar la sesion falla varias veces seguidas,
//     se deja de intentar. Si no, cada consulta pasaria a costar dos pedidos
//     para siempre, sin que nadie se entere.
//   * Antes de tirar el 401 se guarda el motivo (sb-request-id, el
//     WWW-Authenticate y el code del cuerpo). Sin eso no hay forma de saber
//     POR QUE Supabase rechazo el token, que es lo que costo una tarde entera.

const METODOS_REINTENTABLES = new Set(['GET', 'HEAD']);
const RUTA_DE_AUTH = '/auth/v1/';
const RUTAS_PUBLICAS = new Set(['/rest/v1/products', '/rest/v1/app_users_public']);

export const esErrorDeDesfaseDeReloj = (texto) =>
  /jwt.*issued.*future|issued at future|issuedatfuture|not before/i.test(String(texto || ''));

const rutaDe = (entrada) => {
  const url = typeof entrada === 'string' ? entrada : entrada?.url || '';
  try {
    return new URL(url, 'http://local').pathname;
  } catch {
    return String(url);
  }
};

export const esPedidoDeAuth = (entrada) => rutaDe(entrada).startsWith(RUTA_DE_AUTH);
export const esLecturaPublica = (entrada, metodo) =>
  METODOS_REINTENTABLES.has(String(metodo || 'GET').toUpperCase()) &&
  RUTAS_PUBLICAS.has(rutaDe(entrada));

// El motivo del rechazo vive repartido entre cabeceras y cuerpo. Se lee sobre
// un clon para no consumir la respuesta que despues se devuelve.
export const describirRechazo = async (respuesta, { url, metodo }) => {
  const detalle = {
    url: rutaDe(url),
    metodo,
    estado: respuesta?.status ?? null,
    requestId: null,
    proxyStatus: null,
    wwwAuthenticate: null,
    code: null,
    message: null,
  };

  try {
    detalle.requestId = respuesta.headers?.get?.('sb-request-id') ?? null;
    detalle.proxyStatus = respuesta.headers?.get?.('proxy-status') ?? null;
    detalle.wwwAuthenticate = respuesta.headers?.get?.('www-authenticate') ?? null;
  } catch {
    // Las cabeceras nunca pueden romper el pedido.
  }

  try {
    const cuerpo = await respuesta.clone().json();
    detalle.code = cuerpo?.code ?? null;
    detalle.message = cuerpo?.message ?? cuerpo?.msg ?? null;
  } catch {
    // Un 401 sin cuerpo JSON es normal; alcanza con las cabeceras.
  }

  return detalle;
};

export const crearFetchAutoreparable = ({
  fetchOriginal,
  anonKey,
  descartarSesion,
  registrarDiagnostico = () => {},
  avisar = () => {},
  esperaDescarteMs = 2000,
  fallosTolerados = 3,
}) => {
  let descarteEnCurso = null;
  let fallosSeguidos = 0;

  const descartarUnaSolaVez = () => {
    if (descarteEnCurso) return descarteEnCurso;

    const conTimeout = Promise.race([
      Promise.resolve().then(() => descartarSesion()),
      new Promise((_, rechazar) => {
        setTimeout(() => rechazar(new Error('timeout al descartar la sesion')), esperaDescarteMs);
      }),
    ])
      .then(() => { fallosSeguidos = 0; return true; })
      .catch(() => { fallosSeguidos += 1; return false; })
      .finally(() => { descarteEnCurso = null; });

    descarteEnCurso = conTimeout;
    return conTimeout;
  };

  return async (entrada, init = {}) => {
    const respuesta = await fetchOriginal(entrada, init);
    if (respuesta.status !== 401) return respuesta;

    // Los endpoints de Auth contestan 401 de forma legitima (clave incorrecta,
    // sesion vencida). Meterse ahi solo generaria recursion.
    if (esPedidoDeAuth(entrada)) return respuesta;

    const cabeceras = new Headers(init?.headers || {});
    const portador = (cabeceras.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    // Si ya ibamos como anonimos, el 401 es real: no hay nada que reparar.
    if (!portador || portador === anonKey) return respuesta;

    const metodo = String(init?.method || 'GET').toUpperCase();
    const detalle = await describirRechazo(respuesta, { url: entrada, metodo });
    registrarDiagnostico(detalle);

    // Un token "emitido en el futuro" es un desfase entre los servidores de
    // Supabase que se corrige solo. No hay que matar la sesion por eso.
    if (esErrorDeDesfaseDeReloj(`${detalle.code} ${detalle.message} ${detalle.wwwAuthenticate}`)) {
      return respuesta;
    }

    if (fallosSeguidos >= fallosTolerados) return respuesta;

    avisar(detalle);
    const seDescarto = await descartarUnaSolaVez();

    // Una lectura privada no debe degradarse a anon. Al descartar la sesion,
    // App pide reingreso y conserva el carrito sin confirmar operaciones.
    if (!esLecturaPublica(entrada, metodo)) return respuesta;
    if (!seDescarto) return respuesta;

    cabeceras.set('Authorization', `Bearer ${anonKey}`);
    try {
      return await fetchOriginal(entrada, { ...init, headers: cabeceras });
    } catch {
      return respuesta;
    }
  };
};
