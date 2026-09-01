/**
 * Piso de confianza para una lectura de precio de Casa Alberto.
 *
 * El lector (electron-main.cjs) puntua a cada candidato -- +100 si coincide el
 * `idp`, +80 el codigo de proveedor, +20 el parecido del titulo -- y despues
 * NO usa ese puntaje para nada: ordena, agarra el primero y devuelve
 * `status:'found'` aunque haya sacado 0. Encima, cuando la pagina no es la ficha
 * del producto, el titulo cae a cualquier <h1> del documento y el precio a
 * cualquier "$N" del cuerpo.
 *
 * Medido en produccion el 1-sep-2026: 74 de 499 enlaces habian leido la pagina
 * del carrito y guardado el TOTAL DEL CARRITO como precio del producto.
 *
 * Regla: ante la duda no se guarda precio. Un dato faltante es recuperable;
 * un costo falso aprobado, no.
 */

// La ficha de un producto siempre es /pedido/detalle.php (o detalle_mobile.php)
// con un idp. El carrito, el listado y el login no lo son.
const URL_DE_FICHA = /\/pedido\/detalle(?:_mobile)?\.php\?[^#]*\bidp=\d+/i;

const soloDigitos = (valor) => String(valor || '').replace(/\D/g, '');

const mismoCodigo = (a, b) => {
  const x = soloDigitos(a);
  const y = soloDigitos(b);
  if (!x || !y) return false;
  // Casa Alberto a veces publica el codigo con un digito verificador de mas o de
  // menos; el lector ya contemplaba esas dos variantes al puntuar.
  return x === y || x === y.slice(0, -1) || y === x.slice(0, -1);
};

/**
 * @param {{expected?: {casaAlbertoId?: string, supplierCode?: string},
 *          result?: {status?: string, casaAlbertoId?: string, supplierCode?: string,
 *                    productUrl?: string, sourceUrl?: string, url?: string}}} args
 * @returns {{accepted: boolean, reason: string}}
 */
export const evaluateSupplierReadResult = ({ expected = {}, result } = {}) => {
  if (!result || result.status !== 'found') {
    return { accepted: false, reason: 'sin_lectura' };
  }

  // Guarda barata y contundente: mata la clase entera del carrito sin depender
  // de que haya un id guardado con que comparar.
  const url = result.productUrl || result.sourceUrl || result.url || '';
  if (!URL_DE_FICHA.test(url)) {
    return { accepted: false, reason: 'url_no_es_ficha' };
  }

  const idEsperado = String(expected.casaAlbertoId || '').trim();
  const idLeido = String(result.casaAlbertoId || '').trim();
  if (idEsperado && idLeido) {
    return idEsperado === idLeido
      ? { accepted: true, reason: 'idp' }
      : { accepted: false, reason: 'id_distinto' };
  }

  const codigoEsperado = soloDigitos(expected.supplierCode);
  const codigoLeido = soloDigitos(result.supplierCode);
  if (codigoEsperado && codigoLeido) {
    return mismoCodigo(codigoEsperado, codigoLeido)
      ? { accepted: true, reason: 'codigo' }
      : { accepted: false, reason: 'codigo_distinto' };
  }

  // No hay id ni codigo guardados con que probar identidad. No se puede exigir
  // mas que una ficha valida; el parecido del titulo NO cuenta como prueba.
  return { accepted: true, reason: 'solo_url' };
};
