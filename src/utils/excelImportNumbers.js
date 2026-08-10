const THOUSANDS_GROUP_PATTERN = /^[+-]?\d{1,3}(?:[.,]\d{3})+$/;

const normalizeMoneyString = (value) => {
  const cleaned = String(value ?? '')
    .trim()
    .replace(/\$/g, '')
    .replace(/[\s\u00a0]/g, '');

  if (!cleaned) return '';

  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');

  if (lastComma >= 0 && lastDot >= 0) {
    return lastComma > lastDot
      ? cleaned.replace(/\./g, '').replace(',', '.')
      : cleaned.replace(/,/g, '');
  }

  if (THOUSANDS_GROUP_PATTERN.test(cleaned)) {
    return cleaned.replace(/[.,]/g, '');
  }

  return lastComma >= 0 ? cleaned.replace(',', '.') : cleaned;
};

export const parseExcelMoney = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = Number(normalizeMoneyString(value));
  return Number.isFinite(parsed) ? parsed : 0;
};

