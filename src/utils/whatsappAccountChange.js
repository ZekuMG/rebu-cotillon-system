// Aviso de cambio de número vinculado.
//
// La bandeja ahora filtra por el número que está vinculado. Sin este cartel, el
// día que se cambia de número la bandeja aparece vacía y parece que se
// perdieron las conversaciones — cuando en realidad son de la otra cuenta y
// están guardadas.

export const ACCOUNT_STORAGE_KEY = 'rebu_wa_last_account';

// Deja ver los últimos 4 dígitos: alcanza para reconocer el número sin
// exponerlo entero en una pantalla que puede estar a la vista del público.
export const shortAccount = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  return `…${digits.slice(-4)}`;
};

export const describeAccountChange = ({ current, previous } = {}) => {
  const now = String(current || '').replace(/\D/g, '');
  const before = String(previous || '').replace(/\D/g, '');

  // Sin número actual no hay nada que decir; sin anterior es la primera vez que
  // se mira, y avisar de un "cambio" que nadie hizo solo confunde.
  if (!now || !before || now === before) return null;

  return {
    previous: before,
    current: now,
    title: 'Vinculaste otro número de WhatsApp',
    detail: `Estás en ${shortAccount(now)}. Las conversaciones de ${shortAccount(before)} quedaron guardadas y no se muestran acá.`,
  };
};

export const readStoredAccount = (storage) => {
  try {
    return storage?.getItem?.(ACCOUNT_STORAGE_KEY) || '';
  } catch {
    return '';
  }
};

export const writeStoredAccount = (storage, value) => {
  try {
    const digits = String(value || '').replace(/\D/g, '');
    if (digits) storage?.setItem?.(ACCOUNT_STORAGE_KEY, digits);
  } catch {
    // Sin almacenamiento el aviso simplemente no aparece. No vale romper la
    // bandeja por no poder guardar una preferencia.
  }
};
