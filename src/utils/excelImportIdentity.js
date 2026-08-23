const EXCEL_IMPORT_SIGNATURE_VERSION = 'excel-v1';

const bytesToHex = (bytes) => Array.from(bytes)
  .map((byte) => byte.toString(16).padStart(2, '0'))
  .join('');

export const fingerprintExcelImportBuffer = async (buffer, cryptoApi = globalThis.crypto) => {
  if (!(buffer instanceof ArrayBuffer)) {
    throw new TypeError('El archivo Excel no tiene un contenido valido.');
  }
  if (!cryptoApi?.subtle?.digest) {
    throw new Error('Este equipo no puede generar la firma segura del archivo Excel.');
  }

  const digest = await cryptoApi.subtle.digest('SHA-256', buffer);
  return bytesToHex(new Uint8Array(digest));
};

export const buildExcelImportRowSignature = ({ fileFingerprint = '', rowNumber = '' } = {}) => {
  const safeFingerprint = String(fileFingerprint || '').trim().toLowerCase();
  const safeRowNumber = String(rowNumber ?? '').trim().replace(/\s+/g, '');
  if (!safeFingerprint || !safeRowNumber) return '';
  return `${EXCEL_IMPORT_SIGNATURE_VERSION}:${safeFingerprint}:${safeRowNumber}`;
};
