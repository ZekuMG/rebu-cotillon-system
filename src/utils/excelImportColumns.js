import { parseExcelMoney } from './excelImportNumbers.js';

/**
 * Del Excel del proveedor solo hacen falta DOS columnas: el codigo (para cruzar
 * con el inventario) y el precio. Antes se exigian siete -- codigo, descripcion,
 * cantidad, precio, descuento, costo y venta -- y si faltaba una sola el archivo
 * se rechazaba entero, incluso cuando dos de ellas (precio y descuento) no
 * entraban en ningun calculo.
 */
export const REQUIRED_EXCEL_COLUMNS = ['codigo', 'precio'];

/** Compara encabezados sin tildes, sin mayusculas y sin espacios ni signos. */
export const normalizeExcelHeader = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');

export const getMissingExcelColumns = (headers = []) => {
  const presentes = (headers || []).map(normalizeExcelHeader);
  return REQUIRED_EXCEL_COLUMNS.filter((column) => !presentes.includes(column));
};

const getValue = (row, key) => {
  const target = normalizeExcelHeader(key);
  const foundKey = Object.keys(row || {}).find(
    (candidate) => normalizeExcelHeader(candidate) === target,
  );
  return foundKey ? row[foundKey] : '';
};

const parseQuantity = (value) => {
  const parsed = parseExcelMoney(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Lee una fila del Excel y completa lo que no vino:
 * - sin Costo (o vacio) -> el Precio hace de costo;
 * - sin Cantidad -> 0, para NO inventar stock que nadie pidio sumar;
 * - sin Venta -> 0, que la app trata como "el proveedor no sugirio precio";
 * - sin Descripcion/Categoria -> vacio, la fila se enlaza o se completa a mano.
 */
export const resolveExcelRowValues = (row = {}) => {
  const rawQuantity = getValue(row, 'Cantidad');
  const rawCost = getValue(row, 'Costo');
  const providerPrice = parseExcelMoney(getValue(row, 'Precio'));
  const hasCost = String(rawCost ?? '').trim() !== '';
  const lotCost = hasCost ? parseExcelMoney(rawCost) : providerPrice;

  return {
    code: String(getValue(row, 'Codigo') ?? '').trim(),
    description: String(getValue(row, 'Descripcion') ?? '').trim(),
    category: String(getValue(row, 'Categoria') ?? '').trim(),
    quantity: parseQuantity(rawQuantity),
    // Una lista de precios sin columna Cantidad no es un error: simplemente no
    // toca el stock. Distinto es que la columna exista y venga vacia.
    quantityMissing: String(rawQuantity ?? '').trim() === '',
    providerPrice,
    discount: parseExcelMoney(getValue(row, 'Descuento')),
    lotCost,
    lotSalePrice: parseExcelMoney(getValue(row, 'Venta')),
    costFromProviderPrice: !hasCost,
  };
};
