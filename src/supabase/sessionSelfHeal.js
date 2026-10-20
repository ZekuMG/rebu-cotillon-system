// Un 401 aislado no prueba que el operador haya perdido la sesion. Renovamos
// el JWT una sola vez para las consultas concurrentes y reintentamos solo
// lecturas; las escrituras quedan a cargo de su flujo idempotente.
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
    // Un encabezado mal formado no debe romper el pedido.
  }

  try {
    const cuerpo = await respuesta.clone().json();
    detalle.code = cuerpo?.code ?? null;
    detalle.message = cuerpo?.message ?? cuerpo?.msg ?? null;
  } catch {
    // Un 401 sin JSON es normal.
  }

  return detalle;
};

export const crearFetchAutoreparable = ({
  fetchOriginal,
  anonKey,
  renovarSesion = async () => null,
  registrarDiagnostico = () => {},
  avisar = () => {},
  esperaRenovacionMs = 5000,
  pausaTrasFalloMs = 3000,
}) => {
  let renovacionEnCurso = null;
  let proximaRenovacion = 0;

  const esperarConLimite = (pendiente) => new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), esperaRenovacionMs);
    pendiente.then((token) => {
      clearTimeout(timer);
      resolve(token);
    });
  });

  const renovarUnaSolaVez = async () => {
    if (renovacionEnCurso) return esperarConLimite(renovacionEnCurso);
    if (Date.now() < proximaRenovacion) return null;

    const pendiente = Promise.resolve()
      .then(() => renovarSesion())
      .then((token) => {
        if (token) proximaRenovacion = 0;
        else proximaRenovacion = Date.now() + pausaTrasFalloMs;
        return token || null;
      })
      .catch(() => {
        proximaRenovacion = Date.now() + pausaTrasFalloMs;
        return null;
      })
      .finally(() => { renovacionEnCurso = null; });
    renovacionEnCurso = pendiente;
    return esperarConLimite(pendiente);
  };

  return async (entrada, init = {}) => {
    const respuesta = await fetchOriginal(entrada, init);
    if (respuesta.status !== 401 || esPedidoDeAuth(entrada)) return respuesta;

    const cabeceras = new Headers(init?.headers || {});
    const portador = (cabeceras.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!portador || portador === anonKey) return respuesta;

    const metodo = String(init?.method || 'GET').toUpperCase();
    const detalle = await describirRechazo(respuesta, { url: entrada, metodo });
    registrarDiagnostico(detalle);
    if (esErrorDeDesfaseDeReloj(`${detalle.code} ${detalle.message} ${detalle.wwwAuthenticate}`)) {
      return respuesta;
    }

    avisar(detalle);
    const tokenRenovado = await renovarUnaSolaVez();
    if (tokenRenovado && tokenRenovado !== portador && METODOS_REINTENTABLES.has(metodo)) {
      cabeceras.set('Authorization', `Bearer ${tokenRenovado}`);
      try {
        const nuevoIntento = await fetchOriginal(entrada, { ...init, headers: cabeceras });
        if (nuevoIntento.status !== 401) return nuevoIntento;
      } catch {
        // Devolver el error original permite que el flujo de nube lo clasifique.
      }
    }

    if (!esLecturaPublica(entrada, metodo)) return respuesta;
    cabeceras.set('Authorization', `Bearer ${anonKey}`);
    try {
      return await fetchOriginal(entrada, { ...init, headers: cabeceras });
    } catch {
      return respuesta;
    }
  };
};
