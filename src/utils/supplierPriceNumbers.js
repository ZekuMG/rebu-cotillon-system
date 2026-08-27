const getDecimalSeparatorIndex = (text) => {
  const commaIndex = text.lastIndexOf(',');
  const dotIndex = text.lastIndexOf('.');

  if (commaIndex >= 0 && dotIndex >= 0) return Math.max(commaIndex, dotIndex);

  const separatorIndex = Math.max(commaIndex, dotIndex);
  if (separatorIndex < 0) return -1;

  const separator = text[separatorIndex];
  const separatorCount = text.split(separator).length - 1;
  const decimalDigits = text.length - separatorIndex - 1;

  // Un unico punto o coma con uno o dos digitos representa centavos.
  // Varias apariciones, o tres digitos finales, se consideran separadores de miles.
  return separatorCount === 1 && decimalDigits >= 1 && decimalDigits <= 2
    ? separatorIndex
    : -1;
};

export const parseSupplierPrice = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;

  const text = String(value ?? '')
    .trim()
    .replace(/[^\d,.-]/g, '');
  if (!text) return 0;

  const decimalSeparatorIndex = getDecimalSeparatorIndex(text);
  const isNegative = text.startsWith('-');
  const unsignedText = text.replace(/-/g, '');

  let normalized;
  if (decimalSeparatorIndex >= 0) {
    const unsignedDecimalIndex = decimalSeparatorIndex - (isNegative ? 1 : 0);
    const integerPart = unsignedText.slice(0, unsignedDecimalIndex).replace(/[.,]/g, '');
    const decimalPart = unsignedText.slice(unsignedDecimalIndex + 1).replace(/[.,]/g, '');
    normalized = `${isNegative ? '-' : ''}${integerPart || '0'}.${decimalPart}`;
  } else {
    normalized = `${isNegative ? '-' : ''}${unsignedText.replace(/[.,]/g, '')}`;
  }

  const numberValue = Number(normalized);
  return Number.isFinite(numberValue) ? numberValue : 0;
};

export const normalizeSupplierPrice = (value) => {
  const numberValue = parseSupplierPrice(value);
  if (!Number.isFinite(numberValue) || numberValue <= 0) return 0;
  return Math.ceil(numberValue / 10) * 10;
};
