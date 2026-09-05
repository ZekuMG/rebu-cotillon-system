/**
 * Enlazar a mano con Casa Alberto.
 *
 * Dos cosas que antes no se podian hacer:
 *  - Corregir el enlace pegando el link de la ficha, cuando el buscador engancho
 *    un producto que no tiene nada que ver.
 *  - Sumar otro producto de Rebu al mismo enlace (el mismo articulo cargado dos
 *    veces, o dos presentaciones que compran juntas).
 */

import { getCasaAlbertoLink, getProductActiveState, productHasCasaAlbertoLink } from './productLifecycle.js';

export const CASA_ALBERTO_HOST = 'cotilloncasaalberto.com.ar';
export const CASA_ALBERTO_DETAIL_URL = `https://${CASA_ALBERTO_HOST}/pedido/detalle.php`;

const toTrimmedString = (value) => String(value ?? '').trim();

/**
 * Acepta el link de la ficha o directamente el numero de producto.
 * Devuelve { valid, casaAlbertoId, productUrl, reason }.
 */
export const parseCasaAlbertoProductInput = (input = '') => {
  const raw = toTrimmedString(input);
  if (!raw) return { valid: false, reason: 'Pegá el link de Casa Alberto o el número del producto.' };

  // El numero de producto pelado tambien sirve: es lo que se ve en la ficha.
  if (/^\d{1,10}$/.test(raw)) {
    return {
      valid: true,
      casaAlbertoId: raw,
      productUrl: `${CASA_ALBERTO_DETAIL_URL}?idp=${raw}`,
    };
  }

  let parsed;
  try {
    parsed = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return { valid: false, reason: 'Eso no parece un link válido.' };
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  if (host !== CASA_ALBERTO_HOST) {
    return { valid: false, reason: `El link tiene que ser de ${CASA_ALBERTO_HOST}.` };
  }

  const id = toTrimmedString(parsed.searchParams.get('idp'));
  if (!id || !/^\d+$/.test(id)) {
    return {
      valid: false,
      reason: 'Ese link no apunta a un producto. Abrí la ficha del artículo y copiá esa dirección.',
    };
  }

  return {
    valid: true,
    casaAlbertoId: id,
    productUrl: `${CASA_ALBERTO_DETAIL_URL}?idp=${id}`,
  };
};

/** El enlace que se guarda en cada producto al corregirlo a mano. */
export const buildManualCasaAlbertoLink = ({ casaAlbertoId, productUrl, foundTitle = '' } = {}) => {
  const id = toTrimmedString(casaAlbertoId);
  if (!id) return null;
  return {
    casaAlbertoId: id,
    productUrl: toTrimmedString(productUrl) || `${CASA_ALBERTO_DETAIL_URL}?idp=${id}`,
    sourceUrl: toTrimmedString(productUrl) || `${CASA_ALBERTO_DETAIL_URL}?idp=${id}`,
    matchedBy: 'manual',
    ...(foundTitle ? { foundTitle: toTrimmedString(foundTitle) } : {}),
  };
};

const normalizeSearch = (value = '') =>
  String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * Productos que se pueden sumar al enlace. Se saca lo que ya esta en el grupo y
 * lo dado de baja. Lo que ya tiene OTRO enlace se muestra igual, pero marcado:
 * sumarlo le pisa el enlace que tenia, y eso hay que verlo antes de tocar.
 */
export const findLinkableProducts = ({
  inventory = [],
  query = '',
  group = {},
  limit = 20,
} = {}) => {
  const needle = normalizeSearch(query);
  if (!needle) return [];

  const alreadyInGroup = new Set(
    (Array.isArray(group?.products) ? group.products : []).map((product) => String(product?.id)),
  );
  const groupId = toTrimmedString(group?.casaAlbertoId);
  const words = needle.split(' ').filter(Boolean);
  const matches = [];

  for (const product of Array.isArray(inventory) ? inventory : []) {
    if (!product?.id) continue;
    if (alreadyInGroup.has(String(product.id))) continue;
    if (!getProductActiveState(product)) continue;

    const haystack = normalizeSearch(`${product.title || ''} ${product.barcode || ''}`);
    if (!words.every((word) => haystack.includes(word))) continue;

    const currentLink = getCasaAlbertoLink(product);
    const currentId = toTrimmedString(currentLink.casaAlbertoId);
    // Si ya apunta a ESTE mismo enlace no hay nada que sumar.
    if (groupId && currentId && currentId === groupId) continue;

    matches.push({
      product,
      hasOtherLink: productHasCasaAlbertoLink(product),
      currentLinkTitle: toTrimmedString(currentLink.foundTitle),
    });
    if (matches.length >= Math.max(1, Number(limit) || 20)) break;
  }

  return matches;
};
