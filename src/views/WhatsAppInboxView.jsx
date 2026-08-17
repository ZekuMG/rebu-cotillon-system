import React, {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import Swal from 'sweetalert2';
import {
  AlertCircle,
  Archive,
  Bot,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  CreditCard,
  Download,
  File,
  FileAudio,
  FileText,
  FileVideo,
  FlaskConical,
  Forward,
  Hand,
  Image as ImageIcon,
  Info,
  Laptop,
  Loader2,
  LockKeyhole,
  Mail,
  MessageCircle,
  Mic2,
  MoreVertical,
  Paperclip,
  Pause,
  Pencil,
  Phone,
  Play,
  Power,
  RefreshCw,
  Search,
  Send,
  Settings2,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  UserRound,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { whatsappOperator } from '../utils/whatsappOperator';
import {
  claimCentralMachineForDevice,
  reconcileCentralOverride,
} from '../utils/whatsappCentralMachine';
import { describeWhatsAppConnection } from '../utils/whatsappConnection';
import {
  compareConversationActivity,
  compareConversationAttention,
} from '../utils/whatsappConversationOrder';
import {
  groupMessagesForDisplay,
  WHATSAPP_TIME_ZONE,
  withDaySeparators,
} from '../utils/whatsappMessageGroups';
import WhatsAppBotSettingsPanel from '../components/WhatsAppBotSettingsPanel';
import { whatsappDeviceAccess } from '../utils/whatsappDeviceAccess';
import { qrFreshness, shouldDropStaleQr } from '../utils/qrFreshness';
import './WhatsAppInboxView.css';

const MODES = [
  ['shadow', 'Solo observar', 'Analiza los mensajes y muestra sugerencias, pero no envía respuestas por su cuenta.'],
  ['copilot', 'Ayuda para responder', 'Prepara respuestas y una persona decide cuál enviar.'],
  ['auto', 'Respuestas automáticas', 'Responde por su cuenta únicamente consultas simples y autorizadas.'],
];

const FILTERS = [
  {
    id: 'all',
    label: 'Todos',
    description: 'Muestra todas las conversaciones, tengan o no acciones pendientes.',
    empty: 'Todavía no hay conversaciones registradas.',
  },
  {
    id: 'attention',
    label: 'Por atender',
    description: 'Reúne chats sin leer, respuestas pendientes, presupuestos y mensajes que no se enviaron.',
    empty: 'No hay conversaciones que necesiten atención.',
  },
  {
    id: 'unread',
    label: 'Sin leer',
    description: 'Muestra conversaciones con mensajes nuevos que todavía nadie abrió.',
    empty: 'Todos los mensajes fueron leídos.',
  },
  {
    id: 'budgets',
    label: 'Presupuestos',
    description: 'Muestra chats con presupuestos pendientes de revisión o corrección.',
    empty: 'No hay presupuestos pendientes de revisión.',
  },
  {
    id: 'failed',
    label: 'No enviados',
    description: 'Muestra mensajes que no pudieron enviarse y necesitan revisión.',
    empty: 'No hay mensajes sin enviar pendientes.',
  },
];

const SOUND_MUTED_KEY = 'rebu_whatsapp_sound_muted_v1';
const APPEARANCE_KEY = 'rebu_whatsapp_appearance_v1';
const DEFAULT_APPEARANCE = {
  density: 'compact',
  messageSize: 14,
};
const MESSAGE_SIZES = [12, 14, 16];
const ATTACHMENT_CACHE_MAX_BYTES = 48 * 1024 * 1024;
const ATTACHMENT_CACHE_MAX_ENTRIES = 80;
const attachmentDataCache = new Map();
const attachmentRequestCache = new Map();
let attachmentDataCacheBytes = 0;

const ERROR_COPY = {
  pending_budget: 'Esta conversación tiene un presupuesto pendiente. Resolvelo antes de archivarla.',
  failed_message: 'Esta conversación tiene un envío fallido. Revisalo antes de archivarla.',
  conversation_missing: 'La conversación ya no está disponible.',
  conversation_archive_unavailable: 'No se pudo archivar la conversación.',
  conversation_delete_unavailable: 'No se pudo eliminar la conversación.',
  confirmation_required: 'Escribí ELIMINAR para confirmar la eliminación definitiva.',
  authentication_required: 'Tu sesión venció. Cerrá sesión e ingresá nuevamente.',
  rebu_user_not_authorized: 'Tu cuenta no tiene acceso a WhatsApp en Rebu.',
  permission_denied: 'No tenés permiso para realizar esta acción.',
  operator_auth_not_configured: 'WhatsApp todavía no está listo en este equipo. Pedile ayuda a Sistema.',
  customer_window_expired: 'Pasó demasiado tiempo desde el último mensaje del cliente. Esperá un nuevo mensaje para responder.',
  contact_opted_out: 'El contacto pidió no recibir mensajes.',
  ambiguous_send: 'No pudimos confirmar si el mensaje salió. Revisá el chat antes de volver a intentarlo.',
  message_not_retryable: 'No es seguro enviar este mensaje otra vez. Revisá el chat antes de continuar.',
  message_not_editable: 'WhatsApp ya no permite editar este mensaje o el mensaje contiene un archivo.',
  message_not_deletable: 'WhatsApp no permite eliminar este mensaje para todos.',
  message_not_replyable: 'Sólo se pueden generar respuestas para mensajes recibidos del cliente.',
  mutation_in_progress: 'Otra acción sobre este mensaje todavía está en curso.',
  message_mutation_ambiguous: 'No pudimos confirmar el resultado en WhatsApp. Revisá el teléfono antes de repetir la acción.',
  message_mutation_unavailable: 'WhatsApp realizó la acción, pero Rebu no pudo actualizar el historial. Actualizá la conversación.',
  locked_by_other: 'Otra persona está respondiendo esta conversación.',
  attachment_too_large: 'El archivo supera el límite de 15 MB.',
  unsupported_attachment_type: 'Ese tipo de archivo no está permitido.',
  attachment_unavailable: 'El archivo no está disponible en esta PC.',
  invalid_connection_action: 'No se pudo realizar esa acción con WhatsApp.',
  invalid_central_machine: 'No pudimos identificar esta PC. Reiniciá Rebu e intentá nuevamente.',
  local_whatsapp_service_unavailable: 'El servidor local de WhatsApp todavía no está listo en esta PC.',
  central_machine_changed: 'Otra PC cambió la central de WhatsApp. Actualizá el estado antes de continuar.',
  central_machine_unavailable: 'No se pudo guardar la máquina central en este momento.',
  central_machine_inactive: 'Esta PC perdió el pulso central y ya no puede enviar mensajes. Actualizá el estado.',
  central_whatsapp_disconnected: 'Conectá WhatsApp en esta PC antes de establecerla como central.',
  central_machine_local_reset_failed: 'La transferencia falló y Rebu no pudo restaurar el servidor remoto. Reiniciá la app antes de volver a intentar.',
  central_machine_local_restore_failed: 'Esta PC figura como central, pero no pudo restaurar su ruta local. Reiniciá Rebu.',
  quick_replies_unavailable: 'Las respuestas rápidas no están disponibles en este momento.',
  test_mode_other_phone: 'Modo test está activo. Sólo podés responder en la conversación autorizada.',
  invalid_suggestion_output: 'No pudimos preparar respuestas claras. Intentá generarlas nuevamente.',
  bot_request_timeout: 'WhatsApp tardó demasiado en responder. Intentá nuevamente.',
  bot_central_unreachable: 'No pudimos llegar a la PC central. Abrí Tailscale en esta PC y comprobá que figure conectada.',
  whatsapp_device_not_authorized: 'Esta PC todavía no está habilitada para usar WhatsApp.',
  operator_request_failed: 'No se pudo comunicar con WhatsApp. Intentá nuevamente.',
  invalid_cursor: 'La lista cambió mientras la estabas viendo. Actualizala para continuar.',
};

const errorCopy = (error) => {
  if (ERROR_COPY[error?.code]) return ERROR_COPY[error.code];
  const message = String(error?.message || '').trim();
  if (/^(?:No |El |La |Tu |Ese |Este |Abrí |Otra |WhatsApp )/.test(message)) return message;
  return 'No se pudo completar la acción. Intentá nuevamente.';
};

const cachedAttachment = (id) => {
  const key = String(id || '');
  const entry = attachmentDataCache.get(key);
  if (!entry) return null;
  attachmentDataCache.delete(key);
  attachmentDataCache.set(key, entry);
  return entry.data;
};

const rememberAttachment = (id, data) => {
  const key = String(id || '');
  const sizeBytes = Math.max(0, Number(data?.sizeBytes || 0));
  if (!key || !data || sizeBytes > ATTACHMENT_CACHE_MAX_BYTES) return data;
  const previous = attachmentDataCache.get(key);
  if (previous) attachmentDataCacheBytes -= previous.sizeBytes;
  attachmentDataCache.delete(key);
  attachmentDataCache.set(key, { data, sizeBytes });
  attachmentDataCacheBytes += sizeBytes;
  while (
    (
      attachmentDataCacheBytes > ATTACHMENT_CACHE_MAX_BYTES
      || attachmentDataCache.size > ATTACHMENT_CACHE_MAX_ENTRIES
    )
    && attachmentDataCache.size > 1
  ) {
    const oldestKey = attachmentDataCache.keys().next().value;
    const oldest = attachmentDataCache.get(oldestKey);
    attachmentDataCache.delete(oldestKey);
    attachmentDataCacheBytes -= oldest?.sizeBytes || 0;
  }
  attachmentDataCacheBytes = Math.max(0, attachmentDataCacheBytes);
  return data;
};

const fetchAttachmentOnce = async (id) => {
  const cached = cachedAttachment(id);
  if (cached) return cached;
  const key = String(id || '');
  if (attachmentRequestCache.has(key)) return attachmentRequestCache.get(key);
  const request = whatsappOperator.attachment(id)
    .then((data) => rememberAttachment(id, data))
    .finally(() => attachmentRequestCache.delete(key));
  attachmentRequestCache.set(key, request);
  return request;
};

const connectionStateCopy = (value) => {
  const state = String(value || '').trim().toLowerCase();
  if (['open', 'connected'].includes(state)) return 'WhatsApp está listo';
  if (['connecting', 'opening'].includes(state)) return 'Conectando con WhatsApp…';
  if (['close', 'closed', 'disconnected'].includes(state)) return 'WhatsApp está desconectado';
  if (['qr', 'qrcode'].includes(state)) return 'Esperando que vincules el teléfono';
  return 'No pudimos confirmar el estado';
};

const handoffCopy = (value) => {
  const summary = String(value || '').trim();
  if (!summary) return 'Esta conversación necesita que una persona la continúe.';
  if (/^La intención .* requiere revisión humana\.?$/i.test(summary)) {
    return 'La consulta necesita que una persona la revise antes de responder.';
  }
  if (/^Evolution rechazó el envío/i.test(summary)) {
    return 'WhatsApp no pudo enviar la respuesta. Revisá el mensaje antes de intentarlo nuevamente.';
  }
  if (/^La respuesta automática quedó obsoleta/i.test(summary)) {
    return 'Pasó demasiado tiempo para responder automáticamente. Una persona debe continuar la conversación.';
  }
  if (/^Faltan datos comerciales publicados/i.test(summary)) {
    return 'Falta completar información del negocio para que el bot pueda responder esta consulta.';
  }
  if (/^Revisión necesaria \([^)]*\):/i.test(summary)) {
    return summary.replace(/^Revisión necesaria \([^)]*\):\s*/i, 'Mensaje para revisar: ');
  }
  if (/^Cliente:/i.test(summary)) return summary.replace(/^Cliente:/i, 'Mensaje del cliente:');
  return summary;
};

const contactName = (row) => (
  row?.customer_name?.trim() || `Contacto ${String(row?.phone || '').slice(-4)}`
);

const normalizePhone = (value) => String(value || '').replace(/\D/g, '');

const phoneMatchParts = (value) => {
  const digits = normalizePhone(value);
  if (!digits) return { full: '', national: '', subscriber: '' };
  let national = digits;
  if (national.startsWith('549') && national.length >= 13) national = national.slice(3);
  else if (national.startsWith('54') && national.length >= 12) national = national.slice(2);
  else if (national.startsWith('0') && national.length >= 11) national = national.slice(1);
  if (national.length > 10) national = national.slice(-10);
  return {
    full: digits,
    national,
    subscriber: national.length >= 8 ? national.slice(-8) : '',
  };
};

const linkedMembersForPhone = (members, phone) => {
  const target = phoneMatchParts(phone);
  if (!target.full) return [];
  const scored = (members || []).map((member) => {
    const candidate = phoneMatchParts(
      member.phone || member.phoneNumber || member.telephone || member.customer_phone,
    );
    const score = candidate.full && candidate.full === target.full ? 3
      : candidate.national.length >= 10 && candidate.national === target.national ? 2
        : candidate.subscriber && candidate.subscriber === target.subscriber ? 1 : 0;
    return { member, score };
  }).filter(({ score }) => score > 0);
  const bestScore = Math.max(0, ...scored.map(({ score }) => score));
  return scored.filter(({ score }) => score === bestScore).map(({ member }) => member);
};

const isTestConversation = (row) => row?.latest_message?.metadata?.test_fixture === true;

const responderFor = (row) => {
  const message = row?.latest_message;
  if (isTestConversation(row)) {
    return { label: 'Prueba', tone: 'test', Icon: Info };
  }
  if (!message || message.direction !== 'outbound') {
    return { label: 'Sin responder', tone: 'unanswered', Icon: Clock3 };
  }
  const actorName = String(message.metadata?.operator?.actor_name || '').trim();
  if (actorName) return { label: actorName, tone: 'human', Icon: UserRound };
  if (message.metadata?.origin === 'linked_whatsapp') {
    return { label: 'Teléfono', tone: 'phone', Icon: Phone };
  }
  return { label: 'Bot', tone: 'bot', Icon: Bot };
};

const formatPhone = (value) => {
  const phone = normalizePhone(value);
  return phone.startsWith('549') && phone.length >= 12
    ? `+54 9 ${phone.slice(3, 5)} ${phone.slice(5, 9)}-${phone.slice(9)}`
    : phone ? `+${phone}` : 'Sin teléfono';
};

const formatAt = (value, timeOnly = false) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('es-AR', timeOnly
    ? { timeZone: WHATSAPP_TIME_ZONE, hour: '2-digit', minute: '2-digit' }
    : {
      timeZone: WHATSAPP_TIME_ZONE,
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
};

const formatMoney = (value) => new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 2,
}).format(Number(value || 0));

const waiting = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  if (minutes < 1) return 'ahora';
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} h`;
  return `${Math.floor(minutes / 1440)} d`;
};

const statusFor = (row) => {
  if (row?.opted_out || row?.status === 'paused') {
    return { label: 'Respuestas pausadas', tone: 'paused', Icon: ShieldAlert };
  }
  if (row?.status === 'human') return { label: 'Atención manual', tone: 'human', Icon: Hand };
  return { label: 'Bot', tone: 'bot', Icon: Bot };
};

const fileToBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.addEventListener('load', () => {
    const result = String(reader.result || '');
    resolve(result.includes(',') ? result.slice(result.indexOf(',') + 1) : result);
  }, { once: true });
  reader.addEventListener('error', () => reject(reader.error || new Error('No se pudo leer el archivo.')), {
    once: true,
  });
  reader.readAsDataURL(file);
});

const contactInitial = (row) => {
  const name = contactName(row).trim();
  if (!name) return '?';
  if (typeof Intl?.Segmenter === 'function') {
    const iterator = new Intl.Segmenter('es', { granularity: 'grapheme' })
      .segment(name)[Symbol.iterator]();
    return String(iterator.next().value?.segment || '?').toUpperCase();
  }
  return String(Array.from(name)[0] || '?').toUpperCase();
};

function Avatar({ row, url, className = '', memberMatchCount = 0 }) {
  const [failed, setFailed] = useState(false);
  const normalizedMemberMatchCount = Math.max(0, Number(memberMatchCount || 0));
  const memberState = normalizedMemberMatchCount === 1
    ? { label: 'Socio de Rebu', tone: 'linked', Icon: Check }
    : normalizedMemberMatchCount > 1
      ? { label: 'Varios socios usan este teléfono', tone: 'ambiguous', Icon: AlertCircle }
      : null;

  useEffect(() => {
    setFailed(false);
  }, [url]);

  return (
    <span className={`wa-avatar-shell ${className}`}>
      <span
        className={`wa-avatar ${className}`}
        title={url ? contactName(row) : 'WhatsApp no compartió una foto para este contacto'}
      >
        {url && !failed ? (
          <img
            src={url}
            alt=""
            referrerPolicy="no-referrer"
            onError={() => setFailed(true)}
          />
        ) : contactInitial(row)}
      </span>
      {memberState && (
        <span
          className={`wa-member-indicator ${memberState.tone}`}
          role="img"
          aria-label={memberState.label}
          title={memberState.label}
        ><memberState.Icon /></span>
      )}
    </span>
  );
}

function LoadingState({ title, detail }) {
  return (
    <div className="wa-loading-state" role="status" aria-live="polite">
      <span className="wa-loading-state-icon"><Loader2 className="animate-spin" /></span>
      <strong>{title}</strong>
      <small>{detail}</small>
    </div>
  );
}

function DeliveryState({ row }) {
  if (row.status === 'deleted') {
    return <span className="wa-delivery-state deleted" title="Eliminado" aria-label="Eliminado"><Trash2 size={14} /><span>Eliminado</span></span>;
  }
  if (row.direction === 'inbound') {
    return <span className="wa-delivery-state received" title="Recibido" aria-label="Recibido"><Check size={14} /><span>Recibido</span></span>;
  }
  const providerState = String(row.provider_status || '').toLowerCase();
  const state = ['pending', 'sent', 'delivered', 'read', 'failed'].includes(providerState)
    ? providerState
    : (row.status === 'sent' ? 'sent' : row.status);
  if (state === 'read') return <span className="wa-delivery-state read" title="Leído" aria-label="Leído"><CheckCheck size={14} /><span>Leído</span></span>;
  if (state === 'delivered') return <span className="wa-delivery-state delivered" title="Entregado" aria-label="Entregado"><CheckCheck size={14} /><span>Entregado</span></span>;
  if (state === 'sent') return <span className="wa-delivery-state sent" title="Enviado" aria-label="Enviado"><Check size={14} /><span>Enviado</span></span>;
  if (state === 'failed') return <span className="wa-delivery-state failed" title="No se envió" aria-label="No se envió"><AlertCircle size={14} /><span>No se envió</span></span>;
  if (row.status === 'suggested') return <span className="wa-delivery-state suggested" title="No enviado" aria-label="No enviado"><Sparkles size={14} /><span>No enviado</span></span>;
  return <span className="wa-delivery-state pending" title="Enviando" aria-label="Enviando"><Clock3 size={14} /><span>Enviando</span></span>;
}

const messageStateLabel = (row) => {
  if (row?.status === 'deleted') return 'Eliminado para todos';
  if (row?.direction === 'inbound') return 'Recibido';
  const providerState = String(row?.provider_status || '').toLowerCase();
  if (providerState === 'read') return 'Leído';
  if (providerState === 'delivered') return 'Entregado';
  if (providerState === 'sent' || row?.status === 'sent') return 'Enviado';
  if (providerState === 'failed' || row?.status === 'failed') return 'No se envió';
  if (row?.status === 'suggested') return 'Sugerencia sin enviar';
  return 'Procesando';
};

const messageSenderLabel = (row, customerName = '') => {
  if (row?.direction === 'inbound') return customerName || 'Cliente';
  const actorName = String(row?.metadata?.operator?.actor_name || '').trim();
  if (actorName) return actorName;
  if (row?.metadata?.origin === 'linked_whatsapp') return 'Teléfono vinculado';
  return row?.role === 'assistant' ? 'Bot' : 'Sistema';
};

const messageOriginLabel = (row) => {
  if (row?.metadata?.test_fixture === true) return 'Conversación de prueba';
  if (row?.direction === 'inbound') return 'WhatsApp del cliente';
  if (row?.metadata?.origin === 'linked_whatsapp') return 'Teléfono vinculado';
  if (row?.metadata?.operator?.actor_name) return 'Rebu';
  return 'Bot de Rebu';
};

const messageKindLabel = (row) => ({
  text: 'Texto',
  image: 'Imagen',
  audio: 'Audio',
  video: 'Video',
  document: 'Documento',
  sticker: 'Sticker',
  reaction: 'Reacción',
}[String(row?.message_kind || '').toLowerCase()] || 'Mensaje');

function MessageDialogShell({ title, icon, onClose, className = '', children }) {
  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  return (
    <div className="wa-message-dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.currentTarget === event.target) onClose();
    }}>
      <section className={`wa-message-dialog ${className}`} role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <span>{icon}<strong>{title}</strong></span>
          <button type="button" onClick={onClose} aria-label={`Cerrar ${title.toLowerCase()}`}><X /></button>
        </header>
        {children}
      </section>
    </div>
  );
}

function MessageInfoDialog({ row, customerName, onClose }) {
  const mutations = Array.isArray(row?.metadata?.message_mutations)
    ? row.metadata.message_mutations
    : [];
  const edits = mutations.filter((entry) => entry?.action === 'edit').length;
  const deletion = [...mutations].reverse().find((entry) => entry?.action === 'delete');
  return (
    <MessageDialogShell title="Información del mensaje" icon={<Info />} onClose={onClose} className="wa-message-info-dialog">
      <dl>
        <div><dt>Enviado por</dt><dd>{messageSenderLabel(row, customerName)}</dd></div>
        <div><dt>Origen</dt><dd>{messageOriginLabel(row)}</dd></div>
        <div><dt>Estado</dt><dd>{messageStateLabel(row)}</dd></div>
        <div><dt>Fecha y hora</dt><dd>{formatAt(row?.created_at)}</dd></div>
        <div><dt>Tipo</dt><dd>{messageKindLabel(row)}</dd></div>
        <div><dt>Identificador</dt><dd>#{row?.id}</dd></div>
        {edits > 0 && <div><dt>Ediciones</dt><dd>{edits}</dd></div>}
        {deletion && <div><dt>Eliminado por</dt><dd>{deletion.actor_name || 'Sistema'}</dd></div>}
      </dl>
      {row?.delivery_updated_at && (
        <small>Última confirmación de WhatsApp: {formatAt(row.delivery_updated_at)}</small>
      )}
    </MessageDialogShell>
  );
}

function EditMessageDialog({ row, busy, onConfirm, onClose }) {
  const [value, setValue] = useState(String(row?.content || ''));
  const unchanged = value.trim() === String(row?.content || '').trim();
  return (
    <MessageDialogShell title="Editar mensaje" icon={<Pencil />} onClose={onClose}>
      <p>El cambio también se aplicará en WhatsApp. Sólo se pueden editar mensajes de texto enviados por este número.</p>
      <textarea
        value={value}
        maxLength={4000}
        autoFocus
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && value.trim() && !unchanged) {
            onConfirm(value.trim());
          }
        }}
      />
      <footer>
        <small>{value.length}/4000 · Ctrl + Enter para guardar</small>
        <span>
          <button type="button" className="wa-secondary-action" onClick={onClose}>Cancelar</button>
          <button
            type="button"
            className="wa-primary-action"
            disabled={busy || !value.trim() || unchanged}
            onClick={() => onConfirm(value.trim())}
          >
            {busy ? <Loader2 className="animate-spin" /> : <Check />}Guardar cambio
          </button>
        </span>
      </footer>
    </MessageDialogShell>
  );
}

function DeleteMessageDialog({ busy, onConfirm, onClose }) {
  return (
    <MessageDialogShell title="Eliminar mensaje" icon={<Trash2 />} onClose={onClose} className="danger">
      <p>Se eliminará para todos en WhatsApp. Rebu conservará únicamente el registro de auditoría de la acción.</p>
      <footer>
        <span>
          <button type="button" className="wa-secondary-action" onClick={onClose}>Cancelar</button>
          <button type="button" className="wa-danger-action" disabled={busy} onClick={onConfirm}>
            {busy ? <Loader2 className="animate-spin" /> : <Trash2 />}Eliminar para todos
          </button>
        </span>
      </footer>
    </MessageDialogShell>
  );
}

function ArchiveConversationDialog({ customerName, busy, onConfirm, onClose }) {
  return (
    <MessageDialogShell title="Archivar conversación" icon={<Archive />} onClose={onClose}>
      <p>
        {customerName} dejará de aparecer en la bandeja. Los mensajes y archivos se conservan,
        y la conversación volverá a mostrarse automáticamente si el cliente escribe nuevamente.
      </p>
      <footer>
        <span>
          <button type="button" className="wa-secondary-action" onClick={onClose}>Cancelar</button>
          <button type="button" className="wa-primary-action" disabled={busy} onClick={onConfirm}>
            {busy ? <Loader2 className="animate-spin" /> : <Archive />}Archivar
          </button>
        </span>
      </footer>
    </MessageDialogShell>
  );
}

function DeleteConversationDialog({ customerName, phone, busy, onConfirm, onClose }) {
  const [confirmation, setConfirmation] = useState('');
  const confirmed = confirmation.trim().toUpperCase() === 'ELIMINAR';
  return (
    <MessageDialogShell title="Eliminar conversación definitivamente" icon={<Trash2 />} onClose={onClose} className="danger">
      <p>
        Se eliminarán de Rebu la conversación de {customerName}, sus mensajes y sus archivos locales.
        El chat seguirá existiendo en el teléfono vinculado. Esta acción no se puede deshacer.
      </p>
      <label className="wa-destructive-confirmation">
        <span>Para confirmar, escribí <strong>ELIMINAR</strong></span>
        <input
          autoFocus
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          placeholder="ELIMINAR"
          aria-label={`Confirmar eliminación de ${customerName}, ${phone}`}
        />
      </label>
      <footer>
        <span>
          <button type="button" className="wa-secondary-action" onClick={onClose}>Cancelar</button>
          <button type="button" className="wa-danger-action" disabled={busy || !confirmed} onClick={() => onConfirm('ELIMINAR')}>
            {busy ? <Loader2 className="animate-spin" /> : <Trash2 />}Eliminar definitivamente
          </button>
        </span>
      </footer>
    </MessageDialogShell>
  );
}

const formatFileSize = (value) => {
  const bytes = Math.max(0, Number(value || 0));
  if (bytes < 1024) return `${Math.max(1, Math.round(bytes))} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
};

const formatMediaTime = (value) => {
  const seconds = Math.max(0, Math.floor(Number(value) || 0));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

const attachmentKindForView = (attachment) => {
  const mime = String(attachment?.mime_type || '').toLowerCase().split(';')[0];
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return 'video';
  return attachment?.media_kind || 'document';
};

const isPdfAttachment = (attachment) => (
  String(attachment?.mime_type || '').toLowerCase().split(';')[0] === 'application/pdf'
  || /\.pdf$/i.test(String(attachment?.file_name || ''))
);

function DocumentViewer({
  attachment,
  data,
  onClose,
}) {
  const closeButtonRef = useRef(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus?.();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const fileName = data?.fileName || attachment.file_name || 'Documento.pdf';
  return (
    <div
      className="wa-document-viewer"
      role="dialog"
      aria-modal="true"
      aria-label={`Visor de PDF: ${fileName}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <header className="wa-document-viewer-toolbar">
        <span>
          <FileText />
          <span>
            <strong>{fileName}</strong>
            <small>PDF · {formatFileSize(data?.sizeBytes || attachment.size_bytes)}</small>
          </span>
        </span>
        <nav>
          <a
            href={data.dataUrl}
            download={fileName}
            aria-label={`Descargar ${fileName}`}
            title="Descargar PDF"
          >
            <Download />
          </a>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Cerrar visor de PDF"
            title="Cerrar (Esc)"
          >
            <X />
          </button>
        </nav>
      </header>
      <div className="wa-document-viewer-stage">
        <iframe src={data.dataUrl} title={fileName} />
      </div>
    </div>
  );
}

function ImageGallery({
  items,
  initialId,
  initialData,
  onClose,
}) {
  const closeButtonRef = useRef(null);
  const requestRef = useRef(0);
  const cacheRef = useRef(new Map(
    initialData ? [[String(initialId), initialData]] : [],
  ));
  const [currentId, setCurrentId] = useState(String(initialId));
  const [currentData, setCurrentData] = useState(initialData || null);
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState('');
  const currentIndex = Math.max(
    0,
    items.findIndex((item) => String(item.id) === currentId),
  );
  const current = items[currentIndex];

  const move = useCallback((offset) => {
    const nextIndex = currentIndex + offset;
    if (nextIndex < 0 || nextIndex >= items.length) return;
    setCurrentId(String(items[nextIndex].id));
  }, [currentIndex, items]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus?.();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        move(-1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        move(1);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [move, onClose]);

  const loadCurrent = useCallback(async () => {
    if (!current) return;
    const requestId = ++requestRef.current;
    const key = String(current.id);
    const cached = cacheRef.current.get(key) || cachedAttachment(current.id);
    if (cached) {
      setCurrentData(cached);
      setLoading(false);
      setError('');
      return;
    }
    setCurrentData(null);
    setLoading(true);
    setError('');
    try {
      const data = await fetchAttachmentOnce(current.id);
      if (requestId !== requestRef.current) return;
      cacheRef.current.set(key, data);
      setCurrentData(data);
    } catch (requestError) {
      if (requestId === requestRef.current) setError(errorCopy(requestError));
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, [current]);

  useEffect(() => {
    void loadCurrent();
  }, [loadCurrent]);

  if (!current) return null;

  return (
    <div
      className="wa-image-gallery"
      role="dialog"
      aria-modal="true"
      aria-label="Visor de imágenes de la conversación"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <header className="wa-image-gallery-toolbar">
        <span>
          <strong>{current.caption || current.file_name || 'Imagen de la conversación'}</strong>
          <small>{currentIndex + 1} de {items.length}</small>
        </span>
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          aria-label="Cerrar visor de imágenes"
          title="Cerrar (Esc)"
        >
          <X />
        </button>
      </header>

      <button
        type="button"
        className="wa-image-gallery-nav previous"
        onClick={() => move(-1)}
        disabled={currentIndex === 0}
        aria-label="Ver imagen anterior"
        title="Imagen anterior"
      >
        <ChevronLeft />
      </button>

      <div
        className="wa-image-gallery-stage"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        {loading ? (
          <div className="wa-image-gallery-state">
            <Loader2 className="animate-spin" />
            <span>Preparando vista previa…</span>
          </div>
        ) : error ? (
          <div className="wa-image-gallery-state error">
            <AlertCircle />
            <span>{error}</span>
            <button type="button" onClick={() => void loadCurrent()}>Intentar nuevamente</button>
          </div>
        ) : (
          <img
            src={currentData?.dataUrl}
            alt={current.file_name || 'Imagen de la conversación'}
          />
        )}
      </div>

      <button
        type="button"
        className="wa-image-gallery-nav next"
        onClick={() => move(1)}
        disabled={currentIndex === items.length - 1}
        aria-label="Ver imagen siguiente"
        title="Imagen siguiente"
      >
        <ChevronRight />
      </button>
    </div>
  );
}

function VoiceNotePlayer({
  mediaRef,
  src,
  fileName,
  fileSize,
}) {
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  const togglePlayback = () => {
    const media = mediaRef.current;
    if (!media) return;
    if (media.paused) {
      media.play().catch(() => {});
    } else {
      media.pause();
    }
  };

  const changePlaybackRate = () => {
    const rates = [1, 1.5, 2];
    const nextRate = rates[(rates.indexOf(playbackRate) + 1) % rates.length];
    setPlaybackRate(nextRate);
    if (mediaRef.current) mediaRef.current.playbackRate = nextRate;
  };

  return (
    <div className="wa-voice-note">
      <audio
        ref={mediaRef}
        src={src}
        preload="metadata"
        aria-label={fileName}
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || 0)}
        onDurationChange={(event) => setDuration(event.currentTarget.duration || 0)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime || 0)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setCurrentTime(0);
        }}
      />
      <button
        type="button"
        className="wa-voice-play"
        onClick={togglePlayback}
        aria-label={playing ? 'Pausar mensaje de voz' : 'Reproducir mensaje de voz'}
        title={playing ? 'Pausar' : 'Reproducir'}
      >
        {playing ? <Pause /> : <Play />}
      </button>
      <div className="wa-voice-content">
        <span className="wa-voice-title">
          <Mic2 />
          <strong>Mensaje de voz</strong>
          <small>{fileSize}</small>
        </span>
        <input
          className="wa-voice-progress"
          type="range"
          min="0"
          max={duration || 0}
          step="0.05"
          value={Math.min(currentTime, duration || 0)}
          onChange={(event) => {
            const nextTime = Number(event.target.value);
            setCurrentTime(nextTime);
            if (mediaRef.current) mediaRef.current.currentTime = nextTime;
          }}
          aria-label="Posición del mensaje de voz"
          aria-valuetext={`${formatMediaTime(currentTime)} de ${formatMediaTime(duration)}`}
          style={{ '--wa-audio-progress': `${progress}%` }}
          disabled={!duration}
        />
        <span className="wa-voice-meta">
          <time>{formatMediaTime(currentTime)} / {formatMediaTime(duration)}</time>
          <button
            type="button"
            onClick={changePlaybackRate}
            aria-label={`Velocidad de reproducción ${playbackRate}x. Cambiar velocidad`}
            title="Cambiar velocidad"
          >
            {playbackRate}×
          </button>
        </span>
      </div>
      <a href={src} download={fileName} aria-label={`Descargar ${fileName}`} title="Descargar audio">
        <Download />
      </a>
    </div>
  );
}

function Attachment({
  attachment,
  hasCaption = false,
  onOpenImage,
  onOpenDocument,
}) {
  const [data, setData] = useState(() => cachedAttachment(attachment.id));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [autoPlayRequested, setAutoPlayRequested] = useState(false);
  const containerRef = useRef(null);
  const mediaRef = useRef(null);
  const kind = attachmentKindForView(attachment);
  const isImage = kind === 'image';
  const isAudio = kind === 'audio';
  const isVideo = kind === 'video';
  const isPdf = isPdfAttachment(attachment);
  const fileName = data?.fileName || attachment.file_name || (
    isAudio ? 'Mensaje de voz' : isVideo ? 'Video' : isPdf ? 'Documento.pdf' : 'Archivo'
  );
  const fileSize = formatFileSize(data?.sizeBytes || attachment.size_bytes);

  const load = useCallback(async () => {
    if (data) return data;
    if (loading) return null;
    setLoading(true);
    try {
      const result = await fetchAttachmentOnce(attachment.id);
      setData(result);
      setError('');
      return result;
    } catch (requestError) {
      setError(errorCopy(requestError));
      return null;
    } finally {
      setLoading(false);
    }
  }, [attachment.id, data, loading]);

  useEffect(() => {
    if (!data || !autoPlayRequested || !mediaRef.current) return;
    setAutoPlayRequested(false);
    const playback = mediaRef.current.play?.();
    playback?.catch?.(() => {
      // Si el navegador exige un segundo clic, los controles quedan disponibles.
    });
  }, [autoPlayRequested, data]);

  useEffect(() => {
    if (!isImage || data || loading || error) return undefined;
    const target = containerRef.current;
    if (!target || typeof IntersectionObserver !== 'function') {
      void load();
      return undefined;
    }
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      void load();
    }, { rootMargin: '180px 0px' });
    observer.observe(target);
    return () => observer.disconnect();
  }, [data, error, isImage, load, loading]);

  return (
    <div
      ref={containerRef}
      className={`wa-attachment ${kind} ${isImage ? `${hasCaption ? 'with-caption' : 'without-caption'}` : ''}`}
    >
      {data && isImage ? (
        <button
          type="button"
          className="wa-image-open"
          onClick={() => onOpenImage?.(attachment, data)}
          aria-label={`Abrir ${attachment.file_name || 'imagen'} en el visor`}
        >
          <img
            src={data.dataUrl}
            alt={attachment.file_name || 'Imagen recibida'}
            loading="lazy"
          />
          <span className="wa-image-open-hint"><ImageIcon />Abrir</span>
        </button>
      ) : isImage ? (
        <button
          type="button"
          className="wa-image-placeholder"
          onClick={async () => {
            const result = await load();
            if (result) onOpenImage?.(attachment, result);
          }}
          disabled={loading}
          aria-label={loading ? 'Cargando vista previa de la imagen' : 'Abrir imagen'}
        >
          {loading ? <Loader2 className="animate-spin" /> : <ImageIcon />}
          <span>{loading ? 'Preparando vista previa…' : 'Mostrar imagen'}</span>
        </button>
      ) : data && isAudio ? (
        <div className="wa-inline-media wa-audio-attachment">
          <VoiceNotePlayer
            mediaRef={mediaRef}
            src={data.dataUrl}
            fileName={fileName}
            fileSize={fileSize}
          />
        </div>
      ) : data && isVideo ? (
        <div className="wa-inline-media wa-video-attachment">
          <video
            ref={mediaRef}
            src={data.dataUrl}
            controls
            playsInline
            preload="metadata"
            aria-label={fileName}
          />
          <span className="wa-inline-media-meta">
            <span><FileVideo /><strong>{fileName}</strong><small>{fileSize}</small></span>
            <a href={data.dataUrl} download={fileName} aria-label={`Descargar ${fileName}`}><Download /></a>
          </span>
        </div>
      ) : isAudio || isVideo ? (
        <button
          type="button"
          className={`wa-media-loader ${kind}`}
          onClick={async () => {
            setAutoPlayRequested(true);
            await load();
          }}
          disabled={loading}
          aria-label={`${loading ? 'Cargando' : 'Reproducir'} ${isAudio ? 'audio' : 'video'}: ${fileName}`}
        >
          {loading ? <Loader2 className="animate-spin" /> : isAudio ? <FileAudio /> : <FileVideo />}
          <span>
            <strong>{loading ? `Preparando ${isAudio ? 'audio' : 'video'}…` : fileName}</strong>
            <small>
              {fileSize} · {loading
                ? 'Quedará disponible durante esta sesión'
                : isAudio ? 'Reproducir audio' : 'Reproducir video'}
            </small>
          </span>
        </button>
      ) : isPdf ? (
        <button
          type="button"
          className="wa-file-card pdf"
          onClick={async () => {
            const result = await load();
            if (result) onOpenDocument?.(attachment, result);
          }}
          disabled={loading}
          aria-label={`${loading ? 'Cargando' : 'Abrir'} PDF: ${fileName}`}
        >
          {loading ? <Loader2 className="animate-spin" /> : <FileText />}
          <span>
            <strong>{fileName}</strong>
            <small>{fileSize} · {loading ? 'Preparando vista previa…' : 'Ver PDF'}</small>
          </span>
        </button>
      ) : data ? (
        <a
          className="wa-file-card"
          href={data.dataUrl}
          download={fileName}
          aria-label={`Descargar ${fileName}`}
        >
          <File />
          <span><strong>{fileName}</strong><small>{fileSize} · Descargar</small></span>
          <Download />
        </a>
      ) : (
        <button type="button" className="wa-file-card" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="animate-spin" /> : <File />}
          <span>
            <strong>{fileName}</strong>
            <small>{fileSize} · {loading ? 'Preparando archivo…' : 'Descargar archivo'}</small>
          </span>
        </button>
      )}
      {error && <small className="wa-attachment-error">{error}</small>}
    </div>
  );
}

function Message({
  row,
  groupRows = [],
  canRetry,
  canMutate,
  canGenerate,
  menuOpen,
  onToggleMenu,
  onRetry,
  onEdit,
  onDelete,
  onInfo,
  onGenerateReply,
  onOpenImage,
  onOpenDocument,
}) {
  const rows = groupRows.length > 0 ? groupRows : [row];
  const displayRow = rows[0];
  const statusRow = rows.find((entry) => entry.status === 'failed') || rows.at(-1);
  const deleted = statusRow.status === 'deleted';
  const attachments = deleted ? [] : rows.flatMap((entry) => entry.attachments || []);
  const captions = deleted ? [] : [...new Set(rows
    .map((entry) => String(entry.content || '').trim())
    .filter((content) => (
      content
      && content !== '[Imagen]'
      && !/^\[Foto de .+\]$/i.test(content)
    )))];
  const inbound = displayRow.direction === 'inbound';
  const suggested = rows.some((entry) => entry.status === 'suggested');
  const hasCaption = captions.length > 0;
  const attachmentKinds = attachments.map(attachmentKindForView);
  const hasImage = attachmentKinds.includes('image');
  const imageAlbum = hasImage && attachments.filter(
    (attachment) => attachmentKindForView(attachment) === 'image',
  ).length > 1;
  const hasPlayableMedia = attachmentKinds.some((kind) => kind === 'audio' || kind === 'video');
  const hasDocument = attachmentKinds.includes('document');
  const retryable = statusRow.status === 'failed'
    && statusRow.attention_required
    && (statusRow.failure_class || statusRow.metadata?.operator_delivery?.failure_class) === 'definite';
  const editable = canMutate
    && rows.length === 1
    && !inbound
    && statusRow.status === 'sent'
    && Boolean(statusRow.provider_message_id)
    && statusRow.message_kind === 'text'
    && attachments.length === 0;
  const deletable = canMutate
    && rows.length === 1
    && !inbound
    && statusRow.status === 'sent'
    && Boolean(statusRow.provider_message_id);
  const replyable = canGenerate
    && rows.length === 1
    && inbound
    && Boolean(String(displayRow.content || '').trim());
  const handleMenuSelection = (event) => {
    const target = event.target instanceof Element ? event.target : event.target?.parentElement;
    const action = target?.closest?.('[data-message-action]')?.dataset?.messageAction;
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    if (action === 'generate') onGenerateReply(displayRow);
    if (action === 'edit') onEdit(displayRow);
    if (action === 'retry') onRetry(statusRow);
    if (action === 'info') onInfo(displayRow);
    if (action === 'delete') onDelete(displayRow);
  };
  const visibleAttachments = imageAlbum ? attachments.slice(0, 4) : attachments;
  const remainingImages = imageAlbum ? Math.max(0, attachments.length - visibleAttachments.length) : 0;
  const renderedAttachments = visibleAttachments.map((attachment, index) => (
    <div
      className="wa-image-album-item"
      key={`${displayRow.id}:${attachment.id || attachment.file_name || attachment.fileName || 'attachment'}:${index}`}
    >
      <Attachment
        attachment={attachment}
        hasCaption={hasCaption}
        onOpenImage={onOpenImage}
        onOpenDocument={onOpenDocument}
      />
      {remainingImages > 0 && index === visibleAttachments.length - 1 && (
        <span className="wa-image-album-more">+{remainingImages}</span>
      )}
    </div>
  ));
  return (
    <div className={`wa-message ${inbound ? 'inbound' : 'outbound'} ${menuOpen ? 'menu-open' : ''}`}>
      <article
        className={[
          suggested ? 'suggested' : '',
          statusRow.status === 'failed' ? 'failed' : '',
          hasImage ? 'has-image' : '',
          hasImage && !hasCaption ? 'image-without-caption' : '',
          imageAlbum ? 'image-album' : '',
          hasPlayableMedia ? 'has-playable-media' : '',
          hasDocument ? 'has-document' : '',
          deleted ? 'deleted' : '',
        ].filter(Boolean).join(' ')}
        onClick={(event) => {
          const target = event.target instanceof Element ? event.target : event.target?.parentElement;
          if (target?.closest?.('button, a, audio, video, input, textarea, [role="menu"]')) return;
          onToggleMenu(String(displayRow.id));
        }}
      >
        <div className="wa-message-menu">
          <button
            type="button"
            className="wa-message-menu-trigger"
            aria-label="Opciones del mensaje"
            aria-expanded={menuOpen}
            onClick={(event) => {
              event.stopPropagation();
              onToggleMenu(String(displayRow.id));
            }}
          >
            <ChevronDown />
          </button>
          {menuOpen && (
            <div className="wa-message-menu-popover" role="menu" onClickCapture={handleMenuSelection}>
              {replyable && (
                <button type="button" role="menuitem" data-message-action="generate">
                  <Sparkles />Generar respuesta
                </button>
              )}
              {editable && (
                <button type="button" role="menuitem" data-message-action="edit">
                  <Pencil />Editar mensaje
                </button>
              )}
              {retryable && canRetry && (
                <button type="button" role="menuitem" data-message-action="retry">
                  <Forward />Reenviar mensaje
                </button>
              )}
              <button type="button" role="menuitem" data-message-action="info">
                <Info />Información del mensaje
              </button>
              {deletable && (
                <button type="button" role="menuitem" className="danger" data-message-action="delete">
                  <Trash2 />Eliminar mensaje
                </button>
              )}
            </div>
          )}
        </div>
        {suggested && <small className="wa-message-kind"><Sparkles />Sugerencia</small>}
        {deleted && <p className="wa-deleted-message"><Trash2 />Este mensaje fue eliminado</p>}
        {imageAlbum ? (
          <div className={`wa-image-album-grid count-${Math.min(4, visibleAttachments.length)}`}>
            {renderedAttachments}
          </div>
        ) : renderedAttachments}
        {captions.map((caption) => <p key={caption}>{caption}</p>)}
        {!displayRow.content && attachments.length === 0 && <p>[{displayRow.message_kind || 'mensaje'}]</p>}
        <footer className={statusRow.status === 'failed' ? 'failed' : ''}>
          <time>{formatAt(statusRow.created_at, true)}</time>
          <span><DeliveryState row={statusRow} /></span>
        </footer>
      </article>
    </div>
  );
}

function SettingsPanel({ value, busy, onSave, onClose }) {
  const [draft, setDraft] = useState(() => ({
    hours: value?.hours?.summary || '',
    address: value?.address || '',
    paymentMethods: (value?.payment_methods || []).join(', '),
    pickup: value?.pickup || '',
    shipping: value?.shipping || '',
    policies: value?.policies || '',
  }));

  return (
    <section className="wa-context-card wa-settings-panel">
      <header>
        <span><Settings2 /><strong>Información que puede usar el bot</strong></span>
        <button type="button" onClick={onClose} aria-label="Cerrar configuración"><X /></button>
      </header>
      <label>Horarios<input value={draft.hours} onChange={(event) => setDraft({ ...draft, hours: event.target.value })} placeholder="Lunes a sábado de 9 a 18 h" /></label>
      <label>Dirección<input value={draft.address} onChange={(event) => setDraft({ ...draft, address: event.target.value })} /></label>
      <label>Medios de pago<input value={draft.paymentMethods} onChange={(event) => setDraft({ ...draft, paymentMethods: event.target.value })} placeholder="Efectivo, Débito, Mercado Pago" /></label>
      <label>Retiro<textarea value={draft.pickup} onChange={(event) => setDraft({ ...draft, pickup: event.target.value })} /></label>
      <label>Envíos<textarea value={draft.shipping} onChange={(event) => setDraft({ ...draft, shipping: event.target.value })} /></label>
      <label>Políticas<textarea value={draft.policies} onChange={(event) => setDraft({ ...draft, policies: event.target.value })} /></label>
      <button
        type="button"
        className="wa-primary-action"
        disabled={busy}
        onClick={() => onSave({
          hours: draft.hours.trim() ? { summary: draft.hours.trim() } : null,
          address: draft.address,
          payment_methods: draft.paymentMethods.split(',').map((entry) => entry.trim()).filter(Boolean),
          pickup: draft.pickup,
          shipping: draft.shipping,
          policies: draft.policies,
        })}
      >
        {busy ? <Loader2 className="animate-spin" /> : <Check />}Guardar información
      </button>
    </section>
  );
}

const budgetFormValue = (draft) => ({
  customer_name: draft.customer_name || '',
  customer_phone: draft.customer_phone || draft.phone || '',
  notes: draft.notes || '',
  items: Array.isArray(draft.items) ? draft.items : [],
});

function BudgetPanel({
  draft,
  inventory,
  members,
  busy,
  onApprove,
  onReject,
  onClose,
}) {
  const [value, setValue] = useState(() => budgetFormValue(draft));
  const [productQuery, setProductQuery] = useState('');

  useEffect(() => {
    setValue(budgetFormValue(draft));
  }, [draft]);

  const total = value.items.reduce((sum, item) => sum + (
    item.product_type === 'weight'
      ? Number(item.unit_price || 0) * Number(item.quantity || 0) / 1000
      : Number(item.unit_price || 0) * Number(item.quantity || 0)
  ), 0);
  const candidates = useMemo(() => {
    const query = productQuery.trim().toLowerCase();
    if (query.length < 2) return [];
    return (inventory || []).filter((product) => (
      `${product.title || ''} ${product.barcode || ''}`.toLowerCase().includes(query)
    )).slice(0, 6);
  }, [inventory, productQuery]);
  const linkedMemberMatches = linkedMembersForPhone(members, value.customer_phone);
  const linkedMember = linkedMemberMatches.length === 1 ? linkedMemberMatches[0] : null;

  const updateItem = (index, patch) => {
    setValue((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => (
        itemIndex === index ? { ...item, ...patch } : item
      )),
    }));
  };

  return (
    <section className="wa-context-card wa-budget-panel">
      <header>
        <span><CircleDollarSign /><strong>Presupuesto por revisar</strong></span>
        <button type="button" onClick={onClose} aria-label="Cerrar presupuesto"><X /></button>
      </header>
      <div className="wa-budget-customer">
        <label>Cliente<input value={value.customer_name} onChange={(event) => setValue({ ...value, customer_name: event.target.value })} /></label>
        <label>Teléfono<input value={value.customer_phone} onChange={(event) => setValue({ ...value, customer_phone: event.target.value })} /></label>
        <small>{linkedMember ? `Vinculado con ${linkedMember.name || linkedMember.displayName || 'socio de Rebu'}` : 'Se guardará como cliente invitado.'}</small>
      </div>
      <div className="wa-budget-items">
        {value.items.map((item, index) => (
          <div className="wa-budget-line" key={`${item.product_id || 'custom'}-${index}`}>
            <input className="title" value={item.title || ''} onChange={(event) => updateItem(index, { title: event.target.value })} aria-label="Producto" />
            <input type="number" min="0.001" step="0.001" value={item.quantity} onChange={(event) => updateItem(index, { quantity: Number(event.target.value) })} aria-label="Cantidad" />
            <input type="number" min="0" step="0.01" value={item.unit_price} onChange={(event) => updateItem(index, { unit_price: Number(event.target.value) })} aria-label="Precio" />
            <button type="button" onClick={() => setValue((current) => ({ ...current, items: current.items.filter((_, itemIndex) => itemIndex !== index) }))} aria-label="Quitar producto"><Trash2 /></button>
          </div>
        ))}
      </div>
      <div className="wa-budget-add">
        <input value={productQuery} onChange={(event) => setProductQuery(event.target.value)} placeholder="Agregar producto del catálogo" />
        {candidates.length > 0 && (
          <div>
            {candidates.map((product) => (
              <button
                type="button"
                key={product.id}
                onClick={() => {
                  setValue((current) => ({
                    ...current,
                    items: [...current.items, {
                      product_id: product.id,
                      title: product.title,
                      quantity: product.product_type === 'weight' ? 1000 : 1,
                      unit_price: Number(product.product_type === 'weight' ? product.price * 1000 : product.price) || 0,
                      product_type: product.product_type || 'quantity',
                    }],
                  }));
                  setProductQuery('');
                }}
              >
                <span>{product.title}</span><strong>{formatMoney(product.product_type === 'weight' ? product.price * 1000 : product.price)}</strong>
              </button>
            ))}
          </div>
        )}
      </div>
      <label>Observaciones<textarea value={value.notes} onChange={(event) => setValue({ ...value, notes: event.target.value })} /></label>
      <div className="wa-budget-total"><span>Total estimado</span><strong>{formatMoney(total)}</strong></div>
      <footer>
        <button type="button" className="wa-secondary-action" disabled={busy} onClick={() => onReject(draft)}>Rechazar</button>
        <button
          type="button"
          className="wa-primary-action"
          disabled={busy || value.items.length === 0 || !value.customer_phone}
          onClick={() => onApprove(draft, {
            ...value,
            memberId: linkedMember?.id || null,
            total,
          })}
        >
          {busy ? <Loader2 className="animate-spin" /> : <FileText />}Aprobar y enviar PDF
        </button>
      </footer>
    </section>
  );
}

function DeviceAccessGate({ access, error, busy, onRequest, onDownload, onRefresh }) {
  const status = String(access?.status || 'loading');
  const approved = status === 'approved' || access?.approved === true;
  const requested = ['pending', 'approved', 'rejected', 'revoked'].includes(status) || approved;
  const title = status === 'loading'
    ? 'Comprobando este dispositivo'
    : status === 'pending'
      ? 'Solicitud enviada a la PC central'
      : status === 'approved'
        ? 'Esta PC ya fue aprobada'
        : status === 'rejected'
          ? 'La solicitud no fue aprobada'
          : status === 'revoked'
            ? 'El acceso de esta PC fue revocado'
            : 'No estás habilitado para usar WhatsApp en este dispositivo';
  const copy = status === 'pending'
    ? 'Sistema verá el nombre de esta PC y podrá aprobarla desde la máquina central.'
    : status === 'approved'
      ? 'Descargá Tailscale, ingresá a la red de Rebu y la bandeja se conectará automáticamente.'
      : status === 'rejected'
        ? 'Podés volver a solicitar el acceso si necesitás usar esta computadora.'
        : status === 'revoked'
          ? 'Sistema debe aprobar nuevamente este dispositivo antes de conectarlo.'
          : status === 'loading'
            ? 'Rebu está validando la identidad local y su autorización.'
            : 'Solicitá acceso. No hace falta instalar Docker: el servicio permanece en la PC central.';

  return (
    <section className="wa-device-access-gate" aria-live="polite">
      <div className="wa-device-access-icon">{status === 'loading' ? <Loader2 className="animate-spin" /> : <LockKeyhole />}</div>
      <div className="wa-device-access-copy">
        <small>Acceso por dispositivo</small>
        <strong>{title}</strong>
        <p>{copy}</p>
        {error && <span className="wa-device-access-error"><AlertCircle />{error}</span>}
        {access?.device?.deviceName && <em>{access.device.deviceName} · {access.device.platform || 'Windows'}</em>}
      </div>
      <ol className="wa-device-access-route" aria-label="Progreso de acceso">
        <li className={requested ? 'done' : 'active'}><span>1</span><small>Solicitud</small></li>
        <li className={approved ? 'done' : requested ? 'active' : ''}><span>2</span><small>Aprobación</small></li>
        <li className={approved ? 'active' : ''}><span>3</span><small>Conexión</small></li>
      </ol>
      <div className="wa-device-access-actions">
        {approved ? (
          <>
            <button type="button" className="wa-primary-action" disabled={busy} onClick={onDownload}><Download />Descargar Tailscale</button>
            <button type="button" className="wa-secondary-action" disabled={busy} onClick={onRefresh}><RefreshCw />Comprobar conexión</button>
          </>
        ) : status === 'pending' || status === 'loading' ? (
          <button type="button" className="wa-secondary-action" disabled={busy || status === 'loading'} onClick={onRefresh}>
            {busy ? <Loader2 className="animate-spin" /> : <RefreshCw />}Actualizar estado
          </button>
        ) : (
          <button type="button" className="wa-primary-action" disabled={busy} onClick={onRequest}>
            {busy ? <Loader2 className="animate-spin" /> : <Laptop />}{busy ? 'Enviando…' : 'Solicitar acceso a la central'}
          </button>
        )}
      </div>
    </section>
  );
}

export default function WhatsAppInboxView({
  isActive = false,
  currentUser = null,
  inventory = [],
  members = [],
  onCreateBudget,
}) {
  const [overview, setOverview] = useState(null);
  const [phone, setPhone] = useState('');
  const [detail, setDetail] = useState(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedCatalogMedia, setSelectedCatalogMedia] = useState([]);
  const [pendingCatalogSend, setPendingCatalogSend] = useState(null);
  const [suggestion, setSuggestion] = useState('');
  const [quickReplies, setQuickReplies] = useState([]);
  const [quickRepliesLoading, setQuickRepliesLoading] = useState(false);
  const [quickRepliesError, setQuickRepliesError] = useState('');
  const [quickReplySourceId, setQuickReplySourceId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [contextMode, setContextMode] = useState('');
  const [businessSettings, setBusinessSettings] = useState(null);
  const [botSettings, setBotSettings] = useState(null);
  const [botSettingsOpen, setBotSettingsOpen] = useState(false);
  const [botSettingsLoading, setBotSettingsLoading] = useState(false);
  const [botSettingsLoadError, setBotSettingsLoadError] = useState(false);
  const [centralMachine, setCentralMachine] = useState(null);
  const [centralCandidate, setCentralCandidate] = useState(null);
  const [centralMachineLoading, setCentralMachineLoading] = useState(false);
  const [centralMachineActionError, setCentralMachineActionError] = useState('');
  const [connectionInfo, setConnectionInfo] = useState(null);
  const [connectionIssue, setConnectionIssue] = useState(null);
  const [deviceAccess, setDeviceAccess] = useState({ status: 'loading', approved: false, device: null });
  const [deviceAccessRequests, setDeviceAccessRequests] = useState([]);
  const [deviceAccessLoading, setDeviceAccessLoading] = useState(false);
  const [deviceAccessBusy, setDeviceAccessBusy] = useState('');
  const [deviceAccessError, setDeviceAccessError] = useState('');
  const [profiles, setProfiles] = useState({});
  const [mainMenuOpen, setMainMenuOpen] = useState(false);
  const [chatMenuOpen, setChatMenuOpen] = useState(false);
  const [messageMenuId, setMessageMenuId] = useState('');
  const [messageInfo, setMessageInfo] = useState(null);
  const [messageEdit, setMessageEdit] = useState(null);
  const [messageDelete, setMessageDelete] = useState(null);
  const [conversationArchive, setConversationArchive] = useState(null);
  const [conversationDelete, setConversationDelete] = useState(null);
  const [manualQuickReplyTarget, setManualQuickReplyTarget] = useState(null);
  const [imageGallery, setImageGallery] = useState(null);
  const [documentViewer, setDocumentViewer] = useState(null);
  const [appearance, setAppearance] = useState(() => {
    try {
      const savedAppearance = JSON.parse(window.localStorage.getItem(APPEARANCE_KEY) || '{}');
      return {
        ...DEFAULT_APPEARANCE,
        ...savedAppearance,
        messageSize: MESSAGE_SIZES.includes(Number(savedAppearance.messageSize))
          ? Number(savedAppearance.messageSize)
          : DEFAULT_APPEARANCE.messageSize,
      };
    } catch {
      return DEFAULT_APPEARANCE;
    }
  });
  const [soundMuted, setSoundMuted] = useState(() => {
    try {
      return window.localStorage.getItem(SOUND_MUTED_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [composerFocused, setComposerFocused] = useState(false);
  const deferredSearch = useDeferredValue(search);
  const profilePhonesKey = useMemo(
    () => (overview?.conversations || []).slice(0, 24).map((row) => row.phone).join(','),
    [overview?.conversations],
  );
  const streamRef = useRef(null);
  const bottomRef = useRef(null);
  const fileRef = useRef(null);
  const composerRef = useRef(null);
  const overviewRequestRef = useRef(0);
  const profileRequestRef = useRef(0);
  const detailRequestRef = useRef(0);
  const detailRevisionRef = useRef('');
  const quickReplyRequestRef = useRef(0);
  const readKeyRef = useRef('');
  const activeActionRef = useRef('');
  const draftsByPhoneRef = useRef(new Map());
  const preserveScrollRef = useRef(false);
  const openingScrollPhoneRef = useRef('');
  const nearBottomRef = useRef(true);
  const latestVisibleMessageRef = useRef({ phone: '', id: '' });
  const manualListRef = useRef(false);
  const lockTokenRef = useRef(globalThis.crypto?.randomUUID?.() || `lock-${Date.now()}-${Math.random()}`);
  const manualSendOperationRef = useRef(null);
  const [newMessageCount, setNewMessageCount] = useState(0);

  const updateComposerDraft = useCallback((value) => {
    const next = String(value || '').slice(0, 4000);
    setDraft(next);
    if (!phone) return;
    if (next) draftsByPhoneRef.current.set(phone, next);
    else draftsByPhoneRef.current.delete(phone);
  }, [phone]);

  const saveAppearance = (patch) => {
    setAppearance((current) => {
      const next = { ...current, ...patch };
      try {
        window.localStorage.setItem(APPEARANCE_KEY, JSON.stringify(next));
      } catch {
        // La preferencia queda activa durante esta sesión.
      }
      return next;
    });
  };

  const loadProfilePictures = useCallback(async (refresh = false) => {
    if (!isActive || !profilePhonesKey) return;
    const requestId = ++profileRequestRef.current;
    try {
      const result = await whatsappOperator.profilePictures(
        profilePhonesKey.split(','),
        { refresh },
      );
      if (requestId !== profileRequestRef.current) return;
      setProfiles((currentProfiles) => ({
        ...currentProfiles,
        ...(result?.profiles || {}),
      }));
    } catch {
      // La bandeja sigue funcionando con iniciales si WhatsApp oculta una foto.
    }
  }, [isActive, profilePhonesKey]);

  const emitSummary = useCallback((payload) => {
    const attention = payload?.attention || payload;
    if (!attention) return;
    window.dispatchEvent(new CustomEvent('rebu:whatsapp-summary', {
      detail: {
        attention,
        attentionKeys: Array.isArray(payload?.attentionKeys) ? payload.attentionKeys : null,
      },
    }));
  }, []);

  const loadOverview = useCallback(async (quiet = false) => {
    const requestId = ++overviewRequestRef.current;
    if (!quiet) setLoading(true);
    try {
      const data = await whatsappOperator.overview({
        limit: 40,
        filter,
        search: deferredSearch,
      });
      if (requestId !== overviewRequestRef.current) return;
      setOverview(data);
      setConnectionIssue(null);
      emitSummary(data);
      setError('');
      setPhone((current) => {
        // Actualizar, filtrar o marcar como leído nunca debe mover al operador
        // de la conversación en la que está trabajando.
        if (current) return current;
        if (!current && manualListRef.current) return '';
        return data.conversations?.find((row) => (
          Number(row.unread_count || 0) > 0 || row.handoff || row.failed_message || row.budget_draft
        ))?.phone || data.conversations?.[0]?.phone || '';
      });
    } catch (requestError) {
      if (requestId === overviewRequestRef.current) {
        setError(errorCopy(requestError));
        if (['bot_central_unreachable', 'bot_request_timeout'].includes(requestError?.code)) {
          setConnectionIssue({
            code: String(requestError.code),
            message: errorCopy(requestError),
          });
        }
      }
    } finally {
      if (!quiet && requestId === overviewRequestRef.current) setLoading(false);
    }
  }, [deferredSearch, emitSummary, filter]);

  const loadDetail = useCallback(async (selectedPhone, quiet = false) => {
    if (!selectedPhone) {
      setDetail(null);
      return;
    }
    const requestId = ++detailRequestRef.current;
    if (!quiet) setDetailLoading(true);
    try {
      const data = await whatsappOperator.conversation(selectedPhone, { limit: 80 });
      if (requestId !== detailRequestRef.current || selectedPhone !== phone) return;
      detailRevisionRef.current = String(data.revision || '');
      setDetail((currentDetail) => {
        if (!quiet || !currentDetail) return data;
        if (data.revision && data.revision === currentDetail.revision) return currentDetail;
        const freshIds = new Set((data.messages || []).map((row) => String(row.id)));
        const olderMessages = (currentDetail.messages || []).filter(
          (row) => !freshIds.has(String(row.id)),
        );
        return {
          ...data,
          messages: [...olderMessages, ...(data.messages || [])],
          nextCursor: olderMessages.length ? currentDetail.nextCursor : data.nextCursor,
        };
      });
      setError('');
    } catch (requestError) {
      if (requestId === detailRequestRef.current) setError(errorCopy(requestError));
    } finally {
      if (!quiet && requestId === detailRequestRef.current) setDetailLoading(false);
    }
  }, [phone]);

  const loadMoreConversations = async () => {
    if (!overview?.nextCursor || loadingMore) return;
    const requestId = overviewRequestRef.current;
    const requestedCursor = overview.nextCursor;
    setLoadingMore('conversations');
    try {
      const data = await whatsappOperator.overview({
        limit: 40,
        cursor: requestedCursor,
        filter,
        search: deferredSearch,
      });
      if (requestId !== overviewRequestRef.current) return;
      setOverview((currentOverview) => {
        if (currentOverview?.nextCursor !== requestedCursor) return currentOverview;
        const byPhone = new Map(
          [...(currentOverview?.conversations || []), ...(data.conversations || [])]
            .map((row) => [row.phone, row]),
        );
        return {
          ...currentOverview,
          ...data,
          conversations: [...byPhone.values()],
        };
      });
      emitSummary(data);
    } catch (requestError) {
      if (requestId === overviewRequestRef.current) setError(errorCopy(requestError));
    } finally {
      setLoadingMore('');
    }
  };

  const loadOlderMessages = async () => {
    if (!phone || !detail?.nextCursor || loadingMore) return;
    const requestId = detailRequestRef.current;
    const selectedPhone = phone;
    const requestedCursor = detail.nextCursor;
    setLoadingMore('messages');
    preserveScrollRef.current = streamRef.current
      ? {
        scrollHeight: streamRef.current.scrollHeight,
        scrollTop: streamRef.current.scrollTop,
      }
      : true;
    try {
      const data = await whatsappOperator.conversation(selectedPhone, {
        limit: 80,
        cursor: requestedCursor,
      });
      if (
        requestId !== detailRequestRef.current
        || data.conversation?.phone !== selectedPhone
      ) return;
      setDetail((currentDetail) => {
        if (
          currentDetail?.conversation?.phone !== selectedPhone
          || currentDetail?.nextCursor !== requestedCursor
        ) return currentDetail;
        const byId = new Map(
          [...(data.messages || []), ...(currentDetail?.messages || [])]
            .map((row) => [String(row.id), row]),
        );
        return {
          ...currentDetail,
          ...data,
          messages: [...byId.values()].sort((left, right) => (
            new Date(left.created_at).getTime() - new Date(right.created_at).getTime()
            || Number(left.id) - Number(right.id)
          )),
          revision: currentDetail.revision,
        };
      });
    } catch (requestError) {
      if (requestId === detailRequestRef.current) setError(errorCopy(requestError));
    } finally {
      setLoadingMore('');
    }
  };

  // Fix 4: No cargar overview si el device access todavía no se resolvió.
  const deviceAccessResolved = deviceAccess?.approved === true || deviceAccess?.status === 'unsupported';

  useEffect(() => {
    if (!isActive || !deviceAccessResolved) return undefined;
    let cancelled = false;
    let timer = null;
    let refreshing = false;
    let firstLoad = true;
    const schedule = () => {
      if (cancelled) return;
      timer = window.setTimeout(() => void refreshOverview(), 10000);
    };
    const refreshOverview = async () => {
      if (cancelled || refreshing) return;
      refreshing = true;
      const quiet = !firstLoad;
      firstLoad = false;
      try {
        await loadOverview(quiet);
      } finally {
        refreshing = false;
        schedule();
      }
    };
    void refreshOverview();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      overviewRequestRef.current += 1;
    };
  }, [isActive, deviceAccessResolved, loadOverview]);

  useEffect(() => {
    if (!isActive || !profilePhonesKey) return undefined;
    void loadProfilePictures();
    return () => {
      profileRequestRef.current += 1;
    };
  }, [isActive, loadProfilePictures, profilePhonesKey]);

  useEffect(() => {
    if (!isActive) return undefined;
    if (!phone) {
      detailRequestRef.current += 1;
      setDetail(null);
      setContextMode('');
      return undefined;
    }
    setDetail(null);
    detailRevisionRef.current = '';
    let cancelled = false;
    let timer = null;
    let refreshing = false;
    const schedule = () => {
      if (cancelled) return;
      const delay = document.visibilityState === 'visible' ? 2500 : 10000;
      timer = window.setTimeout(() => void checkActivity(), delay);
    };
    const openConversation = async () => {
      if (cancelled || refreshing) return;
      refreshing = true;
      try {
        await loadDetail(phone, false);
      } finally {
        refreshing = false;
        schedule();
      }
    };
    const checkActivity = async () => {
      if (cancelled || refreshing) return;
      refreshing = true;
      try {
        const activity = await whatsappOperator.conversationActivity(phone);
        if (
          !cancelled
          && (!detailRevisionRef.current || activity.revision !== detailRevisionRef.current)
        ) {
          await loadDetail(phone, true);
        }
      } catch {
        // Una comprobación silenciosa no reemplaza el chat ni muestra un error transitorio.
      } finally {
        refreshing = false;
        schedule();
      }
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState !== 'visible' || refreshing) return;
      if (timer) window.clearTimeout(timer);
      void checkActivity();
    };
    void openConversation();
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      detailRequestRef.current += 1;
    };
  }, [isActive, loadDetail, phone]);

  const current = phone
    ? detail?.conversation || overview?.conversations?.find((row) => row.phone === phone) || null
    : null;
  const messages = useMemo(() => detail?.messages || [], [detail?.messages]);
  const displayedMessages = useMemo(
    () => messages
      .filter((row) => String(row?.status || '').toLowerCase() !== 'suggested')
      .sort((left, right) => (
        new Date(left.created_at).getTime() - new Date(right.created_at).getTime()
        || Number(left.id) - Number(right.id)
      )),
    [messages],
  );
  const messageBlocks = useMemo(
    () => groupMessagesForDisplay(displayedMessages),
    [displayedMessages],
  );
  const conversationItems = withDaySeparators(messageBlocks);
  const conversationImages = useMemo(
    () => displayedMessages.flatMap((message) => (
      (message.attachments || [])
        .filter((attachment) => attachmentKindForView(attachment) === 'image')
        .map((attachment) => ({
          ...attachment,
          caption: message.content && message.content !== '[Imagen]' ? message.content : '',
          created_at: message.created_at,
          message_id: message.id,
        }))
    )),
    [displayedMessages],
  );
  const openImageGallery = useCallback((attachment, data) => {
    setImageGallery({
      initialId: attachment.id,
      initialData: data,
    });
  }, []);
  const openDocumentViewer = useCallback((attachment, data) => {
    setDocumentViewer({ attachment, data });
  }, []);
  const proposed = useMemo(
    () => [...messages].reverse().find((row) => (
      row.direction === 'outbound' && row.status === 'suggested'
    )),
    [messages],
  );
  const failedMessage = useMemo(
    () => [...messages].reverse().find((row) => (
      row.direction === 'outbound'
      && row.status === 'failed'
      && row.attention_required
    )),
    [messages],
  );
  const budgetDraft = useMemo(
    () => (detail?.budgetDrafts || []).find((entry) => (
      ['pending_review', 'failed', 'approved', 'sending'].includes(entry.status)
    )) || current?.budget_draft || null,
    [current?.budget_draft, detail?.budgetDrafts],
  );
  const scrollToLatest = useCallback((behavior = 'smooth') => {
    nearBottomRef.current = true;
    setNewMessageCount(0);
    const stream = streamRef.current;
    if (!stream) return;
    if (behavior === 'smooth' && typeof stream.scrollTo === 'function') {
      stream.scrollTo({ top: stream.scrollHeight, behavior: 'smooth' });
      return;
    }
    stream.scrollTop = stream.scrollHeight;
  }, []);
  const handleStreamScroll = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;
    const distanceFromBottom = stream.scrollHeight - stream.scrollTop - stream.clientHeight;
    const nearBottom = distanceFromBottom <= 72;
    nearBottomRef.current = nearBottom;
    if (nearBottom) setNewMessageCount(0);
  }, []);

  useEffect(() => {
    setSuggestion(proposed?.content || '');
  }, [proposed?.content, proposed?.id]);

  useEffect(() => {
    setChatMenuOpen(false);
    setMessageMenuId('');
    setMessageInfo(null);
    setMessageEdit(null);
    setMessageDelete(null);
    setManualQuickReplyTarget(null);
  }, [phone]);

  useEffect(() => {
    preserveScrollRef.current = false;
    openingScrollPhoneRef.current = phone;
    setDraft(phone ? draftsByPhoneRef.current.get(phone) || '' : '');
    setSelectedFile(null);
    setSelectedCatalogMedia([]);
    setQuickReplySourceId(null);
    setNewMessageCount(0);
    nearBottomRef.current = true;
    latestVisibleMessageRef.current = { phone, id: '' };
    manualSendOperationRef.current = null;
    setImageGallery(null);
    setDocumentViewer(null);
  }, [phone]);

  useEffect(() => {
    const preserved = preserveScrollRef.current;
    if (!preserved) return;
    preserveScrollRef.current = false;
    if (typeof preserved !== 'object') return;
    window.requestAnimationFrame(() => {
      const stream = streamRef.current;
      if (!stream) return;
      stream.scrollTop = stream.scrollHeight - preserved.scrollHeight + preserved.scrollTop;
    });
  }, [messages.length]);

  useEffect(() => {
    const latest = displayedMessages.at(-1);
    if (!phone || !latest) return;
    const previous = latestVisibleMessageRef.current;
    if (previous.phone !== phone || !previous.id) {
      const openedPhone = phone;
      let cancelled = false;
      let firstFrame = 0;
      let secondFrame = 0;
      const stream = streamRef.current;
      const pinToLatest = (force = false) => {
        if (
          cancelled
          || openingScrollPhoneRef.current !== openedPhone
          || (!force && !nearBottomRef.current)
        ) return;
        scrollToLatest('auto');
      };
      const pinAfterMediaReady = () => {
        window.requestAnimationFrame(pinToLatest);
      };
      latestVisibleMessageRef.current = { phone, id: String(latest.id) };
      firstFrame = window.requestAnimationFrame(() => {
        pinToLatest(true);
        secondFrame = window.requestAnimationFrame(() => pinToLatest(true));
      });
      stream?.addEventListener('load', pinAfterMediaReady, true);
      stream?.addEventListener('loadedmetadata', pinAfterMediaReady, true);
      const settleTimer = window.setTimeout(() => {
        pinToLatest();
      }, 1200);
      return () => {
        cancelled = true;
        window.cancelAnimationFrame(firstFrame);
        window.cancelAnimationFrame(secondFrame);
        window.clearTimeout(settleTimer);
        stream?.removeEventListener('load', pinAfterMediaReady, true);
        stream?.removeEventListener('loadedmetadata', pinAfterMediaReady, true);
      };
    }
    if (String(latest.id) === previous.id) return;

    const previousIndex = displayedMessages.findIndex(
      (row) => String(row.id) === previous.id,
    );
    const newRows = previousIndex >= 0
      ? displayedMessages.slice(previousIndex + 1)
      : [latest];
    const newInboundCount = newRows.filter((row) => row.direction === 'inbound').length;
    latestVisibleMessageRef.current = { phone, id: String(latest.id) };

    if (nearBottomRef.current) {
      window.requestAnimationFrame(() => scrollToLatest('smooth'));
    } else if (newInboundCount > 0) {
      setNewMessageCount((count) => count + newInboundCount);
    }
  }, [displayedMessages, phone, scrollToLatest]);

  const latestInboundMessage = useMemo(
    () => [...displayedMessages].reverse().find((row) => (
      row.direction === 'inbound' && String(row.content || '').trim()
    )) || null,
    [displayedMessages],
  );
  const latestInboundMessageId = latestInboundMessage?.id || '';

  useEffect(() => {
    let cancelled = false;
    const markVisibleConversationRead = () => {
      const unread = Number(current?.unread_count || detail?.conversation?.unread_count || 0);
      const readKey = `${phone}:${latestInboundMessageId}`;
      if (
        cancelled
        || document.visibilityState !== 'visible'
        || !phone
        || !latestInboundMessageId
        || unread <= 0
        || readKeyRef.current === readKey
      ) return;
      readKeyRef.current = readKey;
      void whatsappOperator.markRead(phone).then(() => loadOverview(true)).catch(() => {
        if (readKeyRef.current === readKey) readKeyRef.current = '';
      });
    };
    markVisibleConversationRead();
    document.addEventListener('visibilitychange', markVisibleConversationRead);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', markVisibleConversationRead);
    };
  }, [
    current?.unread_count,
    detail?.conversation?.unread_count,
    latestInboundMessageId,
    loadOverview,
    phone,
  ]);

  const currentUserRole = String(currentUser?.role || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
  const isSystemAccount = ['system', 'sistema'].includes(currentUserRole);
  const isOwnerRole = ['owner', 'dueno'].includes(currentUserRole);
  const isAdmin = isSystemAccount || isOwnerRole;

  const permissions = overview?.actor?.permissions || {};
  const canReply = isAdmin || Boolean(permissions['whatsapp.reply']);
  const canMode = isAdmin || Boolean(permissions['whatsapp.mode.manage']);
  const canSettings = isAdmin || Boolean(permissions['whatsapp.settings.manage']);
  const canConnection = isAdmin || Boolean(permissions['whatsapp.connection.manage']);
  const isSystemRole = isSystemAccount || String(overview?.actor?.role || '').toLowerCase() === 'system';
  const canReviewDeviceAccess = Boolean(
    isSystemAccount
    && deviceAccess?.device?.centralMachineActive === true,
  );
  const canArchiveConversation = Boolean(permissions['whatsapp.conversation.archive']);
  const canDeleteConversation = Boolean(permissions['whatsapp.conversation.delete']);
  const canApproveBudget = Boolean(permissions['whatsapp.budget.approve']) && typeof onCreateBudget === 'function';
  const mode = overview?.mode || 'shadow';
  const off = mode === 'off';
  const selectedMode = off ? overview?.lastActiveMode || 'copilot' : mode;
  const testModeEnabled = Boolean(overview?.testMode?.enabled);
  const testModePhone = String(overview?.testMode?.phone || '');
  const testModeTarget = (overview?.conversations || []).find((row) => (
    String(row.phone || '') === testModePhone
  ));
  const testModeTargetName = testModeTarget ? contactName(testModeTarget) : formatPhone(testModePhone);
  const testModeAllowsCurrent = !testModeEnabled || (
    Boolean(phone) && Boolean(testModePhone) && phone === testModePhone
  );
  const connected = ['open', 'connected'].includes(
    String(overview?.runtime?.whatsapp_connection_state).toLowerCase(),
  ) || connectionInfo?.state === 'open' || connectionInfo?.state?.instance?.state === 'open';
  const testChat = Boolean(
    isTestConversation(current)
    || messages.some((row) => row?.metadata?.test_fixture === true),
  );
  const currentStatus = statusFor(current);
  const currentResponder = responderFor(current);
  const activeFilter = FILTERS.find((entry) => entry.id === filter) || FILTERS[0];
  const linkedMemberMatches = useMemo(
    () => linkedMembersForPhone(members, current?.phone),
    [current?.phone, members],
  );

  const refreshDeviceAccess = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setDeviceAccessLoading(true);
    try {
      const access = await whatsappDeviceAccess.ensureCentral(currentUser);
      setDeviceAccess(access || { status: 'approved', approved: true });
      setDeviceAccessError('');
      if (access?.approved) {
        setConnectionIssue(null);
      }
      if (
        access?.device?.centralMachineActive === true
        && ['system', 'sistema'].includes(currentUserRole)
      ) {
        setDeviceAccessRequests(await whatsappDeviceAccess.list().catch(() => []));
      } else {
        setDeviceAccessRequests([]);
      }
      return access;
    } catch {
      setDeviceAccessError('');
      setDeviceAccess((prev) => ({
        ...prev,
        approved: prev?.approved === true ? true : false,
      }));
      return null;
    } finally {
      if (!quiet) setDeviceAccessLoading(false);
    }
  }, [currentUser, currentUserRole]);

  useEffect(() => {
    if (!isActive) return undefined;
    let active = true;
    const tick = async () => {
      if (!active) return;
      await refreshDeviceAccess({ quiet: true });
    };
    void refreshDeviceAccess();
    const timer = window.setInterval(() => void tick(), 15000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [isActive, refreshDeviceAccess]);

  const requestDeviceAccess = async () => {
    if (deviceAccessBusy) return;
    setDeviceAccessBusy('request');
    setDeviceAccessError('');
    try {
      const requested = await whatsappDeviceAccess.request(deviceAccess?.device || null);
      if (
        requested?.id
        && isSystemAccount
        && requested.status !== 'approved'
      ) {
        const approved = await whatsappDeviceAccess.review(requested.id, 'approved');
        setDeviceAccess({ ...approved, device: deviceAccess?.device || null });
        setConnectionIssue(null);
        setError('');
        setDeviceAccessError('');
        void loadOverview();
        return;
      }
      setDeviceAccess(requested || { status: 'approved', approved: true });
      // Fix 6: Limpiar connectionIssue al recibir respuesta exitosa.
      setConnectionIssue(null);
      setError('');
      setDeviceAccessError('');
      if (requested?.approved || requested?.status === 'approved') {
        void loadOverview();
      }
    } catch {
      setDeviceAccessError('No pudimos enviar la solicitud. Revisá la conexión e intentá nuevamente.');
    } finally {
      setDeviceAccessBusy('');
    }
  };

  const reviewDeviceAccess = async (requestId, decision) => {
    if (!canReviewDeviceAccess || deviceAccessBusy) return;
    setDeviceAccessBusy(`${decision}:${requestId}`);
    setDeviceAccessError('');
    try {
      await whatsappDeviceAccess.review(requestId, decision);
      setDeviceAccessRequests(await whatsappDeviceAccess.list());
    } catch {
      setDeviceAccessError('No pudimos guardar la decisión. Actualizá las solicitudes e intentá nuevamente.');
    } finally {
      setDeviceAccessBusy('');
    }
  };

  const downloadTailscale = async () => {
    const result = await window.electronAPI?.openExternalUrl?.('https://tailscale.com/download/windows');
    if (result?.success === false) setDeviceAccessError('No pudimos abrir la descarga oficial de Tailscale.');
  };
  const linkedMember = linkedMemberMatches.length === 1 ? linkedMemberMatches[0] : null;
  const typingLock = detail?.typingLock;
  const lockedByOther = Boolean(
    typingLock
    && typingLock.actor_id !== overview?.actor?.id
    && new Date(typingLock.expires_at).getTime() > Date.now(),
  );
  const latestCommunicativeMessage = useMemo(
    () => [...messages].reverse().find((row) => {
      if (!String(row?.content || '').trim()) return false;
      if (row.direction === 'inbound') return true;
      return row.direction === 'outbound'
        && !['suggested', 'failed'].includes(String(row.status || '').toLowerCase());
    }) || null,
    [messages],
  );
  const quickReplyMessageKey = latestCommunicativeMessage?.direction === 'inbound'
    ? `${latestCommunicativeMessage.id}:${latestCommunicativeMessage.created_at || ''}`
    : '';
  const quickRepliesAvailable = Boolean(
    isActive
    && phone
    && canReply
    && mode !== 'auto'
    && !current?.opted_out
    && !testChat
    && testModeAllowsCurrent
    && quickReplyMessageKey,
  );
  const quickRepliesVisible = testModeAllowsCurrent
    && (quickRepliesAvailable || Boolean(manualQuickReplyTarget));

  const loadQuickReplies = useCallback(async (
    selectedPhone,
    { refresh = false, sourceMessageId = null } = {},
  ) => {
    const requestId = ++quickReplyRequestRef.current;
    setQuickRepliesLoading(true);
    setQuickRepliesError('');
    if (!refresh) {
      setQuickReplies([]);
      setQuickReplySourceId(null);
    }
    try {
      const result = await whatsappOperator.quickReplies(selectedPhone, {
        refresh,
        sourceMessageId,
      });
      if (requestId !== quickReplyRequestRef.current) return;
      setQuickReplies(Array.isArray(result?.suggestions) ? result.suggestions.slice(0, 3) : []);
      setQuickReplySourceId(result?.sourceMessageId || null);
    } catch {
      if (requestId === quickReplyRequestRef.current) {
        setQuickRepliesError('No se pudieron preparar las respuestas rápidas.');
      }
    } finally {
      if (requestId === quickReplyRequestRef.current) setQuickRepliesLoading(false);
    }
  }, []);

  useEffect(() => {
    quickReplyRequestRef.current += 1;
    setQuickReplies([]);
    setQuickRepliesError('');
    setQuickReplySourceId(null);
    setManualQuickReplyTarget(null);
    setQuickRepliesLoading(false);
    if (!quickRepliesAvailable) return undefined;
    void loadQuickReplies(phone);
    return () => {
      quickReplyRequestRef.current += 1;
    };
  }, [loadQuickReplies, phone, quickRepliesAvailable, quickReplyMessageKey]);

  useEffect(() => {
    if (!isActive || !canApproveBudget || businessSettings) return undefined;
    let cancelled = false;
    void whatsappOperator.settings()
      .then((rows) => {
        if (!cancelled) setBusinessSettings(rows?.[0] || null);
      })
      .catch(() => {
        // El presupuesto sigue siendo editable aunque el pie comercial no esté disponible.
      });
    return () => {
      cancelled = true;
    };
  }, [businessSettings, canApproveBudget, isActive]);

  const conversations = useMemo(() => {
    const query = search.trim().toLowerCase();
    const attention = (row) => (
      Number(row.unread_count || 0) > 0
      || row.handoff
      || row.failed_message
      || row.budget_draft
    );
    const filtered = (overview?.conversations || []).filter((row) => {
      if (filter === 'attention' && !attention(row)) return false;
      if (filter === 'unread' && Number(row.unread_count || 0) <= 0) return false;
      if (filter === 'budgets' && !row.budget_draft) return false;
      if (filter === 'failed' && !row.failed_message) return false;
      return !query
        || contactName(row).toLowerCase().includes(query)
        || String(row.phone).includes(query)
        || String(row.latest_message?.content || '').toLowerCase().includes(query);
    });
    return filtered.sort(
      filter === 'all' || filter === 'unread'
        ? compareConversationActivity
        : compareConversationAttention,
    );
  }, [filter, overview?.conversations, search]);
  const memberMatchCountsByPhone = useMemo(() => new Map(
    conversations.map((row) => [
      String(row.phone || ''),
      linkedMembersForPhone(members, row.phone).length,
    ]),
  ), [conversations, members]);

  const action = async (key, callback, { refresh = true, onError = null } = {}) => {
    // El estado de React no cambia de forma sincrónica: esta referencia evita
    // dos envíos si se hace doble clic o se presiona Enter dos veces muy rápido.
    if (activeActionRef.current) return null;
    activeActionRef.current = key;
    setBusy(key);
    try {
      const result = await callback();
      if (refresh) {
        await Promise.all([
          loadOverview(true),
          phone ? loadDetail(phone, true) : Promise.resolve(),
        ]);
      }
      setError('');
      return result;
    } catch (requestError) {
      if (refresh) {
        await Promise.all([
          loadOverview(true),
          phone ? loadDetail(phone, true) : Promise.resolve(),
        ]).catch(() => null);
      }
      setError(errorCopy(requestError));
      onError?.(requestError);
      return null;
    } finally {
      if (activeActionRef.current === key) activeActionRef.current = '';
      setBusy((currentBusy) => (currentBusy === key ? '' : currentBusy));
    }
  };

  const acquireTyping = useCallback(async () => {
    if (!canReply || !phone || lockedByOther) return;
    try {
      const result = await whatsappOperator.acquireTypingLock(phone, lockTokenRef.current);
      if (!result?.acquired) {
        setError(`${result?.owner_name || 'Otra persona'} está respondiendo esta conversación.`);
      }
      await loadDetail(phone, true);
    } catch (requestError) {
      setError(errorCopy(requestError));
    }
  }, [canReply, loadDetail, lockedByOther, phone]);

  const releaseTyping = useCallback(async () => {
    if (!phone) return;
    try {
      await whatsappOperator.releaseTypingLock(phone, lockTokenRef.current);
    } catch {
      // El bloqueo también vence automáticamente.
    }
  }, [phone]);

  useEffect(() => {
    if (!composerFocused || !phone || lockedByOther) return undefined;
    void acquireTyping();
    const timer = window.setInterval(() => void acquireTyping(), 20000);
    return () => window.clearInterval(timer);
  }, [acquireTyping, composerFocused, lockedByOther, phone]);

  useEffect(() => () => {
    void releaseTyping();
  }, [releaseTyping]);

  const send = async (content, sourceMessageId = null) => {
    const clean = content.trim();
    if ((!clean && !selectedFile && selectedCatalogMedia.length === 0) || !phone || lockedByOther) return;
    const catalogMedia = selectedCatalogMedia.map((entry) => ({ ...entry }));
    const sendSignature = JSON.stringify({
      phone,
      content: clean,
      sourceMessageId,
      file: selectedFile ? {
        name: selectedFile.name,
        size: selectedFile.size,
        type: selectedFile.type,
        lastModified: selectedFile.lastModified,
      } : null,
      catalogProductIds: selectedCatalogMedia.map((entry) => entry.productId),
    });
    if (manualSendOperationRef.current?.signature !== sendSignature) {
      manualSendOperationRef.current = {
        signature: sendSignature,
        key: `manual:${globalThis.crypto?.randomUUID?.()
          || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`,
      };
    }
    const operationKey = manualSendOperationRef.current.key;
    if (catalogMedia.length > 0) {
      setPendingCatalogSend({
        phone,
        content: clean,
        media: catalogMedia,
        operationKey,
      });
      window.requestAnimationFrame(() => scrollToLatest('smooth'));
    }
    const sendResult = await action('send', async () => {
      let attachment = null;
      if (selectedFile) {
        if (selectedFile.size > 15 * 1024 * 1024) {
          const sizeError = new Error('El archivo supera 15 MB.');
          sizeError.code = 'attachment_too_large';
          throw sizeError;
        }
        attachment = {
          base64: await fileToBase64(selectedFile),
          mimeType: selectedFile.type,
          fileName: selectedFile.name,
        };
      }
      let deliveryResult;
      if (catalogMedia.length > 0) {
        deliveryResult = await whatsappOperator.sendCatalogMedia({
          phone,
          content: clean,
          productIds: catalogMedia.map((entry) => entry.productId),
          sourceMessageId,
          idempotencyKey: operationKey,
        });
      } else {
        deliveryResult = await whatsappOperator.sendMessage({
          phone,
          content: clean,
          attachment,
          sourceMessageId,
          idempotencyKey: operationKey,
        });
      }
      setDraft('');
      draftsByPhoneRef.current.delete(phone);
      setSelectedFile(null);
      setSelectedCatalogMedia([]);
      setQuickReplySourceId(null);
      manualSendOperationRef.current = null;
      await releaseTyping();
      window.requestAnimationFrame(() => scrollToLatest('smooth'));
      return deliveryResult;
    });
    if (catalogMedia.length > 0) {
      setPendingCatalogSend(null);
      if (Number(sendResult?.failedCount || 0) > 0) {
        setError(
          sendResult.failedCount === 1
            ? 'Una foto no pudo enviarse. Ya aparece marcada en el chat para que puedas reenviarla.'
            : `${sendResult.failedCount} fotos no pudieron enviarse. Ya aparecen marcadas en el chat para que puedas reenviarlas.`,
        );
      }
    }
  };

  const applyQuickReply = (reply) => {
    const text = typeof reply === 'string' ? reply : reply?.text;
    const catalogMedia = typeof reply === 'object' && Array.isArray(reply?.catalogMedia)
      ? reply.catalogMedia.slice(0, 3).map((entry) => ({
        productId: String(entry?.productId || ''),
        title: String(entry?.title || 'Producto').slice(0, 180),
        previewUrl: String(entry?.previewUrl || ''),
      })).filter((entry) => entry.productId && entry.previewUrl)
      : [];
    updateComposerDraft(text);
    setSelectedFile(null);
    setSelectedCatalogMedia(catalogMedia);
    setManualQuickReplyTarget(null);
    manualSendOperationRef.current = null;
    window.requestAnimationFrame(() => {
      composerRef.current?.focus();
      const end = composerRef.current?.value?.length || 0;
      composerRef.current?.setSelectionRange?.(end, end);
    });
  };

  const retryMessage = (row) => {
    setMessageMenuId('');
    const attempt = Number(row.attempt_count || 0) + 1;
    void action(
      `retry-${row.id}`,
      () => whatsappOperator.retryMessage(row.id, `retry:${row.id}:${attempt}`),
    );
  };

  const openMessageInfo = (row) => {
    setMessageMenuId('');
    setMessageInfo(row);
  };

  const openMessageEdit = (row) => {
    setMessageMenuId('');
    setMessageEdit({
      row,
      operationKey: `edit:${row.id}:${globalThis.crypto?.randomUUID?.() || Date.now()}`,
    });
  };

  const openMessageDelete = (row) => {
    setMessageMenuId('');
    setMessageDelete({
      row,
      operationKey: `delete:${row.id}:${globalThis.crypto?.randomUUID?.() || Date.now()}`,
    });
  };

  const confirmMessageEdit = async (content) => {
    if (!messageEdit?.row) return;
    const result = await action(
      `edit-message-${messageEdit.row.id}`,
      () => whatsappOperator.editMessage(
        messageEdit.row.id,
        content,
        messageEdit.operationKey,
      ),
    );
    if (result) setMessageEdit(null);
  };

  const confirmMessageDelete = async () => {
    if (!messageDelete?.row) return;
    const result = await action(
      `delete-message-${messageDelete.row.id}`,
      () => whatsappOperator.deleteMessage(
        messageDelete.row.id,
        messageDelete.operationKey,
      ),
    );
    if (result) setMessageDelete(null);
  };

  const clearSelectedConversation = () => {
    setPhone('');
    setDetail(null);
    setDraft('');
    setSelectedFile(null);
    setSelectedCatalogMedia([]);
    setContextMode('');
    setChatMenuOpen(false);
  };

  const confirmConversationArchive = async () => {
    if (!conversationArchive?.phone) return;
    const archivedPhone = conversationArchive.phone;
    const result = await action(
      `archive-conversation-${archivedPhone}`,
      () => whatsappOperator.archiveConversation(archivedPhone),
      { refresh: false },
    );
    if (!result?.archived) return;
    draftsByPhoneRef.current.delete(archivedPhone);
    setConversationArchive(null);
    clearSelectedConversation();
    await loadOverview(true);
  };

  const confirmConversationDelete = async (confirmation) => {
    if (!conversationDelete?.phone) return;
    const deletedPhone = conversationDelete.phone;
    const result = await action(
      `delete-conversation-${deletedPhone}`,
      () => whatsappOperator.deleteConversation(deletedPhone, confirmation),
      { refresh: false },
    );
    if (!result?.deleted) return;
    draftsByPhoneRef.current.delete(deletedPhone);
    setConversationDelete(null);
    clearSelectedConversation();
    await loadOverview(true);
  };

  const generateRepliesForMessage = async (row) => {
    setMessageMenuId('');
    setManualQuickReplyTarget({
      id: String(row.id),
      preview: String(row.content || '').trim().slice(0, 90),
    });
    setQuickReplies([]);
    setQuickRepliesError('');
    setQuickReplySourceId(null);
    await loadQuickReplies(phone, { sourceMessageId: row.id });
    window.requestAnimationFrame(() => {
      composerRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
    });
  };

  const dismissFailedMessage = async (row) => {
    const result = await action(
      `dismiss-failure-${row.id}`,
      () => whatsappOperator.dismissFailedMessage(row.id),
    );
    if (result?.dismissed) closeContext();
  };

  const openSettings = async () => {
    setMainMenuOpen(false);
    setContextMode('settings');
    await action('load-settings', async () => {
      const rows = await whatsappOperator.settings();
      setBusinessSettings(rows?.[0] || null);
    }, { refresh: false });
  };

  const saveSettings = (data) => {
    void action('save-settings', async () => {
      const saved = await whatsappOperator.publishSettings(data);
      setBusinessSettings(saved);
      setContextMode('');
    });
  };

  const openBotSettings = async () => {
    setMainMenuOpen(false);
    setContextMode('');
    setBotSettingsOpen(true);
    setBotSettingsLoading(true);
    setBotSettingsLoadError(false);
    const loaded = await action('load-bot-settings', async () => {
      const rows = await whatsappOperator.botSettings();
      const latest = rows?.[0] || null;
      setBotSettings(latest);
      if (isSystemRole) await refreshCentralMachineState({ showError: false });
      return latest;
    }, { refresh: false });
    setBotSettingsLoading(false);
    if (!loaded) setBotSettingsLoadError(true);
  };

  const saveBotSettings = (data) => {
    void action('save-bot-settings', async () => {
      const saved = await whatsappOperator.publishBotSettings(data);
      setBotSettings(saved);
      return saved;
    });
  };

  const refreshCentralMachineState = useCallback(async ({
    showError = true,
    preserveActionError = false,
    background = false,
  } = {}) => {
    if (!isSystemRole) return null;
    if (!background) setCentralMachineLoading(true);
    if (!preserveActionError) setCentralMachineActionError('');
    try {
      const [centralResult, candidateResult] = await Promise.allSettled([
        whatsappOperator.centralMachine(),
        window.electronAPI?.getWhatsAppCentralCandidate
          ? window.electronAPI.getWhatsAppCentralCandidate()
          : Promise.resolve({ supported: false }),
      ]);
      if (centralResult.status === 'fulfilled') {
        setCentralMachine(centralResult.value);
      } else {
        setCentralMachine({ configured: false, machine: null, error: centralResult.reason?.code || 'operator_request_failed' });
        if (showError) setError(errorCopy(centralResult.reason));
      }
      if (candidateResult.status === 'fulfilled') {
        setCentralCandidate(candidateResult.value || { supported: false });
      } else {
        setCentralCandidate({ supported: false, error: candidateResult.reason?.message || 'desktop_unavailable' });
        if (showError) setError(errorCopy(candidateResult.reason));
      }
      if (centralResult.status === 'fulfilled' && candidateResult.status === 'fulfilled') {
        await reconcileCentralOverride({
          desktop: window.electronAPI,
          centralMachine: centralResult.value,
          candidate: candidateResult.value,
        }).catch((resetError) => {
          setCentralMachineActionError(errorCopy(resetError));
        });
      }
      return centralResult.status === 'fulfilled' ? centralResult.value : null;
    } finally {
      if (!background) setCentralMachineLoading(false);
    }
  }, [isSystemRole]);

  useEffect(() => {
    if (!isSystemRole) return undefined;
    void refreshCentralMachineState({
      showError: false,
      preserveActionError: true,
      background: true,
    });
    const timer = window.setInterval(() => {
      void refreshCentralMachineState({
        showError: false,
        preserveActionError: true,
        background: true,
      });
    }, 15000);
    return () => window.clearInterval(timer);
  }, [isSystemRole, refreshCentralMachineState]);

  const claimCentralMachine = async () => {
    if (!isSystemRole) return;
    let claimFailure = '';
    setCentralMachineActionError('');
    await action('claim-central-machine', async () => {
      if (!window.electronAPI?.getWhatsAppCentralCandidate) {
        const desktopError = new Error('Esta opción necesita la app de escritorio.');
        desktopError.code = 'invalid_central_machine';
        throw desktopError;
      }
      const candidate = await window.electronAPI.getWhatsAppCentralCandidate();
      setCentralCandidate(candidate);
      const transfer = await claimCentralMachineForDevice({
        desktop: window.electronAPI,
        operator: whatsappOperator,
        candidate,
        currentCentralMachine: centralMachine,
      });
      setCentralCandidate(transfer.candidate);
      setCentralMachine({ configured: true, machine: transfer.claimed?.machine || null });
      return transfer.claimed;
    }, {
      refresh: false,
      onError: (requestError) => {
        claimFailure = errorCopy(requestError);
        setCentralMachineActionError(claimFailure);
      },
    });
    await refreshCentralMachineState({ showError: false });
    if (claimFailure) setCentralMachineActionError(claimFailure);
  };


  const rejectBudget = (entry) => {
    void action('reject-budget', () => whatsappOperator.updateBudgetDraft(entry.id, {
      ...entry,
      status: 'rejected',
    }));
  };

  const approveBudget = async (entry, value) => {
    if (!canApproveBudget) return;
    if (!testModeAllowsCurrent) {
      setError(ERROR_COPY.test_mode_other_phone);
      return;
    }
    await action('approve-budget', async () => {
      const operationKey = entry.operation_key || `whatsapp-budget:${entry.id}`;
      const itemsSnapshot = value.items.map((item, index) => ({
        id: `${entry.id}-${index}`,
        product_id: item.product_id || null,
        title: item.title,
        category: 'WhatsApp',
        quantity: Number(item.quantity || 0),
        unit_price: Number(item.unit_price || 0),
        subtotal: item.product_type === 'weight'
          ? Number(item.unit_price || 0) * Number(item.quantity || 0) / 1000
          : Number(item.unit_price || 0) * Number(item.quantity || 0),
        product_type: item.product_type || 'quantity',
        is_custom: !item.product_id,
        is_combo: false,
        is_discount: false,
        products_included: [],
      }));
      await whatsappOperator.updateBudgetDraft(entry.id, {
        ...value,
        phone: entry.phone,
        items: value.items,
        status: 'approved',
      });
      const created = await onCreateBudget({
        operationKey,
        memberId: value.memberId,
        customerName: value.customer_name,
        customerPhone: value.customer_phone,
        customerNote: value.notes,
        documentTitle: 'PRESUPUESTO',
        eventLabel: 'WhatsApp',
        paymentMethod: 'Efectivo',
        installments: 1,
        itemsSnapshot,
        totalAmount: value.total,
      });
      await whatsappOperator.recordBudgetResult(entry.id, {
        status: 'sending',
        operationKey,
        rebuBudgetId: created.id,
        textDeliveryStatus: entry.text_delivery_status || 'pending',
        pdfDeliveryStatus: entry.pdf_delivery_status || 'pending',
      });

      let textStatus = entry.text_delivery_status || 'pending';
      let pdfStatus = entry.pdf_delivery_status || 'pending';
      if (textStatus !== 'sent') {
        try {
          await whatsappOperator.sendMessage({
            phone: entry.phone,
            content: `Te envío el presupuesto ${created.id ? `N.º ${created.id}` : ''} por ${formatMoney(value.total)}. El detalle completo está en el PDF adjunto.`,
            idempotencyKey: `budget-text:${entry.id}`,
          });
          textStatus = 'sent';
        } catch (textError) {
          textStatus = 'failed';
          setError(errorCopy(textError));
        }
        await whatsappOperator.recordBudgetResult(entry.id, {
          status: 'sending',
          operationKey,
          rebuBudgetId: created.id,
          textDeliveryStatus: textStatus,
          pdfDeliveryStatus: pdfStatus,
        });
      }
      if (pdfStatus !== 'sent') {
        try {
          if (!window.electronAPI?.generateWhatsAppBudgetPdf) {
            throw new Error('Abrí Rebu como aplicación de escritorio para generar el PDF.');
          }
          const pdf = await window.electronAPI.generateWhatsAppBudgetPdf({
            budget: {
              id: created.id,
              customerName: value.customer_name,
              customerPhone: value.customer_phone,
              notes: value.notes,
              items: value.items,
              totalAmount: value.total,
            },
            settings: businessSettings?.data || {},
          });
          if (!pdf?.success || !pdf.base64) throw new Error(pdf?.error || 'No se pudo generar el PDF.');
          await whatsappOperator.sendMessage({
            phone: entry.phone,
            content: `Presupuesto Rebu N.º ${created.id || ''}`.trim(),
            attachment: {
              base64: pdf.base64,
              mimeType: 'application/pdf',
              fileName: `presupuesto-rebu-${created.id || entry.id}.pdf`,
            },
            idempotencyKey: `budget-pdf:${entry.id}`,
          });
          pdfStatus = 'sent';
        } catch (pdfError) {
          pdfStatus = 'failed';
          setError(errorCopy(pdfError));
        }
        await whatsappOperator.recordBudgetResult(entry.id, {
          status: 'sending',
          operationKey,
          rebuBudgetId: created.id,
          textDeliveryStatus: textStatus,
          pdfDeliveryStatus: pdfStatus,
        });
      }
      await whatsappOperator.recordBudgetResult(entry.id, {
        status: textStatus === 'sent' && pdfStatus === 'sent' ? 'sent' : 'failed',
        operationKey,
        rebuBudgetId: created.id,
        textDeliveryStatus: textStatus,
        pdfDeliveryStatus: pdfStatus,
      });
      if (textStatus !== 'sent' || pdfStatus !== 'sent') {
        const deliveryError = new Error(
          'El presupuesto quedó creado, pero una parte del envío necesita reintento.',
        );
        deliveryError.code = 'budget_delivery_incomplete';
        throw deliveryError;
      }
    });
  };

  const toggleSound = () => {
    const next = !soundMuted;
    setSoundMuted(next);
    try {
      window.localStorage.setItem(SOUND_MUTED_KEY, String(next));
    } catch {
      // Preferencia no persistente si el almacenamiento local no está disponible.
    }
    window.dispatchEvent(new CustomEvent('rebu:whatsapp-sound-setting', {
      detail: { muted: next },
    }));
  };

  const openConnection = async (actionName = 'status') => {
    setMainMenuOpen(false);

    if (actionName === 'logout') {
      const confirmResult = await Swal.fire({
        title: '¿Desconectar número de WhatsApp?',
        html: `
          <div style="font-size: 0.925rem; color: #475569; text-align: left; line-height: 1.5; margin-top: 0.5rem;">
            <p style="margin-bottom: 0.75rem;">Se cerrará la sesión actual del bot de WhatsApp en la máquina central.</p>
            <p style="font-weight: 600; color: #1e293b; margin-bottom: 0.25rem;">¿Qué querés hacer con la caché y los mensajes locales?</p>
          </div>
        `,
        icon: 'warning',
        showCancelButton: true,
        showDenyButton: true,
        confirmButtonText: 'Desconectar y borrar caché',
        denyButtonText: 'Solo desconectar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#dc2626',
        denyButtonColor: '#0284c7',
        cancelButtonColor: '#64748b',
        reverseButtons: true,
      });

      if (confirmResult.isDismissed) {
        return;
      }

      const shouldClearCache = confirmResult.isConfirmed;

      await action('connection-logout', async () => {
        const data = await whatsappOperator.connectionAction('logout');
        setConnectionInfo(data || { state: 'close', status: 'close' });
        setConnectionIssue(null);
        setOverview(null);
        setDetail(null);
        setProfiles({});
        setPhone('');
        setDraft('');
        attachmentDataCache.clear();
        attachmentRequestCache.clear();
        attachmentDataCacheBytes = 0;
        setContextMode('');

        if (shouldClearCache) {
          try {
            sessionStorage.removeItem('rebu_wa_overview_cache');
            localStorage.removeItem('rebu_wa_overview_cache');
          } catch {
            // ignore
          }
        }

        await Swal.fire({
          title: 'WhatsApp Desconectado',
          text: shouldClearCache
            ? 'Se cerró la sesión y se limpió la caché local correctamente.'
            : 'Se cerró la sesión del bot de WhatsApp.',
          icon: 'success',
          timer: 2000,
          showConfirmButton: false,
        });

        try {
          const qrData = await whatsappOperator.connectionAction('qr');
          setConnectionInfo(qrData);
        } catch {
          void loadOverview();
        }
      }, { refresh: false });
      return;
    }

    if (actionName !== 'logout') {
      setContextMode('connection');
    }
    await action(`connection-${actionName}`, async () => {
      const data = actionName === 'status'
        ? await whatsappOperator.connection()
        : await whatsappOperator.connectionAction(actionName);
      setConnectionInfo(data);
      setConnectionIssue(null);
    }, { refresh: false });
  };

  // Fix 3: No iniciar polling de /connection si el device access está bloqueado.
  useEffect(() => {
    if (!isActive || !deviceAccessResolved) return undefined;
    let active = true;
    let connectedStreak = 0;
    const tick = async () => {
      try {
        const data = await whatsappOperator.connection();
        if (active) {
          setConnectionIssue(null);
          setConnectionInfo((prev) => {
            const isConnected = data?.state === 'open' || data?.state?.instance?.state === 'open';
            if (isConnected) {
              connectedStreak += 1;
            } else {
              connectedStreak = 0;
            }
            // El QR de WhatsApp vence en segundos. Sólo se conserva el anterior
            // ante un hueco puntual de la respuesta; si Evolution avisa que no
            // está disponible hay que soltarlo, porque ya no sirve para nada.
            const serviceDown = data?.evolution_available === false;
            if (!data?.qr && prev?.qr && !isConnected && !serviceDown) {
              // Conservar el anterior sólo mientras siga siendo escaneable. Sin
              // este límite un código muerto quedaba en pantalla para siempre.
              if (shouldDropStaleQr({ ageSeconds: prev.qr.age_seconds })) return data;
              return { ...data, qr: prev.qr };
            }
            return data;
          });
        }
      } catch (requestError) {
        if (active) {
          setConnectionIssue({
            code: String(requestError?.code || 'operator_request_failed'),
            message: errorCopy(requestError),
          });
        }
      }
    };
    void tick();
    const schedule = () => {
      // Cuando ya está conectado de forma estable, reducir la frecuencia
      const delay = connectedStreak >= 3 ? 30000 : 3000;
      return window.setTimeout(() => {
        void tick().finally(() => {
          if (active) timer = schedule();
        });
      }, delay);
    };
    let timer = schedule();
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [isActive, deviceAccessResolved]);

  const automaticContext = budgetDraft
    ? 'budget'
    : failedMessage ? 'failure'
      : (current?.handoff || detail?.handoff || proposed) ? 'decision' : '';
  const activeContext = contextMode;
  const contextOpen = Boolean(activeContext);
  const closeContext = () => setContextMode('');
  const attention = overview?.attention || {};
  const connectionView = describeWhatsAppConnection({ connectionInfo, connectionIssue });
  const qrSource = connectionView.qrSource;

  const qrCode = connectionInfo?.qr?.code || connectionInfo?.qr?.qrcode?.code || '';
  const qrGeneratedAt = connectionInfo?.qr?.generated_at || '';
  const [qrExtraSeconds, setQrExtraSeconds] = useState(0);
  const qrForcedForCodeRef = useRef('');

  // El contador arranca de la edad que informa el bot (no del reloj de esta PC,
  // que en un puesto remoto puede estar corrido) y le suma el tiempo local desde
  // que llegó la respuesta. Cada código nuevo lo reinicia.
  useEffect(() => {
    setQrExtraSeconds(0);
    if (!qrGeneratedAt) return undefined;
    const timer = window.setInterval(() => {
      setQrExtraSeconds((value) => value + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [qrGeneratedAt]);

  const qrStatus = qrFreshness({
    ageSeconds: Number(connectionInfo?.qr?.age_seconds || 0) + qrExtraSeconds,
  });

  // Cuando se vence, pedir uno nuevo UNA sola vez por código: forzar reinicia la
  // conexión de Evolution, y hacerlo en bucle no le daría tiempo al celular a
  // completar el escaneo.
  useEffect(() => {
    if (connected || !qrSource || !qrStatus.shouldForce) return;
    if (!qrCode || qrForcedForCodeRef.current === qrCode) return;
    qrForcedForCodeRef.current = qrCode;
    void openConnection('qr');
    // openConnection se recrea en cada render; el ref ya evita el bucle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, qrSource, qrStatus.shouldForce, qrCode]);
  const centralTransportUnavailable = Boolean(
    !connected
    && ['bot_central_unreachable', 'bot_request_timeout'].includes(connectionIssue?.code),
  );
  const connectionManagedBySystem = Boolean(
    !connected
    && overview
    && !canConnection,
  );
  const centralLeaseExpired = Boolean(
    isSystemRole
    && centralMachine?.configured
    && centralMachine?.lease_active !== true,
  );
  const centralWhatsappUnavailable = Boolean(
    isSystemRole
    && centralMachine?.lease_active === true
    && centralMachine?.machine?.whatsapp_connected === false,
  );
  // Fix 1: approved === true siempre desbloquea, sin importar connectionIssue residual.
  const deviceAccessBlocked = deviceAccess?.approved !== true
    && !['approved', 'unsupported'].includes(String(deviceAccess?.status || 'loading'));
  const isBrowserMode = typeof window.electronAPI?.getWhatsAppAccessDevice !== 'function';

  return (
    <section
      className={`wa-inbox ${contextOpen ? 'context-open' : ''} ${phone ? 'has-selection' : ''} density-${appearance.density}`}
      style={{ '--wa-message-font-size': `${appearance.messageSize}px` }}
      onClick={(event) => {
        const target = event.target instanceof Element ? event.target : event.target?.parentElement;
        if (messageMenuId && !target?.closest?.('.wa-message-menu')) setMessageMenuId('');
        if (mainMenuOpen && !target?.closest?.('.wa-menu-trigger, .wa-control-menu')) setMainMenuOpen(false);
        if (filterMenuOpen && !target?.closest?.('.wa-filter-menu-wrap')) setFilterMenuOpen(false);
      }}
    >
      <header className="wa-command">
        <div
          className="wa-live"
          onClick={canConnection ? () => void openConnection('status') : undefined}
          style={{ cursor: canConnection ? 'pointer' : 'default' }}
          title={canConnection ? 'Ver estado de conexión a WhatsApp' : 'Estado compartido desde la PC central'}
        >
          <span className={connected ? 'online' : 'offline'}>
            {connected ? <Wifi /> : <WifiOff />}
          </span>
          <div>
            <strong>Bandeja</strong>
            <small>{connected ? 'Conectado' : 'Sin conexión'}</small>
          </div>
          <em>{Number(attention.conversations || 0)} por atender</em>
        </div>
        <div className="wa-command-actions">
          {testModeEnabled && (
            <div className="wa-test-mode-chip" title={`Blacky sólo puede trabajar con ${testModeTargetName}`}>
              <FlaskConical />
              <span><small>Modo test</small><strong>{testModeTargetName || testModePhone}</strong></span>
            </div>
          )}
          <div className="wa-mode-summary">
            <span>Bot</span>
            <strong>
              {off
                ? 'Apagado'
                : mode === 'auto' && !overview?.businessProfileReady
                  ? 'Automático (faltan datos)'
                  : MODES.find(([id]) => id === mode)?.[1] || mode}
            </strong>
          </div>
          <button
            type="button"
            role="switch"
            aria-label="Activar o desactivar respuestas del bot"
            aria-checked={!off}
            className={`wa-switch ${off ? '' : 'on'}`}
            disabled={!canMode || Boolean(busy)}
            onClick={() => void action('power', () => whatsappOperator.setMode(
              off ? overview?.lastActiveMode || 'copilot' : 'off',
            ))}
          ><span><Power /></span></button>
          <button
            className="wa-refresh"
            type="button"
            onClick={() => {
              void loadOverview();
              void loadProfilePictures(true);
            }}
            disabled={loading}
            aria-label="Actualizar bandeja y fotos de contactos"
          >
            <RefreshCw className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            type="button"
            className="wa-menu-trigger"
            aria-label="Abrir configuración de WhatsApp"
            aria-expanded={mainMenuOpen}
            onClick={() => {
              setFilterMenuOpen(false);
              setMainMenuOpen((open) => !open);
            }}
          >
            <SlidersHorizontal />
          </button>
          {mainMenuOpen && (
            <div className="wa-control-menu">
              <section>
                <header><SlidersHorizontal /><span><strong>Apariencia</strong><small>Se guarda en este equipo</small></span></header>
                <label>Mensajes</label>
                <div className="wa-choice-row">
                  {[[12, 'Pequeños'], [14, 'Normales'], [16, 'Grandes']].map(([size, label]) => (
                    <button
                      key={size}
                      type="button"
                      className={appearance.messageSize === size ? 'active' : ''}
                      onClick={() => saveAppearance({ messageSize: size })}
                    >{label}</button>
                  ))}
                </div>
                <label>Densidad de la lista</label>
                <div className="wa-choice-row">
                  {[
                    ['compact', 'Compacta'],
                    ['comfortable', 'Cómoda'],
                  ].map(([density, label]) => (
                    <button
                      key={density}
                      type="button"
                      className={appearance.density === density ? 'active' : ''}
                      onClick={() => saveAppearance({ density })}
                    >{label}</button>
                  ))}
                </div>
              </section>
              <section className="wa-menu-actions">
                {canSettings && <button type="button" className="wa-menu-action-wide" onClick={() => void openSettings()}><Settings2 />Datos del negocio</button>}
                {canSettings && <button type="button" className="wa-menu-action-wide" onClick={() => void openBotSettings()}><Bot />Configurar bot</button>}
                <button type="button" onClick={toggleSound}>
                  {soundMuted ? <VolumeX /> : <Volume2 />}
                  {soundMuted ? 'Activar sonido' : 'Silenciar sonido'}
                </button>
                {canConnection && <button type="button" onClick={() => void openConnection('status')}><Wifi />Conexión</button>}
              </section>
            </div>
          )}
        </div>
      </header>

      {/* Fix 5: Ocultar error banner genérico cuando el gate de acceso está activo. */}
      {error && !deviceAccessBlocked && (
        <div className="wa-error">
          <AlertCircle /><span>{error}</span><button type="button" onClick={() => setError('')}>Cerrar</button>
        </div>
      )}

      {(centralLeaseExpired || (centralWhatsappUnavailable && connected)) && (
        <div className="wa-central-lease-alert" role="alert">
          <ShieldAlert />
          <span><strong>{centralLeaseExpired ? 'La máquina central perdió el pulso' : 'WhatsApp se desconectó en la máquina central'}</strong><small>{centralLeaseExpired
            ? 'El procesamiento automático está pausado hasta reactivar o transferir la central.'
            : 'La central sigue asignada, pero no podrá enviar hasta recuperar la conexión.'}</small></span>
          <button type="button" onClick={() => void openBotSettings()}>Revisar central</button>
        </div>
      )}

      {!connected && qrSource && current && (
        <div className="wa-error" style={{ background: 'var(--amber-50, #fffbeb)', color: 'var(--amber-800, #92400e)', borderColor: 'var(--amber-300, #fcd34d)' }}>
          <WifiOff /><span>WhatsApp se desconectó. <strong style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => { setPhone(''); }}>Escaneá el nuevo QR</strong> para reconectar.</span>
        </div>
      )}

      <div className="wa-line">
        {deviceAccessBlocked ? (
          <DeviceAccessGate
            access={deviceAccess}
            error={deviceAccessError}
            busy={Boolean(deviceAccessBusy || deviceAccessLoading)}
            onRequest={() => void requestDeviceAccess()}
            onDownload={() => void downloadTailscale()}
            onRefresh={() => void refreshDeviceAccess().then((access) => {
              if (access?.approved) void loadOverview();
            })}
          />
        ) : ((!connected && !loading) || (qrSource && !current)) ? (
          <div className="wa-empty wa-qr-center-container" style={{ gridColumn: '1 / -1', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '2rem', textAlign: 'center' }}>
            <WifiOff size={48} style={{ marginBottom: '1rem', color: 'var(--red-500, #ef4444)' }} />
            <strong style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
              {centralTransportUnavailable
                ? 'No se puede llegar a la PC central'
                : connectionManagedBySystem ? 'WhatsApp necesita atención en la central' : connectionView.title}
            </strong>
            <span style={{ fontSize: '0.875rem', opacity: 0.8, maxWidth: '440px', marginBottom: '1.5rem' }}>
              {centralTransportUnavailable
                ? 'Abrí Tailscale en esta PC e ingresá a la misma red de la central. Docker no hace falta aquí: sólo se ejecuta en la PC central.'
                : connectionManagedBySystem
                  ? 'Esta PC es un puesto remoto. Pedile a un usuario Sistema que reconecte WhatsApp; no instales Docker ni vincules otra sesión aquí.'
                : connectionView.detail}
            </span>
            {isBrowserMode ? (
              <div className="wa-bot-mode-notice warning" role="alert" style={{ maxWidth: '520px', marginBottom: '1.5rem', textAlign: 'left' }}>
                <AlertCircle />
                <span>
                  <strong>Estás usando el navegador web (Google Chrome / Edge)</strong>
                  <small>El control de WhatsApp y los dispositivos requiren la <strong>Aplicación de Escritorio de Rebu</strong>. Abrí la ventana de Rebu desde la barra de tareas de Windows para operar normalmente.</small>
                </span>
              </div>
            ) : centralTransportUnavailable ? (
              <div className="wa-bot-mode-notice warning" role="alert" style={{ maxWidth: '520px', marginBottom: '1.5rem', textAlign: 'left' }}>
                <AlertCircle />
                <span><strong>La central no está accesible desde esta PC</strong><small>{connectionIssue?.message}</small></span>
              </div>
            ) : connectionManagedBySystem ? (
              <div className="wa-bot-mode-notice" role="status" style={{ maxWidth: '520px', marginBottom: '1.5rem', textAlign: 'left' }}>
                <Info />
                <span><strong>El QR está reservado para Sistema</strong><small>Cuando la central vuelva a conectarse, la bandeja aparecerá automáticamente en esta PC.</small></span>
              </div>
            ) : qrSource ? (
              <div style={{ marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.6rem' }}>
                <div style={{ background: '#ffffff', padding: '20px', borderRadius: '20px', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.3)' }}>
                  <img
                    key={qrCode || qrGeneratedAt}
                    src={qrSource}
                    alt="Código QR de WhatsApp"
                    style={{ width: '260px', height: '260px', display: 'block', borderRadius: '8px' }}
                  />
                </div>
                <span
                  role="status"
                  style={{
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    color: qrStatus.level === 'fresh' ? 'inherit' : '#f59e0b',
                    opacity: qrStatus.level === 'fresh' ? 0.7 : 1,
                  }}
                >
                  {qrStatus.label}
                </span>
              </div>
            ) : connectionView.status === 'service_down' ? (
              <div className="wa-bot-mode-notice warning" role="alert" style={{ maxWidth: '520px', marginBottom: '1.5rem', textAlign: 'left' }}>
                <AlertCircle />
                <span>
                  <strong>El servicio de WhatsApp no responde en esta PC</strong>
                  <small>
                    Evolution dejó de contestar ({connectionView.code}). Levantá el stack en la
                    central con <strong>npm run stack:up</strong> y el código QR aparece solo.
                  </small>
                </span>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '24px', opacity: 0.7, marginBottom: '1.5rem' }}>
                <Loader2 className="animate-spin" size={24} />
                <span>Pidiendo un código nuevo a WhatsApp...</span>
              </div>
            )}
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
              {canSettings && (
                <button
                  type="button"
                  className="wa-secondary-action"
                  disabled={Boolean(busy)}
                  onClick={() => void openBotSettings()}
                >
                  <Bot /> Configurar bot
                </button>
              )}
              {centralTransportUnavailable && deviceAccess?.status === 'approved' && (
                <button
                  type="button"
                  className="wa-primary-action"
                  disabled={Boolean(busy)}
                  onClick={() => void downloadTailscale()}
                >
                  <Download /> Descargar Tailscale
                </button>
              )}
              <button
                type="button"
                className="wa-primary-action"
                disabled={Boolean(busy)}
                onClick={() => {
                  if (connectionManagedBySystem) void loadOverview();
                  else void openConnection(centralTransportUnavailable ? 'status' : 'qr');
                }}
              >
                <RefreshCw /> {centralTransportUnavailable || connectionManagedBySystem ? 'Volver a comprobar' : 'Generar nuevo QR'}
              </button>
            </div>
          </div>
        ) : (
          <>
            <aside className="wa-list">
          <div className="wa-list-tools">
            <label><Search /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar contacto o mensaje" /></label>
            <div className="wa-filter-control">
              <SlidersHorizontal />
              <span>Vista</span>
              <div className="wa-filter-menu-wrap">
                <button
                  type="button"
                  className="wa-filter-trigger"
                  aria-label={`Filtrar conversaciones: ${activeFilter.label}`}
                  aria-expanded={filterMenuOpen}
                  onClick={() => {
                    setMainMenuOpen(false);
                    setFilterMenuOpen((open) => !open);
                  }}
                >
                  <strong>{activeFilter.label}</strong>
                  <ChevronDown />
                </button>
                {filterMenuOpen && (
                  <div className="wa-filter-menu" role="menu">
                    {FILTERS.map((entry) => (
                      <button
                        key={entry.id}
                        type="button"
                        role="menuitemradio"
                        aria-checked={filter === entry.id}
                        className={filter === entry.id ? 'active' : ''}
                        onClick={() => {
                          setFilter(entry.id);
                          setFilterMenuOpen(false);
                        }}
                      >
                        <span><strong>{entry.label}</strong><small>{entry.description}</small></span>
                        {filter === entry.id && <Check />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <p className="wa-filter-help"><Info />{activeFilter.description}</p>
          </div>
          <div className="wa-rows">
            {loading && !overview ? (
              <LoadingState
                title="Preparando la bandeja"
                detail="Estamos recuperando las conversaciones más recientes."
              />
            ) : conversations.length === 0 ? (
              <div className="wa-empty"><MessageCircle /><strong>Sin conversaciones en este filtro</strong><span>{activeFilter.empty}</span></div>
            ) : conversations.map((row) => {
              const status = statusFor(row);
              const responder = responderFor(row);
              const unread = Number(row.unread_count || 0);
              return (
                <button
                  key={row.phone}
                  className={`wa-row ${phone === row.phone ? 'selected' : ''}`}
                  onClick={() => {
                    const alreadySelected = phone === row.phone;
                    void releaseTyping();
                    if (phone) draftsByPhoneRef.current.set(phone, draft);
                    manualListRef.current = false;
                    setFilterMenuOpen(false);
                    setPhone(row.phone);
                    setContextMode('');
                    if (alreadySelected) {
                      window.requestAnimationFrame(() => scrollToLatest('auto'));
                    }
                  }}
                >
                  <i className={row.failed_message ? 'failed' : row.handoff ? 'handoff' : status.tone} />
                  <Avatar
                    row={row}
                    url={profiles[row.phone]}
                    memberMatchCount={memberMatchCountsByPhone.get(String(row.phone || '')) || 0}
                  />
                  <span className="wa-row-content">
                    <header>
                      <strong>{contactName(row)}</strong>
                      <em className={`wa-responder ${responder.tone}`} title={`Última respuesta: ${responder.label}`}>
                        <responder.Icon />{responder.label}
                      </em>
                      <time>{waiting(row.latest_message?.created_at || row.updated_at)}</time>
                    </header>
                    <p>{row.latest_message?.content || 'Archivo o mensaje sin texto'}</p>
                    <footer>
                      {row.budget_draft && <em className="budget">Presupuesto</em>}
                      {row.failed_message && <em className="failed">No se envió</em>}
                      {row.handoff && <em className="pending">Necesita respuesta</em>}
                      {unread > 0 && (
                        <strong className="unread is-visible">
                          {unread > 99 ? '99+' : unread}
                        </strong>
                      )}
                    </footer>
                  </span>
                </button>
              );
            })}
            {overview?.nextCursor && (
              <button
                type="button"
                className="wa-load-more"
                disabled={Boolean(loadingMore)}
                onClick={() => void loadMoreConversations()}
              >
                {loadingMore === 'conversations'
                  ? <Loader2 className="animate-spin" />
                  : <ChevronLeft className="wa-load-more-chevron" />}
                Cargar más conversaciones
              </button>
            )}
          </div>
        </aside>

        <main className="wa-chat">
          {!current ? (
            <div className="wa-empty"><MessageCircle /><strong>Seleccioná una conversación</strong><span>La bandeja compartida reúne mensajes, presupuestos y casos pendientes.</span></div>
          ) : (
            <>
              <header className="wa-chat-head">
                <button
                  type="button"
                  className="wa-back"
                  onClick={() => {
                    if (phone) draftsByPhoneRef.current.set(phone, draft);
                    manualListRef.current = true;
                    setPhone('');
                  }}
                  aria-label="Volver a la lista"
                ><ChevronLeft /></button>
                <button
                  type="button"
                  className="wa-chat-contact-trigger"
                  aria-label={`Ver contacto de ${contactName(current)}, ${formatPhone(current.phone)}`}
                  aria-controls="wa-contact-panel"
                  aria-expanded={activeContext === 'contact'}
                  title="Ver datos del contacto"
                  onClick={() => {
                    setChatMenuOpen(false);
                    setContextMode('contact');
                  }}
                >
                  <Avatar
                    row={current}
                    url={profiles[current.phone]}
                    memberMatchCount={linkedMemberMatches.length}
                  />
                  <span><strong>{contactName(current)}</strong><small>{formatPhone(current.phone)}</small></span>
                </button>
                <nav>
                  {testModeEnabled && !testModeAllowsCurrent && <em className="test-locked"><FlaskConical />Fuera de la prueba</em>}
                  {lockedByOther && <em className="typing"><UserRound />{typingLock.actor_name || 'Otra persona'} está escribiendo</em>}
                  {automaticContext && (
                    <button
                      type="button"
                      className="attention"
                      onClick={() => setContextMode(automaticContext)}
                    >
                      {automaticContext === 'budget'
                        ? <><CircleDollarSign />Revisar presupuesto</>
                        : automaticContext === 'failure'
                          ? <><AlertCircle />Revisar envío</>
                        : current.status === 'human'
                          ? <><Hand />Atención manual</>
                          : <><Sparkles />Revisar</>}
                    </button>
                  )}
                  <em className={currentResponder.tone} title={`Última respuesta: ${currentResponder.label}`}>
                    <currentResponder.Icon />{currentResponder.label}
                  </em>
                  <div className="wa-chat-menu-wrap">
                    <button
                      type="button"
                      className="wa-chat-menu-trigger"
                      aria-label="Opciones de la conversación"
                      aria-expanded={chatMenuOpen}
                      onClick={() => setChatMenuOpen((open) => !open)}
                    ><MoreVertical /></button>
                    {chatMenuOpen && (
                      <div className="wa-chat-menu">
                        <button type="button" onClick={() => {
                          setContextMode('contact');
                          setChatMenuOpen(false);
                        }}><UserRound />Ver contacto</button>
                        {Number(current.unread_count || 0) > 0 && (
                          <button type="button" onClick={() => {
                            setChatMenuOpen(false);
                            void action('read', () => whatsappOperator.markRead(phone));
                          }}><CheckCheck />Marcar como leído</button>
                        )}
                        {canReply && !current.opted_out && !testChat && (
                          current.status === 'human'
                            ? <button type="button" onClick={() => {
                              setChatMenuOpen(false);
                              void action('release', () => whatsappOperator.releaseConversation(phone));
                            }}><Bot />Permitir que responda el bot</button>
                            : <button type="button" onClick={() => {
                              setChatMenuOpen(false);
                              void action('take', () => whatsappOperator.takeConversation(phone));
                            }}><Hand />Atender conversación</button>
                        )}
                        <button type="button" onClick={() => {
                          void navigator.clipboard?.writeText(formatPhone(current.phone));
                          setChatMenuOpen(false);
                        }}><FileText />Copiar teléfono</button>
                        {canArchiveConversation && (
                          <button type="button" className="wa-chat-menu-separator" onClick={() => {
                            setConversationArchive({
                              phone: current.phone,
                              customerName: contactName(current),
                            });
                            setChatMenuOpen(false);
                          }}><Archive />Archivar conversación</button>
                        )}
                        {canDeleteConversation && (
                          <button type="button" className="danger" onClick={() => {
                            setConversationDelete({
                              phone: current.phone,
                              customerName: contactName(current),
                            });
                            setChatMenuOpen(false);
                          }}><Trash2 />Eliminar definitivamente</button>
                        )}
                      </div>
                    )}
                  </div>
                </nav>
              </header>
              <div className="wa-stream-shell">
                <div ref={streamRef} className="wa-stream" onScroll={handleStreamScroll}>
                  {detail?.nextCursor && (
                    <button
                      type="button"
                      className="wa-load-more wa-load-older"
                      disabled={Boolean(loadingMore)}
                      onClick={() => void loadOlderMessages()}
                    >
                      {loadingMore === 'messages' && <Loader2 className="animate-spin" />}
                      Cargar mensajes anteriores
                    </button>
                  )}
                  {detailLoading && !detail ? (
                    <LoadingState
                      title="Abriendo la conversación"
                      detail="Estamos recuperando los mensajes y tu posición en el chat."
                    />
                  ) : messages.length === 0 ? (
                    <div className="wa-empty"><MessageCircle /><strong>Sin mensajes visibles</strong><span>WhatsApp envió una actualización sin contenido para mostrar.</span></div>
                  ) : conversationItems.map((block) => (
                    block.type === 'day-separator' ? (
                      <div
                        className="wa-day-separator"
                        key={block.key}
                        role="separator"
                        aria-label={`Mensajes de ${block.label}`}
                      >
                        <time dateTime={block.dayKey === 'unknown' ? undefined : block.dayKey}>
                          {block.label}
                        </time>
                      </div>
                    ) : (
                      <Message
                        key={block.key}
                        row={block.rows[0]}
                        groupRows={block.rows}
                        canRetry={canReply && testModeAllowsCurrent}
                        canMutate={canReply && !testChat}
                        canGenerate={canReply && !testChat && testModeAllowsCurrent}
                        menuOpen={messageMenuId === String(block.rows[0].id)}
                        onToggleMenu={(id) => setMessageMenuId((currentId) => (
                          currentId === id ? '' : id
                        ))}
                        onRetry={retryMessage}
                        onEdit={openMessageEdit}
                        onDelete={openMessageDelete}
                        onInfo={openMessageInfo}
                        onGenerateReply={(row) => void generateRepliesForMessage(row)}
                        onOpenImage={openImageGallery}
                        onOpenDocument={openDocumentViewer}
                      />
                    )
                  ))}
                  {pendingCatalogSend?.phone === phone && (
                    <section className="wa-pending-catalog-send" aria-live="polite" aria-label="Fotos subiendo">
                      {pendingCatalogSend.content && pendingCatalogSend.media.length > 1 && (
                        <p>{pendingCatalogSend.content}</p>
                      )}
                      <div className="wa-pending-catalog-grid">
                        {pendingCatalogSend.media.map((entry, index) => (
                          <figure key={`${pendingCatalogSend.operationKey}:${entry.productId}:${index}`}>
                            <img src={entry.previewUrl} alt={entry.title} />
                            <span><Loader2 className="animate-spin" /></span>
                            <figcaption>{entry.title}</figcaption>
                          </figure>
                        ))}
                      </div>
                      <footer>
                        <Loader2 className="animate-spin" />
                        Subiendo {pendingCatalogSend.media.length === 1
                          ? 'foto'
                          : `${pendingCatalogSend.media.length} fotos`}
                      </footer>
                    </section>
                  )}
                  <div ref={bottomRef} aria-hidden="true" />
                </div>
                {newMessageCount > 0 && (
                  <button
                    type="button"
                    className="wa-new-message-notice"
                    onClick={() => scrollToLatest('smooth')}
                    aria-label={`${newMessageCount} ${newMessageCount === 1 ? 'mensaje nuevo' : 'mensajes nuevos'}. Ir al final`}
                  >
                    <ChevronDown />
                    <span>{newMessageCount === 1 ? 'Mensaje nuevo' : `${newMessageCount} mensajes nuevos`}</span>
                  </button>
                )}
              </div>
              <footer className="wa-compose">
                {testModeEnabled && !testModeAllowsCurrent && (
                  <div className="wa-test-mode-lock" role="status">
                    <FlaskConical />
                    <span><strong>Chat bloqueado por Modo test</strong><small>Durante la prueba sólo se puede responder a {testModeTargetName || formatPhone(testModePhone)}.</small></span>
                  </div>
                )}
                {quickRepliesVisible && (
                  <section className="wa-quick-replies" aria-label="Respuestas rápidas">
                    <header>
                      <span>
                        <Sparkles />
                        <strong>{manualQuickReplyTarget ? 'Respuestas para este mensaje' : 'Respuestas rápidas'}</strong>
                        <small>
                          {manualQuickReplyTarget
                            ? `Analizando: “${manualQuickReplyTarget.preview}”`
                            : 'Elegí una para copiarla al mensaje y editarla si querés.'}
                        </small>
                      </span>
                      <button
                        type="button"
                        onClick={() => void loadQuickReplies(phone, {
                          refresh: true,
                          sourceMessageId: manualQuickReplyTarget?.id || null,
                        })}
                        disabled={quickRepliesLoading}
                        aria-label="Generar otras respuestas rápidas"
                        title="Generar otras opciones"
                      >
                        <RefreshCw className={quickRepliesLoading ? 'animate-spin' : ''} />
                      </button>
                    </header>
                    {quickRepliesLoading && quickReplies.length === 0 ? (
                      <div className="wa-quick-reply-list loading" aria-label="Analizando la conversación">
                        {[0, 1, 2].map((entry) => <span key={entry} />)}
                      </div>
                    ) : quickReplies.length > 0 ? (
                      <div className="wa-quick-reply-list">
                        {quickReplies.map((reply, index) => (
                          <button
                            type="button"
                            key={`${quickReplyMessageKey}:${index}`}
                            onClick={() => applyQuickReply(reply)}
                            disabled={!canReply || lockedByOther || busy === 'send'}
                            title="Usar esta respuesta"
                          >
                            <em>{index + 1}</em>
                            <span className="wa-quick-reply-copy">
                              <span className="wa-quick-reply-text">
                                {typeof reply === 'string' ? reply : reply?.text}
                              </span>
                              {Number(reply?.attachmentCount || 0) > 0 && (
                                <small className="wa-quick-reply-media">
                                  <ImageIcon />{reply.attachmentCount} {reply.attachmentCount === 1 ? 'foto' : 'fotos'} del catálogo
                                </small>
                              )}
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : quickRepliesError ? (
                      <p className="wa-quick-reply-error">
                        <AlertCircle />{quickRepliesError}
                        <button type="button" onClick={() => void loadQuickReplies(phone, {
                          refresh: true,
                          sourceMessageId: manualQuickReplyTarget?.id || null,
                        })}>
                          Reintentar
                        </button>
                      </p>
                    ) : null}
                  </section>
                )}
                {selectedFile && (
                  <div className="wa-selected-file">
                    <ImageIcon /><span><strong>{selectedFile.name}</strong><small>{Math.max(1, Math.round(selectedFile.size / 1024))} KB</small></span>
                    <button type="button" onClick={() => setSelectedFile(null)}><X /></button>
                  </div>
                )}
                {selectedCatalogMedia.length > 0 && (
                  <div className="wa-selected-catalog-media">
                    <header>
                      <span>
                        <ImageIcon />
                        <strong>
                          {selectedCatalogMedia.length} {selectedCatalogMedia.length === 1 ? 'foto seleccionada' : 'fotos seleccionadas'}
                        </strong>
                      </span>
                      <button type="button" onClick={() => setSelectedCatalogMedia([])}>Quitar todas</button>
                    </header>
                    <div className="wa-catalog-media-strip">
                      {selectedCatalogMedia.map((entry) => (
                        <figure key={entry.productId}>
                          <img src={entry.previewUrl} alt={entry.title} loading="eager" />
                          <figcaption title={entry.title}>{entry.title}</figcaption>
                          <button
                            type="button"
                            onClick={() => setSelectedCatalogMedia((current) => (
                              current.filter((item) => item.productId !== entry.productId)
                            ))}
                            aria-label={`Quitar ${entry.title}`}
                          ><X /></button>
                        </figure>
                      ))}
                    </div>
                  </div>
                )}
                <div className="wa-compose-row">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    hidden
                    onChange={(event) => {
                      setSelectedCatalogMedia([]);
                      setSelectedFile(event.target.files?.[0] || null);
                    }}
                  />
                  <button
                    type="button"
                    className="wa-attach"
                    disabled={!canReply || testChat || !testModeAllowsCurrent || lockedByOther || busy === 'send'}
                    onClick={() => fileRef.current?.click()}
                    title="Adjuntar imagen"
                  ><Paperclip /></button>
                  <textarea
                    ref={composerRef}
                    value={draft}
                    onChange={(event) => updateComposerDraft(event.target.value)}
                    onFocus={() => setComposerFocused(true)}
                    onBlur={() => {
                      setComposerFocused(false);
                      window.setTimeout(() => void releaseTyping(), 250);
                    }}
                    placeholder={testChat
                      ? 'Chat de prueba: el envío está deshabilitado'
                      : !testModeAllowsCurrent
                        ? 'Modo test: esta conversación está bloqueada'
                      : lockedByOther
                      ? `${typingLock.actor_name || 'Otra persona'} está respondiendo…`
                      : canReply ? 'Escribí una respuesta…' : 'No tenés permiso para responder'}
                    disabled={!canReply || testChat || !testModeAllowsCurrent || current.opted_out || busy === 'send' || lockedByOther}
                    onKeyDown={(event) => {
                      if (
                        event.key === 'Enter'
                        && !event.shiftKey
                        && !event.nativeEvent.isComposing
                      ) {
                        event.preventDefault();
                        void send(draft, quickReplySourceId);
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="wa-send"
                    aria-label="Enviar mensaje"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => void send(draft, quickReplySourceId)}
                    disabled={!canReply || testChat || !testModeAllowsCurrent || (!draft.trim() && !selectedFile && selectedCatalogMedia.length === 0) || current.opted_out || busy === 'send' || lockedByOther}
                  >
                    {busy === 'send' ? <Loader2 className="animate-spin" /> : <Send />}
                    <span>Enviar</span>
                  </button>
                </div>
                <small>{testChat
                  ? 'Conversación aislada: no se enviará nada a WhatsApp'
                  : !testModeAllowsCurrent
                    ? 'Modo test activo: los envíos están permitidos sólo en el número autorizado'
                  : 'Enter para enviar · Shift + Enter para una nueva línea'}</small>
              </footer>
            </>
          )}
        </main>

        {contextOpen && (
          <aside className={`wa-context-panel context-${activeContext}`}>
            {activeContext === 'contact' && current && (
              <section id="wa-contact-panel" className="wa-context-card wa-contact-panel">
                <header>
                  <span><UserRound /><strong>Contacto</strong></span>
                  <button type="button" onClick={closeContext} aria-label="Cerrar contacto"><X /></button>
                </header>
                <div className="wa-contact-identity">
                  <Avatar
                    row={current}
                    url={profiles[current.phone]}
                    className="large"
                    memberMatchCount={linkedMemberMatches.length}
                  />
                  <span>
                    <strong>{contactName(current)}</strong>
                    <small>{formatPhone(current.phone)}</small>
                  </span>
                </div>
                <div className="wa-context-stats">
                  <div><MessageCircle /><span>Sin leer</span><strong>{Number(current.unread_count || 0)}</strong></div>
                  <div><currentStatus.Icon /><span>Estado</span><strong>{currentStatus.label}</strong></div>
                  <div><Clock3 /><span>Último mensaje recibido</span><strong>{formatAt(current.last_inbound_at)}</strong></div>
                </div>
                {linkedMember ? (
                  <section className="wa-linked-member">
                    <header>
                      <span>
                        <UserRound />
                        <small>Socio vinculado</small>
                        <strong>
                          {linkedMember.name || linkedMember.displayName || 'Socio de Rebu'}
                          {(linkedMember.memberNumber ?? linkedMember.member_number) != null
                            ? ` · #${String(linkedMember.memberNumber ?? linkedMember.member_number).padStart(4, '0')}`
                            : ''}
                        </strong>
                      </span>
                      <em>Coincide por teléfono</em>
                    </header>
                    <dl>
                      <div><dt><Phone />Teléfono en Socios</dt><dd>{linkedMember.phone || 'Sin dato'}</dd></div>
                      {linkedMember.dni && <div><dt><CreditCard />DNI</dt><dd>{linkedMember.dni}</dd></div>}
                      {linkedMember.email && <div><dt><Mail />Email</dt><dd>{linkedMember.email}</dd></div>}
                      <div><dt><Sparkles />Puntos</dt><dd>{Number(linkedMember.points || 0).toLocaleString('es-AR')}</dd></div>
                    </dl>
                    {linkedMember.extraInfo && <p>{linkedMember.extraInfo}</p>}
                  </section>
                ) : linkedMemberMatches.length > 1 ? (
                  <div className="wa-member-match ambiguous">
                    <AlertCircle />
                    <span><strong>Varios socios usan este teléfono</strong><small>Encontramos {linkedMemberMatches.length} socios con este número. Revisalos en Socios antes de elegir uno.</small></span>
                  </div>
                ) : (
                  <div className="wa-member-match">
                    <Info />
                    <span><strong>Sin socio vinculado</strong><small>No encontramos este teléfono en Socios.</small></span>
                  </div>
                )}
                <p className="wa-context-note">
                  Las acciones de este chat están en el menú de tres puntos del encabezado.
                </p>
              </section>
            )}
            {activeContext === 'settings' && (
              <SettingsPanel
                key={businessSettings?.version || 'settings'}
                value={businessSettings?.data || {}}
                busy={busy === 'save-settings'}
                onSave={saveSettings}
                onClose={closeContext}
              />
            )}
            {activeContext === 'connection' && (
              <section className="wa-context-card wa-connection-panel">
                <header>
                  <span><Wifi /><strong>Conexión de WhatsApp</strong></span>
                  <button type="button" onClick={closeContext} aria-label="Cerrar conexión"><X /></button>
                </header>
                <div className={`wa-connection-state ${connected ? 'online' : 'offline'}`}>
                  {connected ? <Wifi /> : <WifiOff />}
                  <span><strong>{connected ? 'Conectado' : 'Sin conexión'}</strong><small>{connectionStateCopy(overview?.runtime?.whatsapp_connection_state)}</small></span>
                </div>
                {centralTransportUnavailable && (
                  <div className="wa-bot-mode-notice warning" role="alert">
                    <AlertCircle />
                    <span><strong>No se puede consultar la central</strong><small>Abrí Tailscale en esta PC. Docker sólo debe estar instalado en la máquina central.</small></span>
                  </div>
                )}
                {qrSource && <img className="wa-qr" src={qrSource} alt="QR para vincular WhatsApp" />}
                <button type="button" className="wa-secondary-action" disabled={Boolean(busy) || centralTransportUnavailable} onClick={() => void openConnection('qr')}>Obtener / Mostrar QR</button>
                <button type="button" className="wa-secondary-action" disabled={Boolean(busy) || centralTransportUnavailable} onClick={() => void openConnection('logout')} style={{ color: '#ef4444', borderColor: '#fca5a5' }}>
                  <Power /> Desconectar (Cambiar número)
                </button>
                <button type="button" className="wa-primary-action" disabled={Boolean(busy) || centralTransportUnavailable} onClick={() => void openConnection('restart')}>
                  {busy === 'connection-restart' ? <Loader2 className="animate-spin" /> : <RefreshCw />}Reiniciar servicio del bot
                </button>
                <p>Estas acciones sólo están disponibles para Sistema. Las claves y los datos sensibles permanecen ocultos.</p>
              </section>
            )}
            {activeContext === 'budget' && budgetDraft && (
              <BudgetPanel
                key={budgetDraft.id}
                draft={budgetDraft}
                inventory={inventory}
                members={members}
                busy={busy === 'approve-budget' || busy === 'reject-budget'}
                onApprove={approveBudget}
                onReject={rejectBudget}
                onClose={closeContext}
              />
            )}
            {activeContext === 'failure' && failedMessage && (
              <section className="wa-context-card wa-failure-panel">
                <header>
                  <span><AlertCircle /><strong>Mensaje no enviado</strong></span>
                  <button type="button" onClick={closeContext} aria-label="Cerrar revisión del envío"><X /></button>
                </header>
                <p>{failedMessage.content || 'WhatsApp no confirmó este mensaje.'}</p>
                <small>
                  {(failedMessage.failure_class || failedMessage.metadata?.operator_delivery?.failure_class) === 'definite'
                    ? 'WhatsApp confirmó que el mensaje no salió. Podés intentar enviarlo nuevamente.'
                    : 'No pudimos confirmar si el mensaje salió. Revisá el chat antes de volver a intentarlo.'}
                </small>
                {(failedMessage.failure_class || failedMessage.metadata?.operator_delivery?.failure_class) === 'definite' && (
                  <div className="wa-failure-actions">
                    <button
                      type="button"
                      className="wa-primary-action"
                      disabled={Boolean(busy)}
                      onClick={() => retryMessage(failedMessage)}
                    >
                      <RefreshCw />Intentar nuevamente
                    </button>
                    <button
                      type="button"
                      className="wa-secondary-action"
                      disabled={Boolean(busy)}
                      onClick={() => void dismissFailedMessage(failedMessage)}
                    >
                      <Check />Marcar como revisado
                    </button>
                  </div>
                )}
                {(failedMessage.failure_class || failedMessage.metadata?.operator_delivery?.failure_class) !== 'definite' && (
                  <button
                    type="button"
                    className="wa-secondary-action"
                    disabled={Boolean(busy)}
                    onClick={() => void dismissFailedMessage(failedMessage)}
                  >
                    <Check />Marcar como revisado
                  </button>
                )}
              </section>
            )}
            {activeContext === 'decision' && (
              <section className="wa-context-card wa-decision-panel">
                <header>
                  <span><Sparkles /><strong>Respuesta pendiente</strong></span>
                  <button type="button" onClick={closeContext} aria-label="Cerrar respuesta pendiente"><X /></button>
                </header>
                {(current?.handoff || detail?.handoff) && (
                  <div className="wa-handoff">
                    <strong><ShieldAlert />Necesita atención</strong>
                    <p>{handoffCopy(detail?.handoff?.summary || current?.handoff?.summary)}</p>
                  </div>
                )}
                {proposed ? (
                  <div className="wa-suggestion">
                    <label>Respuesta sugerida<textarea value={suggestion} onChange={(event) => setSuggestion(event.target.value)} disabled={!canReply || !testModeAllowsCurrent || mode === 'shadow' || busy === 'send'} /></label>
                    <button type="button" className="wa-primary-action" onClick={() => void send(suggestion, proposed.id)} disabled={!canReply || !testModeAllowsCurrent || mode === 'shadow' || !suggestion.trim() || busy === 'send'}>
                      <Send />{suggestion === proposed.content ? 'Enviar sugerencia' : 'Enviar respuesta editada'}
                    </button>
                    {mode === 'shadow' && <p>En “Solo observar” podés revisar la sugerencia, pero no enviarla desde aquí. Cambiá a “Ayuda para responder” si querés usarla.</p>}
                  </div>
                ) : (
                  <div className="wa-clear"><Check />No hay respuestas sugeridas pendientes</div>
                )}
                <div className="wa-context-stats">
                  <div><Clock3 /><span>Último mensaje recibido</span><strong>{formatAt(current?.last_inbound_at)}</strong></div>
                  <div><UserRound /><span>Estado</span><strong>{currentStatus.label}</strong></div>
                  <div><MessageCircle /><span>Mensajes</span><strong>{messages.length}</strong></div>
                </div>
              </section>
            )}
          </aside>
        )}
          </>
        )}
      </div>
      {messageInfo && (
        <MessageInfoDialog
          row={messageInfo}
          customerName={contactName(current)}
          onClose={() => setMessageInfo(null)}
        />
      )}
      {messageEdit && (
        <EditMessageDialog
          row={messageEdit.row}
          busy={busy === `edit-message-${messageEdit.row.id}`}
          onConfirm={(content) => void confirmMessageEdit(content)}
          onClose={() => setMessageEdit(null)}
        />
      )}
      {messageDelete && (
        <DeleteMessageDialog
          busy={busy === `delete-message-${messageDelete.row.id}`}
          onConfirm={() => void confirmMessageDelete()}
          onClose={() => setMessageDelete(null)}
        />
      )}
      {conversationArchive && (
        <ArchiveConversationDialog
          customerName={conversationArchive.customerName}
          busy={busy === `archive-conversation-${conversationArchive.phone}`}
          onConfirm={() => void confirmConversationArchive()}
          onClose={() => setConversationArchive(null)}
        />
      )}
      {conversationDelete && (
        <DeleteConversationDialog
          customerName={conversationDelete.customerName}
          phone={formatPhone(conversationDelete.phone)}
          busy={busy === `delete-conversation-${conversationDelete.phone}`}
          onConfirm={(confirmation) => void confirmConversationDelete(confirmation)}
          onClose={() => setConversationDelete(null)}
        />
      )}
      {imageGallery && (
        <ImageGallery
          items={conversationImages}
          initialId={imageGallery.initialId}
          initialData={imageGallery.initialData}
          onClose={() => setImageGallery(null)}
        />
      )}
      {documentViewer && (
        <DocumentViewer
          attachment={documentViewer.attachment}
          data={documentViewer.data}
          onClose={() => setDocumentViewer(null)}
        />
      )}
      {botSettingsOpen && (
        <WhatsAppBotSettingsPanel
          key={botSettings?.version || 'bot-settings'}
          value={botSettings?.data || {}}
          version={botSettings?.version || null}
          mode={selectedMode}
          botOff={off}
          canManageMode={canMode}
          canManageCentralMachine={isSystemRole}
          centralMachine={centralMachine}
          centralCandidate={centralCandidate}
          centralMachineLoading={centralMachineLoading}
          centralMachineBusy={busy === 'claim-central-machine'}
          centralMachineError={centralMachineActionError}
          canReviewDeviceAccess={canReviewDeviceAccess}
          deviceAccessRequests={deviceAccessRequests}
          deviceAccessLoading={deviceAccessLoading}
          deviceAccessBusy={deviceAccessBusy}
          deviceAccessError={deviceAccessError}
          modeBusy={String(busy || '').startsWith('mode-')}
          businessProfileReady={overview?.businessProfileReady !== false}
          testMode={overview?.testMode || { enabled: false, phone: '' }}
          selectedPhone={phone}
          selectedContactName={current ? contactName(current) : ''}
          testModeBusy={busy === 'test-mode'}
          initialTestMessage={String(latestInboundMessage?.content || '')}
          loading={botSettingsLoading}
          loadError={botSettingsLoadError}
          busy={busy === 'save-bot-settings'}
          onModeChange={(nextMode) => void action(`mode-${nextMode}`, () => whatsappOperator.setMode(nextMode))}
          onTestModeChange={(next) => void action('test-mode', () => whatsappOperator.setTestMode(next))}
          onClaimCentralMachine={() => void claimCentralMachine()}
          onRefreshCentralMachine={() => void refreshCentralMachineState()}
          onRefreshDeviceAccess={() => void refreshDeviceAccess()}
          onReviewDeviceAccess={(requestId, decision) => void reviewDeviceAccess(requestId, decision)}
          onPreview={(options) => whatsappOperator.previewBotReply(options)}
          onRetry={() => void openBotSettings()}
          onSave={saveBotSettings}
          onClose={() => setBotSettingsOpen(false)}
        />
      )}
    </section>
  );
}
