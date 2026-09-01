/**
 * Cuantas unidades de Rebu cubre un precio de Casa Alberto.
 *
 * Vive aparte del editor masivo a proposito: la deteccion anterior era una
 * funcion privada dentro de un archivo de vista de 5.500 lineas y no se podia
 * probar sin montar el editor entero.
 *
 * Dos ideas que costaron caro y conviene no volver a perder:
 *
 *  1. El divisor NO es una propiedad del titulo de Casa Alberto. Es el COCIENTE
 *     entre lo que ellos cobran y lo que Rebu vende como una unidad, y las dos
 *     puntas pueden venir por pack (`CUBANITO ... x6` contra `Cubanito ... x48`).
 *     Por eso `detectPackSize` lee UN titulo y `resolveUnitDivisor` combina los dos.
 *
 *  2. Confundir una medida con una cantidad es peor que no detectar nada:
 *     dividir por gramos, metros o centimetros hace ver el costo mas barato de
 *     lo que es, y eso se aprueba sin que nadie lo note.
 *
 * Ante la duda no se adivina: se devuelve `null` y decide una persona.
 */

// Si el numero viene seguido de esto, es una medida y no una cantidad de unidades.
// Ojo: la pulgada (") no puede llevar \b -- no es caracter de palabra, y con \b
// un titulo como 'reflex 12" azul x10' dejaba de contarla como medida.
const UNIDAD_DE_MEDIDA = /^\s*(?:"|(?:cm|mm|mts|mt|m|kgs|kg|k|grs|gr|g|lts|lt|l|ml|cc)\b\.?)/;

// Parentesis que son SOLO dimensiones: "(25 x17 x9cm)", "(1.00 x2.00 mts)", "(21cm)".
const PARENTESIS_DE_DIMENSIONES =
  /\((?:[\d.,\s]|x|×)*(?:cm|mm|mts|mt|m|kgs|kg|grs|gr|g|lts|lt|l|ml|cc)\s*\.?\s*\)/g;

const PALABRA_DE_BULTO = 'bulto|pack|packing|display|blister|bolson|bolsón|plancha|tira';

// La palabra de bulto sola NO alcanza: "Blister 100 pirotines" describe el
// contenido del blister, y Rebu vende el blister entero. Tiene que haber una
// multiplicacion de verdad.
//   "bulto 6 x kg." | "bulto8x500grs" | "bulto 12unidx400gr"  -> PALABRA <N> [unid] x
//   "bulto x10kg"   | "packx10u."                              -> PALABRA x <N>
const BULTO_NUMERO_POR = new RegExp(
  '(?:' + PALABRA_DE_BULTO + ')\\s*(\\d{1,4})\\s*(?:u|un|uni|unid|unidad|unidades)?\\s*x',
  'g',
);
const BULTO_POR_NUMERO = new RegExp(
  '(?:' + PALABRA_DE_BULTO + ')[^0-9a-z]{0,3}x\\s*(\\d{1,4})',
  'g',
);

// "x10u.", "x 12 unidades", "packx10u."
const POR_NUMERO_UNIDADES = /x\s*(\d{1,4})\s*(?:u|un|uni|unid|unidad|unidades|pz|pzs)\b\.?/g;

// "x5", "x25", "gatox6" -- la senal mas debil, la que mas guardas necesita.
const POR_NUMERO_SUELTO = /x\s*(\d{1,4})(?![.,]\d)/g;

const PESO = { bulto: 3, xNu: 2, xN: 1 };

const esCantidadValida = (n) => Number.isInteger(n) && n > 1 && n < 10000;

/**
 * Lee el tamano del pack de UN titulo.
 * @returns {{pack: number|null, rule: string}} `pack: null` = ambiguo, no adivinar.
 */
export const detectPackSize = (titulo) => {
  let texto = String(titulo || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!texto) return { pack: 1, rule: 'sin-titulo' };

  // Las dimensiones se sacan de la cancha antes de mirar cualquier otra cosa.
  texto = texto.replace(PARENTESIS_DE_DIMENSIONES, ' ');

  const candidatos = [];
  const proponer = (n, rule, resto) => {
    if (!esCantidadValida(n)) return;
    if (resto !== undefined && UNIDAD_DE_MEDIDA.test(resto)) return;
    candidatos.push({ n, rule });
  };

  // El numero atado a la palabra de bulto es la cantidad aunque despues venga
  // una medida: "bulto x10kg" son 10 paquetes de 1 kg. Por eso no se mira el resto.
  for (const m of texto.matchAll(BULTO_NUMERO_POR)) proponer(Number(m[1]), 'bulto');
  for (const m of texto.matchAll(BULTO_POR_NUMERO)) proponer(Number(m[1]), 'bulto');

  for (const m of texto.matchAll(POR_NUMERO_UNIDADES)) proponer(Number(m[1]), 'xNu');

  for (const m of texto.matchAll(POR_NUMERO_SUELTO)) {
    // Un digito PEGADO a la x es una dimension ("10x10x5"). Con un espacio de por
    // medio no lo es: "nº 8 x5", "t260 x50" y "ctadg025 x25" si son cantidades.
    if (/\d$/.test(texto.slice(0, m.index))) continue;
    proponer(Number(m[1]), 'xN', texto.slice(m.index + m[0].length));
  }

  if (candidatos.length === 0) return { pack: 1, rule: 'sin-senal' };

  const pesoMaximo = Math.max(...candidatos.map((c) => PESO[c.rule]));
  const mejores = candidatos.filter((c) => PESO[c.rule] === pesoMaximo);
  const distintos = [...new Set(mejores.map((c) => c.n))];
  if (distintos.length > 1) return { pack: null, rule: 'ambiguo' };
  return { pack: distintos[0], rule: mejores[0].rule };
};

/**
 * Cuantas unidades de Rebu cubre un precio de Casa Alberto.
 * @returns {{divisor: number|null, reason: string}} `divisor: null` = lo decide una persona.
 */
export const resolveUnitDivisor = ({ supplierTitle, rebuTitle } = {}) => {
  const proveedor = detectPackSize(supplierTitle);
  if (proveedor.pack === null) {
    return { divisor: null, reason: 'ambiguo: el titulo del proveedor da dos cantidades' };
  }

  const rebu = detectPackSize(rebuTitle);
  if (rebu.pack === null) {
    return { divisor: null, reason: 'ambiguo: el titulo de Rebu da dos cantidades' };
  }

  if (rebu.pack === 1) return { divisor: proveedor.pack, reason: proveedor.rule };

  // Las dos puntas traen pack: no se puede saber si el precio del proveedor cubre
  // varios packs de Rebu o si los dos packs son la misma cosa.
  return {
    divisor: null,
    reason: `ambiguo: proveedor x${proveedor.pack} y Rebu x${rebu.pack}`,
  };
};
