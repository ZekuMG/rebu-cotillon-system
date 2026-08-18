// Interpretación del estado de conexión que devuelve el bot para la bandeja.
//
// Dos aclaraciones que costaron caro y conviene no volver a perder:
//
// 1. En Baileys/Evolution el estado "connecting" significa que WhatsApp está
//    ESPERANDO que alguien escanee el QR, no que la vinculación ya haya
//    ocurrido. Tratarlo como éxito tapa el QR y deja la pantalla trabada.
// 2. El QR rota cada pocos segundos. La consulta periódica trae siempre el
//    vigente; un QR retenido de antes no se puede escanear.

const TRANSPORT_ISSUE_CODES = new Set([
  'bot_central_unreachable',
  'bot_request_timeout',
]);

const LINKED_STATES = ['open', 'connected'];

export const connectionStateName = (connectionInfo) => {
  const raw = connectionInfo?.state;
  const name = typeof raw === 'string'
    ? raw
    : raw?.instance?.state || raw?.state || '';
  return String(name || '').trim().toLowerCase();
};

export const qrImageSource = (connectionInfo) => {
  // Sólo `base64` es una imagen. `qr.code` es la cadena de emparejamiento
  // ("2@...") y usarla como src produce un recuadro roto que parece un QR
  // ilegible en vez de un error.
  const raw = String(
    connectionInfo?.qr?.base64
    || connectionInfo?.qr?.data?.base64
    || '',
  ).trim();
  if (!raw) return '';
  return raw.startsWith('data:') ? raw : `data:image/png;base64,${raw}`;
};

export const describeWhatsAppConnection = ({
  connectionInfo = null,
  connectionIssue = null,
} = {}) => {
  const stateName = connectionStateName(connectionInfo);
  const connected = connectionInfo?.connected === true
    || LINKED_STATES.includes(stateName);

  if (connected) {
    return {
      status: 'connected',
      stateName,
      qrSource: '',
      code: null,
      title: 'WhatsApp conectado',
      detail: '',
    };
  }

  const transportCode = String(connectionIssue?.code || '').trim();
  if (TRANSPORT_ISSUE_CODES.has(transportCode)) {
    return {
      status: 'unreachable',
      stateName,
      qrSource: '',
      code: transportCode,
      title: 'No se puede llegar a la PC central',
      detail: connectionIssue?.message
        || 'Abrí Tailscale en esta PC e ingresá a la misma red de la central.',
    };
  }

  if (connectionInfo?.evolution_available === false) {
    return {
      status: 'service_down',
      stateName,
      qrSource: '',
      code: String(connectionInfo?.evolution_error || 'evolution_unreachable'),
      title: 'El servicio de WhatsApp está caído en esta PC',
      detail: 'Docker dejó de responder en la central. Levantá el stack '
        + '(npm run stack:up) y el QR vuelve solo.',
    };
  }

  const qrSource = qrImageSource(connectionInfo);
  if (qrSource) {
    return {
      status: 'qr',
      stateName,
      qrSource,
      code: null,
      title: 'WhatsApp desconectado',
      detail: 'Escaneá este código con el celular: WhatsApp, Dispositivos '
        + 'vinculados, Vincular un dispositivo. El código se renueva solo.',
    };
  }

  return {
    status: 'waiting',
    stateName,
    qrSource: '',
    code: transportCode || null,
    title: 'WhatsApp desconectado',
    detail: 'Pidiendo un código nuevo a WhatsApp...',
  };
};
