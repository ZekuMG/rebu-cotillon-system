import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Activity,
  AlertCircle,
  Archive,
  Bot,
  Check,
  ChevronDown,
  ChevronLeft,
  Download,
  FileText,
  FlaskConical,
  Loader2,
  Laptop,
  RefreshCw,
  Server,
  ShieldCheck,
  Smartphone,
  Sparkles,
  X,
} from 'lucide-react';
import {
  CLEAN_START_CONFIRM,
  describeHistoryWindow,
  describeImportResult,
  explicacionDelTelefono,
  importButtonLabel,
  olderButtonLabel,
} from '../utils/historyWindow';

const DEFAULT_VALUE = {
  identity: { name: 'Blacky', role: 'asistente virtual de Rebu' },
  voice: {
    tone: 'cheerful',
    address_style: 'vos',
    reply_length: 'brief',
    emoji_level: 'low',
    // Los matices arrancan en el valor que describe cómo escribe Blacky hoy:
    // dejarlos así no le agrega ninguna instrucción al bot.
    slang_level: 'natural',
    follow_up: 'light',
    closing_style: 'neutral',
  },
  messages: {
    welcome_options: 'Puedo ayudarte con una consulta rápida o, si preferís, podés pedirme hablar con una persona del equipo.',
    human_handoff: '¡Claro! Ya le paso tu conversación al equipo 😊 Ahora solo queda esperar un poquito:',
    uncertain_answer: 'No quiero darte una respuesta incorrecta. Ya dejo tu consulta al equipo para que pueda confirmarla.',
  },
  capabilities: {
    catalog_search: true,
    share_prices: true,
    share_stock: true,
    send_photos: true,
    prepare_budgets: true,
    auto_intents: ['greeting', 'product_search', 'price_stock', 'hours', 'payment', 'order_info'],
  },
  guidance: {
    business_context: '',
    always_do: [],
    never_say: [],
    handoff_triggers: [],
  },
};

const asObject = (value) => (
  value && typeof value === 'object' && !Array.isArray(value) ? value : {}
);

const formValue = (value) => {
  const input = asObject(value);
  return {
    identity: { ...DEFAULT_VALUE.identity, ...asObject(input.identity) },
    voice: { ...DEFAULT_VALUE.voice, ...asObject(input.voice) },
    messages: { ...DEFAULT_VALUE.messages, ...asObject(input.messages) },
    capabilities: {
      ...DEFAULT_VALUE.capabilities,
      ...asObject(input.capabilities),
      auto_intents: Array.isArray(input.capabilities?.auto_intents)
        ? input.capabilities.auto_intents
        : DEFAULT_VALUE.capabilities.auto_intents,
    },
    guidance: {
      ...DEFAULT_VALUE.guidance,
      ...asObject(input.guidance),
      always_do: Array.isArray(input.guidance?.always_do) ? input.guidance.always_do : [],
      never_say: Array.isArray(input.guidance?.never_say) ? input.guidance.never_say : [],
      handoff_triggers: Array.isArray(input.guidance?.handoff_triggers) ? input.guidance.handoff_triggers : [],
    },
  };
};

const listText = (value) => (Array.isArray(value) ? value.join('\n') : '');
const parseList = (value) => [...new Set(String(value || '')
  .split('\n')
  .map((entry) => entry.trim())
  .filter(Boolean))];

const createRuleDraft = (value) => ({
  always_do: listText(value.guidance.always_do),
  never_say: listText(value.guidance.never_say),
  handoff_triggers: listText(value.guidance.handoff_triggers),
});

const payloadFromDraft = (draft, ruleDraft) => ({
  ...draft,
  guidance: {
    ...draft.guidance,
    always_do: parseList(ruleDraft.always_do),
    never_say: parseList(ruleDraft.never_say),
    handoff_triggers: parseList(ruleDraft.handoff_triggers),
  },
});

// Tres secciones, no siete pasos. Antes la nav numeraba de 1 a 7 y cada sección
// repetía el número en grande: un panel de ajustes sueltos, que se tocan en
// cualquier orden, parecía un asistente que había que completar en orden.
const SECTIONS = [
  { id: 'mode', label: 'Funcionamiento', help: 'Cuándo responde' },
  { id: 'voice', label: 'Personalidad', help: 'Cómo se presenta y qué dice' },
  { id: 'rules', label: 'Reglas y permisos', help: 'Qué puede hacer y qué no' },
];

// `identity`+`messages` ahora son `voice`, y `capabilities`+`limits` son
// `rules`. Cualquier entrada externa con un id viejo tiene que caer en la
// sección nueva y no en un panel en blanco.
const LEGACY_SECTIONS = {
  identity: 'voice',
  messages: 'voice',
  capabilities: 'rules',
  limits: 'rules',
};

const resolveSection = (id) => LEGACY_SECTIONS[id] || id || 'mode';

// Central e historial no son "configurar a Blacky": son el equipo y el número.
// Por eso salen de la nav y viven como accesos aparte, en el pie.
const CENTRAL_SECTION = {
  id: 'central',
  label: 'Máquina central',
  help: 'Equipo que mantiene WhatsApp activo',
};

// Antes esto era un cartel en la bandeja cuyo botón decía que traía las
// conversaciones del número y en realidad sólo movía una fecha sobre lo que ya
// estaba guardado acá. Acá adentro se puede hacer las dos cosas, separadas y
// con nombre propio.
const HISTORY_SECTION = {
  id: 'history',
  label: 'Historial del número',
  help: 'Qué conversaciones se ven',
};

const MODE_OPTIONS = [
  {
    id: 'auto',
    label: 'Respuestas automáticas',
    help: 'Blacky responde por su cuenta únicamente las consultas y temas autorizados.',
    available: true,
  },
  {
    id: 'copilot',
    label: 'Ayuda para responder',
    help: 'Prepara tres respuestas para que una persona elija, edite y envíe.',
    available: true,
  },
  {
    id: 'shadow',
    label: 'Solo observar',
    help: 'Analizaba los mensajes sin enviar respuestas por su cuenta.',
    available: false,
  },
];

// La app propone, el bot dispone: cada valor de acá tiene que estar también en
// BOT_VOICE_CHOICES y en VOICE_INSTRUCTIONS (src/bot-behavior.js del bot). Si
// falta en la lista blanca, el bot lo reemplaza en silencio por el default: el
// dueño lo elige, lo ve guardado y Blacky sigue escribiendo igual.
const CHOICES = {
  tone: [
    ['cheerful', 'Alegre'],
    ['playful', 'Divertido'],
    ['festive', 'Fiestero'],
    ['youthful', 'Juvenil'],
    ['warm', 'Cálido'],
    ['professional', 'Profesional'],
    ['formal', 'Formal'],
  ],
  address_style: [['vos', 'Voseo'], ['tu', 'Tuteo neutro'], ['usted', 'Usted'], ['mirror', 'Como el cliente']],
  reply_length: [['ultra_brief', 'De una línea'], ['brief', 'Breves'], ['balanced', 'Equilibradas'], ['detailed', 'Detalladas']],
  emoji_level: [['none', 'Sin emojis'], ['low', 'Pocos'], ['medium', 'Moderados'], ['high', 'Muchos'], ['very_high', 'De fiesta']],
  slang_level: [['neutral', 'Neutro'], ['natural', 'Los justos'], ['high', 'Bien argentino']],
  follow_up: [['minimal', 'Casi ninguna'], ['light', 'Las justas'], ['active', 'Siempre una']],
  closing_style: [['neutral', 'Sin cierre fijo'], ['warm', 'Cálida'], ['festive', 'De fiesta'], ['invite', 'Invita al local']],
};

const CHOICE_LABELS = Object.fromEntries(
  Object.entries(CHOICES).map(([key, values]) => [key, Object.fromEntries(values)]),
);

const CAPABILITIES = [
  ['catalog_search', 'Buscar en el catálogo', 'Usa productos reales de Rebu para responder.'],
  ['share_prices', 'Informar precios', 'Solo utiliza valores devueltos por el catálogo.'],
  ['share_stock', 'Informar disponibilidad', 'Solo confirma stock cuando la coincidencia es confiable.'],
  ['send_photos', 'Proponer fotos', 'Busca imágenes disponibles y las deja listas para enviar.'],
  ['prepare_budgets', 'Preparar presupuestos', 'Crea un borrador que siempre revisa una persona.'],
];

const AUTO_TOPICS = [
  ['greeting', 'Saludos'],
  ['product_search', 'Productos'],
  ['price_stock', 'Precios y stock'],
  ['hours', 'Horarios'],
  ['payment', 'Medios de pago'],
  ['order_info', 'Retiros y envíos'],
];

// Encabezado de las dos herramientas que ya no son pasos de la nav. Necesitan
// título propio (la nav no las nombra) y una forma clara de volver.
function ToolHead({ title, detail, onBack }) {
  return (
    <div className="wa-bot-tool-head">
      <button type="button" onClick={onBack} aria-label="Volver a la configuración" title="Volver a la configuración">
        <ChevronLeft />
      </button>
      <div><strong>{title}</strong>{detail && <small>{detail}</small>}</div>
    </div>
  );
}

function ChoiceRow({ value, options, onChange, label }) {
  const [open, setOpen] = useState(false);
  const fieldRef = useRef(null);
  const listId = useId();
  const selectedLabel = options.find(([id]) => id === value)?.[1] || 'Elegir';

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsideClick = (event) => {
      if (!fieldRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('click', closeOnOutsideClick);
    return () => document.removeEventListener('click', closeOnOutsideClick);
  }, [open]);

  return (
    <div
      ref={fieldRef}
      className={`wa-bot-choice-field ${open ? 'open' : ''}`}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !open) return;
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
      }}
    >
      <span>{label}</span>
      <button
        type="button"
        className="wa-bot-choice-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((current) => !current)}
      >
        <strong>{selectedLabel}</strong>
        <ChevronDown />
      </button>
      {open && <div id={listId} className="wa-bot-choice-menu" role="listbox" aria-label={label}>
        {options.map(([id, text]) => (
          <button
            key={id}
            type="button"
            role="option"
            className={value === id ? 'active' : ''}
            aria-selected={value === id}
            onClick={() => {
              onChange(id);
              setOpen(false);
            }}
          ><span>{text}</span>{value === id && <Check />}</button>
        ))}
      </div>}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="wa-bot-modal-state" role="status">
      <span><Loader2 className="animate-spin" /></span>
      <strong>Cargando la configuración de Blacky</strong>
      <small>Estamos buscando la última versión guardada.</small>
    </div>
  );
}

function ErrorState({ onRetry }) {
  return (
    <div className="wa-bot-modal-state error" role="alert">
      <span><AlertCircle /></span>
      <strong>No pudimos abrir la configuración</strong>
      <small>La bandeja sigue funcionando. Podés volver a intentar sin perder conversaciones.</small>
      <button type="button" className="wa-secondary-action" onClick={onRetry}><RefreshCw />Volver a intentar</button>
    </div>
  );
}

export default function WhatsAppBotSettingsPanel({
  value,
  version,
  mode = 'auto',
  botOff = false,
  canManageMode = false,
  modeBusy = false,
  businessProfileReady = true,
  testMode = { enabled: false, phone: '' },
  selectedPhone = '',
  selectedContactName = '',
  testModeBusy = false,
  canManageCentralMachine = false,
  centralMachine = null,
  centralCandidate = null,
  centralMachineLoading = false,
  centralMachineBusy = false,
  centralMachineError = '',
  canReviewDeviceAccess = false,
  deviceAccessRequests = [],
  deviceAccessLoading = false,
  deviceAccessBusy = '',
  deviceAccessError = '',
  initialSection = '',
  canManageHistory = false,
  historyWindow = null,
  historyLoading = false,
  historyBusy = '',
  historyError = '',
  historyResult = null,
  onRefreshHistory,
  onImportChats,
  onSetHistoryWindow,
  onLoadOlderConversations,
  initialTestMessage = '',
  loading = false,
  loadError = false,
  busy = false,
  onModeChange,
  onTestModeChange,
  onClaimCentralMachine,
  onRefreshCentralMachine,
  onRefreshDeviceAccess,
  onReviewDeviceAccess,
  onPreview,
  onRetry,
  onSave,
  onClose,
}) {
  const initialDraft = useMemo(() => formValue(value), [value]);
  const initialRuleDraft = useMemo(() => createRuleDraft(initialDraft), [initialDraft]);
  const [section, setSection] = useState(resolveSection(initialSection));
  const [draft, setDraft] = useState(initialDraft);
  const [ruleDraft, setRuleDraft] = useState(initialRuleDraft);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [testMessage, setTestMessage] = useState(String(initialTestMessage || '').slice(0, 4000));
  const [testSuggestions, setTestSuggestions] = useState([]);
  const [testSuggestionIndex, setTestSuggestionIndex] = useState(0);
  const [testLoading, setTestLoading] = useState(false);
  const [testError, setTestError] = useState('');
  const [editingTestPhone, setEditingTestPhone] = useState(null);
  const [confirmCentralTransfer, setConfirmCentralTransfer] = useState(false);
  // Cuánto traer del teléfono por vez. El bot topea en 50 y 200 igual.
  const [importSize, setImportSize] = useState(10);
  const [messagesPerChat, setMessagesPerChat] = useState(50);
  const modalRef = useRef(null);
  const titleRef = useRef(null);
  const centralConfirmRef = useRef(null);
  const requestCloseRef = useRef(null);
  const previousFocusRef = useRef(null);

  const payload = useMemo(() => payloadFromDraft(draft, ruleDraft), [draft, ruleDraft]);
  const previewProfileKey = useMemo(() => JSON.stringify(payload), [payload]);
  const originalPayload = useMemo(
    () => payloadFromDraft(initialDraft, initialRuleDraft),
    [initialDraft, initialRuleDraft],
  );
  const dirty = JSON.stringify(payload) !== JSON.stringify(originalPayload);
  const visibleSections = SECTIONS;
  // Accesos del pie: el equipo y el número, no la personalidad del bot.
  const toolSections = useMemo(
    () => [
      ...(canManageHistory ? [HISTORY_SECTION] : []),
      ...(canManageCentralMachine ? [CENTRAL_SECTION] : []),
    ],
    [canManageCentralMachine, canManageHistory],
  );
  const toolSection = toolSections.find(({ id }) => id === section) || null;
  const assignedCentralMachine = centralMachine?.machine || null;
  const isThisCentralMachine = Boolean(
    assignedCentralMachine?.device_id
    && centralCandidate?.deviceId
    && assignedCentralMachine.device_id === centralCandidate.deviceId,
  );
  const centralServiceRunning = centralCandidate?.localServiceRunning === true;
  const centralServiceReady = centralCandidate?.localServiceReady === true;
  const centralWhatsappConnected = centralCandidate?.whatsappConnected === true;
  const centralSupported = centralCandidate?.supported !== false;
  const centralStatusAvailable = centralMachine?.available !== false && !centralMachine?.error;
  const centralLeaseActive = centralMachine?.lease_active === true;
  const centralLeaseExpired = Boolean(assignedCentralMachine && !centralLeaseActive);
  const remoteCentralActive = Boolean(
    assignedCentralMachine
    && !isThisCentralMachine
    && centralLeaseActive,
  );
  const centralHeartbeatLabel = assignedCentralMachine?.heartbeat_at
    ? new Date(assignedCentralMachine.heartbeat_at).toLocaleTimeString('es-AR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    : '';
  const effectiveBusy = busy || centralMachineBusy;
  const pendingDeviceAccessCount = deviceAccessRequests.filter((request) => request.status === 'pending').length;

  const update = (group, patch) => setDraft((current) => ({
    ...current,
    [group]: { ...current[group], ...patch },
  }));

  const requestClose = useCallback(() => {
    if (effectiveBusy) return;
    if (dirty) setConfirmDiscard(true);
    else onClose();
  }, [dirty, effectiveBusy, onClose]);

  useEffect(() => {
    requestCloseRef.current = requestClose;
  }, [requestClose]);

  useEffect(() => {
    previousFocusRef.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    titleRef.current?.focus();
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        requestCloseRef.current?.();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = [...(modalRef.current?.querySelectorAll(
        'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
      ) || [])].filter((element) => element.getClientRects().length > 0);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!modalRef.current?.contains(document.activeElement) || document.activeElement === titleRef.current) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus?.();
    };
  }, []);

  useEffect(() => {
    if (!canManageCentralMachine && section === 'central') setSection('mode');
    if (!canManageHistory && section === 'history') setSection('mode');
  }, [canManageCentralMachine, canManageHistory, section]);

  // --- Historial del número ---------------------------------------------
  const historyState = useMemo(() => {
    const estado = describeHistoryWindow(historyWindow);
    return { ...estado, decidedBy: historyWindow?.decided_by_name || '' };
  }, [historyWindow]);

  const importOutcome = useMemo(
    () => (historyResult ? describeImportResult(historyResult) : null),
    [historyResult],
  );

  const ocultasTexto = useMemo(() => {
    const ocultas = Number(historyWindow?.ocultas);
    // Sin el número no se inventa: "algunas" es honesto y no asusta.
    if (!Number.isFinite(ocultas) || ocultas <= 0) return 'conversaciones';
    return `${ocultas} ${ocultas === 1 ? 'conversación' : 'conversaciones'}`;
  }, [historyWindow]);

  // El estado del historial se pide al ENTRAR a la sección, no al abrir el
  // panel: consultar a WhatsApp cuesta y la mayoría de las veces se viene acá
  // por otra cosa.
  //
  // ⚠️ La función va por ref a propósito. El padre la pasa como arrow inline,
  // así que cambia de identidad en cada render; ponerla en las dependencias
  // hacía que el efecto se disparara solo, sin fin: consulta → setState en el
  // padre → render → nueva identidad → consulta.
  const refreshHistoryRef = useRef(onRefreshHistory);
  refreshHistoryRef.current = onRefreshHistory;
  useEffect(() => {
    if (section === 'history' && canManageHistory) refreshHistoryRef.current?.();
  }, [section, canManageHistory]);

  useEffect(() => {
    if (confirmCentralTransfer) centralConfirmRef.current?.focus();
  }, [confirmCentralTransfer]);

  useEffect(() => {
    setTestSuggestions([]);
    setTestSuggestionIndex(0);
    setTestError('');
  }, [previewProfileKey]);

  const changeTestMessage = (message) => {
    setTestMessage(message.slice(0, 4000));
    setTestSuggestions([]);
    setTestSuggestionIndex(0);
    setTestError('');
  };

  const runPreview = async () => {
    const message = testMessage.trim();
    if (!message || testLoading || typeof onPreview !== 'function') return;
    setTestLoading(true);
    setTestError('');
    try {
      const result = await onPreview({ message, behavior: payload, phone: selectedTestPhone });
      const suggestions = Array.isArray(result?.suggestions)
        ? result.suggestions.map((entry) => String(entry || '').trim()).filter(Boolean).slice(0, 3)
        : [];
      if (!suggestions.length) throw new Error('empty preview');
      setTestSuggestions(suggestions);
      setTestSuggestionIndex(0);
    } catch (error) {
      setTestSuggestions([]);
      setTestError(error?.code === 'test_mode_other_phone'
        ? 'Esta conversación está bloqueada por el Modo test. Usá el número autorizado o cambialo desde Funcionamiento.'
        : 'No pudimos generar la prueba. Revisá que la API del bot esté conectada e intentá nuevamente.');
    } finally {
      setTestLoading(false);
    }
  };

  const generateAnotherPreview = () => {
    if (testSuggestionIndex < testSuggestions.length - 1) {
      setTestSuggestionIndex((index) => index + 1);
      return;
    }
    void runPreview();
  };

  const toggleCapability = (key) => update('capabilities', {
    [key]: !draft.capabilities[key],
  });
  const toggleIntent = (intent) => update('capabilities', {
    auto_intents: draft.capabilities.auto_intents.includes(intent)
      ? draft.capabilities.auto_intents.filter((entry) => entry !== intent)
      : [...draft.capabilities.auto_intents, intent],
  });
  const automationActive = !botOff && mode === 'auto';
  const copilotActive = !botOff && mode === 'copilot';
  const availableModeActive = automationActive || copilotActive;
  const testModeEnabled = Boolean(testMode?.enabled);
  const testModePhone = String(testMode?.phone || '');
  const selectedTestPhone = String(selectedPhone || '');
  const selectedPhoneAllowed = !testModeEnabled || (
    Boolean(testModePhone) && testModePhone === selectedTestPhone
  );

  return createPortal(
    <div
      className="wa-bot-settings-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) requestClose();
      }}
    >
      <section
        ref={modalRef}
        className="wa-bot-settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wa-bot-settings-title"
      >
        <header className="wa-bot-modal-header">
          <div className="wa-bot-modal-heading">
            <span><Bot /></span>
            <div>
              <strong id="wa-bot-settings-title" ref={titleRef} tabIndex="-1">Configurar Blacky</strong>
              <small>Funcionamiento, personalidad y reglas.</small>
            </div>
          </div>
          <div className="wa-bot-modal-version">
            <span title={version ? `Versión ${version}` : undefined}>Perfil de Blacky</span>
            <button type="button" onClick={requestClose} aria-label="Cerrar configuración del bot"><X /></button>
          </div>
        </header>

        {loading ? <LoadingState /> : loadError ? <ErrorState onRetry={onRetry} /> : (
          <>
            <div className={`wa-bot-modal-body ${toolSection ? 'tool-focus' : ''}`}>
              <nav className="wa-bot-settings-nav" aria-label="Secciones de configuración">
                {visibleSections.map(({ id, label, help }) => (
                  <button
                    key={id}
                    type="button"
                    className={section === id ? 'active' : ''}
                    aria-current={section === id ? 'true' : undefined}
                    onClick={() => setSection(id)}
                  >
                    <span><strong>{label}</strong><small>{help}</small></span>
                  </button>
                ))}
              </nav>

              <main className="wa-bot-settings-content">
                {section === 'mode' && (
                  <div className="wa-bot-settings-section">
                    <div className={`wa-bot-current-state ${availableModeActive ? 'on' : 'off'}`}>
                      <i aria-hidden="true" />
                      <span>
                        <strong>{botOff ? 'Blacky está apagado' : automationActive ? 'Blacky responde automáticamente' : copilotActive ? 'Blacky ayuda a preparar respuestas' : 'El modo actual quedó pausado'}</strong>
                        <small>{botOff ? 'Encendelo desde el interruptor de la bandeja para que pueda trabajar.' : automationActive ? 'Solo responde temas permitidos y deriva lo que necesite una persona.' : copilotActive ? 'Genera tres opciones, pero nada se envía hasta que una persona elige o edita una.' : 'Elegí un modo disponible para continuar usando el bot.'}</small>
                      </span>
                    </div>

                    <section className={`wa-bot-test-mode ${testModeEnabled ? selectedPhoneAllowed ? 'active' : 'limited' : ''}`}>
                      <header>
                        <span><FlaskConical /></span>
                        <div>
                          <strong>Modo test</strong>
                          <small>Blacky trabaja en una sola conversación.</small>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-label="Activar o desactivar Modo test"
                          aria-checked={testModeEnabled}
                          className={`wa-bot-test-switch ${testModeEnabled ? 'on' : ''}`}
                          disabled={!canManageMode || testModeBusy || (!testModeEnabled && !selectedTestPhone)}
                          onClick={() => onTestModeChange?.({
                            enabled: !testModeEnabled,
                            phone: !testModeEnabled ? selectedTestPhone : '',
                          })}
                        ><i /></button>
                      </header>
                      {testModeEnabled ? (
                        <div className="wa-bot-test-target">
                          <span>
                            <small>Número autorizado</small>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px' }}>
                              <input
                                value={editingTestPhone !== null ? editingTestPhone : testModePhone}
                                onChange={(e) => setEditingTestPhone(e.target.value.replace(/\D/g, ''))}
                                disabled={!canManageMode || testModeBusy}
                                placeholder="Ej: 5491122334455"
                                style={{ background: 'var(--bg-light, #f8f9fa)', border: '1px solid var(--border, #e5e7eb)', borderRadius: '6px', padding: '6px 12px', color: 'inherit', fontSize: '0.875rem', width: '160px', outline: 'none' }}
                              />
                              {(editingTestPhone !== null && editingTestPhone !== testModePhone) ? (
                                <button
                                  type="button"
                                  className="wa-primary-action"
                                  style={{ padding: '6px 12px', fontSize: '0.875rem' }}
                                  disabled={!canManageMode || testModeBusy || !editingTestPhone.trim() || editingTestPhone.trim().length < 8}
                                  onClick={() => {
                                    onTestModeChange?.({ enabled: true, phone: editingTestPhone.trim() });
                                    setEditingTestPhone(null);
                                  }}
                                >Guardar</button>
                              ) : !selectedPhoneAllowed && selectedTestPhone ? (
                                <button
                                  type="button"
                                  disabled={!canManageMode || testModeBusy}
                                  onClick={() => {
                                    onTestModeChange?.({ enabled: true, phone: selectedTestPhone });
                                    setEditingTestPhone(null);
                                  }}
                                >Usar {selectedContactName || 'este chat'}</button>
                              ) : null}
                            </div>
                          </span>
                        </div>
                      ) : (
                        <p>{selectedTestPhone
                          ? `Si lo activás ahora, solo podrá trabajar con ${selectedContactName || selectedTestPhone}.`
                          : 'Seleccioná primero la conversación que querés usar para las pruebas.'}</p>
                      )}
                      {testModeEnabled && (
                        <p>Los otros chats seguirán recibiendo mensajes, pero Blacky no los leerá, responderá ni generará sugerencias hasta que desactives este modo.</p>
                      )}
                    </section>

                    <div className="wa-bot-mode-field">
                      <div>
                        <strong>Tipo de respuesta</strong>
                        <small>Se aplica al instante, sin Guardar.</small>
                      </div>
                      <div className="wa-bot-mode-options" role="group" aria-label="Tipo de respuesta de Blacky">
                        {MODE_OPTIONS.map((option) => {
                          const active = option.available && !botOff && mode === option.id;
                          const disabled = !option.available || botOff || !canManageMode || modeBusy;
                          return (
                            <button
                              key={option.id}
                              type="button"
                              className={`${active ? 'active' : ''} ${!option.available ? 'paused' : ''}`.trim()}
                              aria-pressed={active}
                              disabled={disabled}
                              onClick={() => onModeChange?.(option.id)}
                            >
                              <span><strong>{option.label}</strong><small>{option.help}</small></span>
                              <em>{option.available ? active ? 'Activo' : 'Elegir' : 'Pausado'}</em>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {!businessProfileReady && (
                      <div className="wa-bot-mode-notice warning" role="status">
                        <AlertCircle />
                        <span><strong>Faltan datos del negocio</strong><small>Algunas consultas se derivarán hasta completarlos.</small></span>
                      </div>
                    )}
                    <div className="wa-bot-mode-notice">
                      <ShieldCheck />
                      <span><strong>La atención humana siempre está disponible</strong><small>Si el cliente pide una persona, el chat queda marcado para revisión.</small></span>
                    </div>
                  </div>
                )}

                {canManageCentralMachine && section === 'central' && (
                  <div className="wa-bot-settings-section wa-central-machine-section">
                    <ToolHead
                      title="Máquina central de WhatsApp"
                      detail="La PC que mantiene la conexión y los envíos. Solo Sistema puede cambiarla."
                      onBack={() => setSection('mode')}
                    />

                    <section className={`wa-central-station ${centralLeaseExpired ? 'stale' : isThisCentralMachine ? 'current' : assignedCentralMachine ? 'remote' : 'empty'}`}>
                      <header>
                        <span><Server /></span>
                        <div>
                          <small>Central asignada</small>
                          <strong>{assignedCentralMachine?.device_name || 'Todavía no hay una PC central'}</strong>
                          <p>{assignedCentralMachine
                            ? `${assignedCentralMachine.platform || 'Equipo de escritorio'}${assignedCentralMachine.ip_address ? ` · ${assignedCentralMachine.ip_address}` : ''}`
                            : 'Comprobá esta PC y asignala para completar la configuración.'}</p>
                        </div>
                        <em>{centralLeaseExpired ? 'Pulso vencido' : isThisCentralMachine ? 'Esta PC · activa' : assignedCentralMachine ? 'Otra PC · activa' : 'Sin asignar'}</em>
                      </header>

                      <div className={`wa-central-pulse ${centralLeaseActive ? 'active' : centralLeaseExpired ? 'expired' : ''}`} role="status">
                        <Activity />
                        <span><strong>{centralLeaseActive ? 'Pulso central activo' : centralLeaseExpired ? 'La concesión central venció' : 'Esperando la primera asignación'}</strong><small>{centralLeaseActive
                          ? `Última señal ${centralHeartbeatLabel || 'recién'} · se renueva automáticamente`
                          : centralLeaseExpired
                            ? `Última señal ${centralHeartbeatLabel || 'no disponible'} · esta PC ya no debe procesar mensajes`
                            : 'Al establecer una PC, su bot renovará el control cada pocos segundos.'}</small></span>
                      </div>

                      <div className="wa-central-local-checks">
                        <span className={centralCandidate ? 'ok' : ''}>
                          <i />
                          <span><strong>{centralCandidate?.deviceName || 'Comprobando equipo'}</strong><small>Identidad de esta PC</small></span>
                        </span>
                        <span className={centralServiceRunning ? 'ok' : 'error'}>
                          <i />
                          <span><strong>{centralServiceRunning ? 'Servicio iniciado' : 'No instalado en esta PC'}</strong><small>Servidor local (sólo necesario en la central)</small></span>
                        </span>
                        <span className={centralServiceReady ? 'ok' : 'warning'}>
                          <i />
                          <span><strong>{centralServiceReady ? 'Dependencias listas' : 'Revisión pendiente'}</strong><small>Supabase y Evolution</small></span>
                        </span>
                        <span className={centralWhatsappConnected ? 'ok' : 'warning'}>
                          <i />
                          <span><strong>{centralWhatsappConnected ? 'WhatsApp conectado' : 'WhatsApp desconectado'}</strong><small>Sesión de Evolution en esta PC</small></span>
                        </span>
                      </div>
                    </section>

                    {centralMachineError ? (
                      <div className="wa-bot-mode-notice error" role="alert">
                        <AlertCircle />
                        <span><strong>No se completó la transferencia</strong><small>{centralMachineError}</small></span>
                      </div>
                    ) : centralMachineLoading && !centralCandidate ? (
                      <div className="wa-bot-mode-notice" role="status">
                        <Loader2 className="animate-spin" />
                        <span><strong>Comprobando esta PC</strong><small>Rebu está revisando el servicio local y la central actualmente asignada.</small></span>
                      </div>
                    ) : !centralStatusAvailable ? (
                      <div className="wa-bot-mode-notice warning" role="status">
                        <AlertCircle />
                        <span><strong>No pudimos consultar la central asignada</strong><small>Actualizá el estado antes de transferirla para evitar reemplazar una configuración más reciente.</small></span>
                      </div>
                    ) : !centralSupported ? (
                      <div className="wa-bot-mode-notice warning" role="status">
                        <AlertCircle />
                        <span><strong>Esta opción necesita la app de escritorio</strong><small>Abrí Rebu desde Electron para identificar y comprobar esta PC.</small></span>
                      </div>
                    ) : remoteCentralActive ? (
                      <div className="wa-bot-mode-notice" role="status">
                        <ShieldCheck />
                        <span><strong>Esta PC funciona como puesto remoto</strong><small>Accede a WhatsApp por Tailscale. No necesita Docker ni Evolution; esos servicios permanecen únicamente en {assignedCentralMachine?.device_name || 'la central'}.</small></span>
                      </div>
                    ) : !centralServiceRunning || !centralServiceReady ? (
                      <div className="wa-bot-mode-notice warning" role="status">
                        <AlertCircle />
                        <span><strong>El servidor local todavía no está listo</strong><small>Esperá a que el proceso, Supabase y Evolution respondan correctamente antes de transferir la central.</small></span>
                      </div>
                    ) : !centralWhatsappConnected ? (
                      <div className="wa-bot-mode-notice warning" role="status">
                        <AlertCircle />
                        <span><strong>WhatsApp todavía no está conectado</strong><small>Conectá la sesión de Evolution en esta PC antes de transferir o reactivar la central.</small></span>
                      </div>
                    ) : centralLeaseExpired ? (
                      <div className="wa-bot-mode-notice warning" role="status">
                        <AlertCircle />
                        <span><strong>La central dejó de renovar su pulso</strong><small>{isThisCentralMachine ? 'Reactivá esta PC para que el bot vuelva a procesar mensajes.' : 'Podés transferir el control a esta PC de forma segura.'}</small></span>
                      </div>
                    ) : (
                      <div className="wa-bot-mode-notice" role="status">
                        <ShieldCheck />
                        <span><strong>Cambio protegido</strong><small>La asignación es exclusiva. Si otra PC tomó el control mientras esta ventana estaba abierta, Rebu cancelará el cambio y pedirá actualizar.</small></span>
                      </div>
                    )}

                    {confirmCentralTransfer ? (
                      <div className="wa-central-transfer-confirm" role="alertdialog" aria-label="Confirmar transferencia de la máquina central">
                        <span><AlertCircle /><span><strong>{isThisCentralMachine ? 'Reactivar esta PC como central' : 'Transferir la central a esta PC'}</strong><small>{isThisCentralMachine
                          ? 'Esta PC volverá a renovar el pulso y podrá procesar mensajes.'
                          : assignedCentralMachine
                            ? `${assignedCentralMachine.device_name} dejará de figurar como central de WhatsApp.`
                          : 'Esta PC quedará registrada como la central de WhatsApp.'}</small></span></span>
                        <div>
                          <button type="button" className="wa-secondary-action" disabled={centralMachineBusy} onClick={() => setConfirmCentralTransfer(false)}>Cancelar</button>
                          <button
                            ref={centralConfirmRef}
                            type="button"
                            className="wa-primary-action"
                            disabled={centralMachineBusy}
                            onClick={() => {
                              setConfirmCentralTransfer(false);
                              onClaimCentralMachine?.();
                            }}
                          >{centralMachineBusy ? <Loader2 className="animate-spin" /> : <Server />}{centralMachineBusy ? 'Estableciendo…' : 'Sí, establecer esta PC'}</button>
                        </div>
                      </div>
                    ) : (
                      <div className="wa-central-actions">
                        <button type="button" className="wa-secondary-action" disabled={centralMachineLoading || centralMachineBusy} onClick={() => onRefreshCentralMachine?.()}>
                          {centralMachineLoading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                          {centralMachineLoading ? 'Comprobando…' : 'Comprobar de nuevo'}
                        </button>
                        <button
                          type="button"
                          className="wa-primary-action"
                          disabled={!centralStatusAvailable || !centralSupported || !centralServiceRunning || !centralServiceReady || !centralWhatsappConnected || (isThisCentralMachine && centralLeaseActive) || centralMachineBusy}
                          onClick={() => setConfirmCentralTransfer(true)}
                        >{centralMachineBusy ? <Loader2 className="animate-spin" /> : <Server />}{centralMachineBusy ? 'Estableciendo…' : isThisCentralMachine && centralLeaseActive ? 'Esta PC ya es la central' : isThisCentralMachine ? 'Reactivar esta PC' : 'Establecer esta PC como central'}</button>
                      </div>
                    )}

                    {canReviewDeviceAccess && (
                      <section className="wa-device-approval-queue" aria-label="Solicitudes de acceso a WhatsApp">
                        <header>
                          <span><Laptop /></span>
                          <div>
                            <strong>Dispositivos autorizados</strong>
                            <small>La aprobación permite usar esta cuenta desde Rebu. Docker y Evolution siguen solamente en la central.</small>
                          </div>
                          <em>{pendingDeviceAccessCount ? `${pendingDeviceAccessCount} pendiente${pendingDeviceAccessCount === 1 ? '' : 's'}` : 'Sin pendientes'}</em>
                        </header>

                        {deviceAccessError && (
                          <div className="wa-bot-mode-notice error" role="alert">
                            <AlertCircle />
                            <span><strong>No pudimos actualizar los accesos</strong><small>{deviceAccessError}</small></span>
                          </div>
                        )}

                        <div className="wa-device-approval-list">
                          {deviceAccessLoading && deviceAccessRequests.length === 0 ? (
                            <div className="wa-device-approval-empty"><Loader2 className="animate-spin" />Comprobando dispositivos…</div>
                          ) : deviceAccessRequests.length === 0 ? (
                            <div className="wa-device-approval-empty"><ShieldCheck />Todavía no hay solicitudes de otros dispositivos.</div>
                          ) : deviceAccessRequests.slice(0, 12).map((request) => {
                            const requestBusy = String(deviceAccessBusy).endsWith(`:${request.id}`);
                            const requestedAt = request.requested_at
                              ? new Date(request.requested_at).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })
                              : '';
                            return (
                              <article key={request.id} className={`wa-device-approval-item ${request.status}`}>
                                <span><Laptop /></span>
                                <div>
                                  <strong>{request.device_name || 'PC sin nombre'}</strong>
                                  <small>{request.platform || 'Windows'}{request.requested_by_name ? ` · ${request.requested_by_name}` : ''}{requestedAt ? ` · ${requestedAt}` : ''}</small>
                                </div>
                                <em>{request.status === 'approved' ? 'Aprobada' : request.status === 'pending' ? 'Pendiente' : request.status === 'rejected' ? 'Rechazada' : 'Revocada'}</em>
                                <nav aria-label={`Acciones para ${request.device_name || 'dispositivo'}`}>
                                  {request.status === 'pending' && (
                                    <>
                                      <button type="button" className="wa-device-approve" disabled={requestBusy} onClick={() => onReviewDeviceAccess?.(request.id, 'approved')}>{requestBusy ? <Loader2 className="animate-spin" /> : <Check />}Aprobar</button>
                                      <button type="button" className="wa-device-reject" disabled={requestBusy} onClick={() => onReviewDeviceAccess?.(request.id, 'rejected')}><X />Rechazar</button>
                                    </>
                                  )}
                                  {request.status === 'approved' && (
                                    <button type="button" className="wa-device-reject" disabled={requestBusy} onClick={() => onReviewDeviceAccess?.(request.id, 'revoked')}>{requestBusy ? <Loader2 className="animate-spin" /> : <X />}Revocar</button>
                                  )}
                                </nav>
                              </article>
                            );
                          })}
                        </div>

                        <footer>
                          <small>La PC central reconoce cada instalación por una clave local; cambiar de IP no elimina la autorización.</small>
                          <button type="button" className="wa-secondary-action" disabled={deviceAccessLoading} onClick={() => onRefreshDeviceAccess?.()}>{deviceAccessLoading ? <Loader2 className="animate-spin" /> : <RefreshCw />}Actualizar</button>
                        </footer>
                      </section>
                    )}
                  </div>
                )}

                {canManageHistory && section === 'history' && (
                  <div className="wa-bot-settings-section">
                    <ToolHead
                      title={historyState.title}
                      detail={historyState.detail}
                      onBack={() => setSection('mode')}
                    />

                    {historyError && (
                      <div className="wa-bot-inline-error" role="alert">
                        <AlertCircle /><span>{historyError}</span>
                      </div>
                    )}

                    {/* Lo que pasó después de traer. Es el aviso más importante
                        de la sección: sin él, traer conversaciones más viejas
                        que lo que se muestra parece no haber hecho nada. */}
                    {importOutcome && (
                      <div className="wa-history-result" role="status">
                        <Check />
                        <span>
                          <strong>{importOutcome.titulo}</strong>
                          <small>{importOutcome.detalle}</small>
                        </span>
                        {importOutcome.ofrecerMostrarTodo && (
                          <button
                            type="button"
                            className="wa-primary-action"
                            disabled={Boolean(historyBusy)}
                            onClick={() => onSetHistoryWindow?.('all')}
                          >Mostrar todas</button>
                        )}
                      </div>
                    )}

                    <section className="wa-history-block">
                      <header>
                        <span><Smartphone /></span>
                        <div>
                          <strong>Traer del teléfono</strong>
                          <small>{explicacionDelTelefono(historyWindow)}</small>
                        </div>
                      </header>
                      <div className="wa-history-actions">
                        <button
                          type="button"
                          className="wa-primary-action"
                          disabled={
                            Boolean(historyBusy)
                            || historyLoading
                            || !historyState.puedeTraerDelTelefono
                          }
                          onClick={() => onImportChats?.(importSize, messagesPerChat)}
                        >
                          {historyBusy === 'import' ? <Loader2 className="animate-spin" /> : <Download />}
                          {importButtonLabel(historyWindow)}
                        </button>
                      </div>
                      <div className="wa-history-tuning">
                        <label>
                          Conversaciones por vez
                          <select
                            value={importSize}
                            disabled={Boolean(historyBusy)}
                            onChange={(event) => setImportSize(Number(event.target.value))}
                          >
                            {[5, 10, 25, 50].map((n) => <option key={n} value={n}>{n}</option>)}
                          </select>
                        </label>
                        <label>
                          Mensajes de cada una
                          <select
                            value={messagesPerChat}
                            disabled={Boolean(historyBusy)}
                            onChange={(event) => setMessagesPerChat(Number(event.target.value))}
                          >
                            {[20, 50, 100, 200].map((n) => <option key={n} value={n}>{n}</option>)}
                          </select>
                        </label>
                        <small>Traer de a poco es más prolijo si el teléfono tiene mucha historia.</small>
                      </div>
                    </section>

                    <section className="wa-history-block">
                      <header>
                        <span><Archive /></span>
                        <div>
                          <strong>Lo que ya está guardado</strong>
                          <small>
                            {historyState.recortado
                              ? `Hay ${ocultasTexto} de antes del ${historyState.desde} que Rebu tiene guardadas y no se están mostrando.`
                              : 'Ya se está mostrando todo lo guardado de este número.'}
                          </small>
                        </div>
                      </header>
                      {historyState.recortado && (
                        <div className="wa-history-actions">
                          <button
                            type="button"
                            className="wa-secondary-action"
                            disabled={Boolean(historyBusy) || historyLoading}
                            onClick={() => onLoadOlderConversations?.()}
                          >
                            {historyBusy === 'older' ? <Loader2 className="animate-spin" /> : <ChevronDown />}
                            {olderButtonLabel(historyWindow)}
                          </button>
                          <button
                            type="button"
                            className="wa-secondary-action"
                            disabled={Boolean(historyBusy) || historyLoading}
                            onClick={() => onSetHistoryWindow?.('all')}
                          >Mostrar todas</button>
                        </div>
                      )}
                    </section>

                    <section className="wa-history-block">
                      <header>
                        <span><RefreshCw /></span>
                        <div>
                          <strong>Empezar de cero</strong>
                          <small>{CLEAN_START_CONFIRM.detail}</small>
                        </div>
                      </header>
                      <div className="wa-history-actions">
                        <button
                          type="button"
                          className="wa-secondary-action"
                          disabled={Boolean(historyBusy) || historyLoading}
                          onClick={() => onSetHistoryWindow?.('new_only')}
                        >
                          {historyBusy === 'clean' ? <Loader2 className="animate-spin" /> : null}
                          Ver sólo lo que llegue de ahora en adelante
                        </button>
                      </div>
                    </section>

                    <footer className="wa-history-footer">
                      <small>
                        {historyState.decidedBy
                          ? `Lo dejó así ${historyState.decidedBy}.`
                          : 'Nada de esto borra conversaciones: sólo cambia lo que se muestra.'}
                      </small>
                      <button
                        type="button"
                        className="wa-secondary-action"
                        disabled={historyLoading}
                        onClick={() => onRefreshHistory?.()}
                      >{historyLoading ? <Loader2 className="animate-spin" /> : <RefreshCw />}Actualizar</button>
                    </footer>
                  </div>
                )}

                {section === 'voice' && (
                  <div className="wa-bot-settings-section">
                    <div className="wa-bot-field-grid">
                      <label>Nombre del asistente<input value={draft.identity.name} maxLength={40} onChange={(event) => update('identity', { name: event.target.value })} /></label>
                      <label>Cómo se presenta<input value={draft.identity.role} maxLength={90} onChange={(event) => update('identity', { role: event.target.value })} /></label>
                    </div>
                    <div className="wa-bot-choice-grid">
                      <ChoiceRow label="Personalidad" value={draft.voice.tone} options={CHOICES.tone} onChange={(tone) => update('voice', { tone })} />
                      <ChoiceRow label="Cómo trata al cliente" value={draft.voice.address_style} options={CHOICES.address_style} onChange={(address_style) => update('voice', { address_style })} />
                      <ChoiceRow label="Extensión habitual" value={draft.voice.reply_length} options={CHOICES.reply_length} onChange={(reply_length) => update('voice', { reply_length })} />
                      <ChoiceRow label="Uso de emojis" value={draft.voice.emoji_level} options={CHOICES.emoji_level} onChange={(emoji_level) => update('voice', { emoji_level })} />
                    </div>

                    <h4 className="wa-bot-subhead">Detalles de estilo<small>Si los dejás como están, Blacky escribe igual que hasta ahora.</small></h4>
                    <div className="wa-bot-choice-grid">
                      <ChoiceRow label="Modismos argentinos" value={draft.voice.slang_level} options={CHOICES.slang_level} onChange={(slang_level) => update('voice', { slang_level })} />
                      <ChoiceRow label="Repreguntas al cliente" value={draft.voice.follow_up} options={CHOICES.follow_up} onChange={(follow_up) => update('voice', { follow_up })} />
                      <ChoiceRow label="Cómo se despide" value={draft.voice.closing_style} options={CHOICES.closing_style} onChange={(closing_style) => update('voice', { closing_style })} />
                    </div>

                    <h4 className="wa-bot-subhead">Mensajes clave<small>Blacky los adapta al contexto sin cambiarles la intención.</small></h4>
                    <label>Opciones al presentarse<small>Se agrega después de “Soy Blacky...”.</small><textarea value={draft.messages.welcome_options} maxLength={500} onChange={(event) => update('messages', { welcome_options: event.target.value })} /></label>
                    <label>Cuando pide hablar con una persona<small>El horario del local se agrega automáticamente.</small><textarea value={draft.messages.human_handoff} maxLength={500} onChange={(event) => update('messages', { human_handoff: event.target.value })} /></label>
                    <label>Cuando no puede confirmar algo<small>Evita inventar información y deja el chat para revisión.</small><textarea value={draft.messages.uncertain_answer} maxLength={500} onChange={(event) => update('messages', { uncertain_answer: event.target.value })} /></label>
                  </div>
                )}

                {section === 'rules' && (
                  <div className="wa-bot-settings-section">
                    <h4 className="wa-bot-subhead">Qué puede hacer<small>Lo que apagues, lo deriva a una persona.</small></h4>
                    <div className="wa-bot-toggle-list">
                      {CAPABILITIES.map(([id, label, help]) => (
                        <button key={id} type="button" onClick={() => toggleCapability(id)} aria-pressed={draft.capabilities[id]}>
                          <span><strong>{label}</strong><small>{help}</small></span>
                          <i className={draft.capabilities[id] ? 'on' : ''} aria-hidden="true"><b /></i>
                        </button>
                      ))}
                    </div>
                    <div className="wa-bot-topic-field">
                      <span>Temas que puede responder automáticamente</span>
                      <small>Solo se aplica cuando el modo general está en Respuestas automáticas.</small>
                      <div className="wa-bot-topic-grid">
                        {AUTO_TOPICS.map(([id, label]) => (
                          <button key={id} type="button" className={draft.capabilities.auto_intents.includes(id) ? 'active' : ''} aria-pressed={draft.capabilities.auto_intents.includes(id)} onClick={() => toggleIntent(id)}>
                            {draft.capabilities.auto_intents.includes(id) && <Check />}{label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <h4 className="wa-bot-subhead">Reglas propias<small>Una indicación por línea, en tus palabras.</small></h4>
                    <label>Contexto adicional<small>Ejemplo: “Atendemos principalmente cumpleaños y eventos familiares”.</small><textarea value={draft.guidance.business_context} maxLength={2400} onChange={(event) => update('guidance', { business_context: event.target.value })} /></label>
                    <label>Qué debe hacer siempre<small>Una regla por línea.</small><textarea value={ruleDraft.always_do} onChange={(event) => setRuleDraft((current) => ({ ...current, always_do: event.target.value }))} placeholder={'Preguntar la cantidad cuando falte\nDar alternativas si no hay coincidencia exacta'} /></label>
                    <label>Frases que no debe decir<small>Si una respuesta contiene alguna, no se envía y pasa a revisión.</small><textarea value={ruleDraft.never_say} onChange={(event) => setRuleDraft((current) => ({ ...current, never_say: event.target.value }))} placeholder={'Te lo reservo\nPago confirmado'} /></label>
                    <label>Palabras que requieren una persona<small>Si el cliente menciona alguna, Blacky deriva el chat.</small><textarea value={ruleDraft.handoff_triggers} onChange={(event) => setRuleDraft((current) => ({ ...current, handoff_triggers: event.target.value }))} placeholder={'factura A\ncompra mayorista'} /></label>
                  </div>
                )}
              </main>

              <aside className="wa-bot-modal-preview">
                <div className="wa-bot-preview-heading">
                  <Sparkles />
                  <span><strong>Probar a Blacky</strong><small>No se guarda ni se envía</small></span>
                </div>
                <div className="wa-bot-test-field">
                  <div>
                    <label htmlFor="wa-bot-test-message">Mensaje del cliente</label>
                    {initialTestMessage && (
                      <button type="button" onClick={() => changeTestMessage(String(initialTestMessage))}>Usar último mensaje</button>
                    )}
                  </div>
                  <textarea
                    id="wa-bot-test-message"
                    value={testMessage}
                    maxLength={4000}
                    placeholder="Ejemplo: Hola, ¿tenés globos rojos?"
                    onChange={(event) => changeTestMessage(event.target.value)}
                  />
                  <button
                    type="button"
                    className="wa-bot-test-action"
                    disabled={!testMessage.trim() || testLoading || !selectedPhoneAllowed || typeof onPreview !== 'function'}
                    onClick={() => void runPreview()}
                  >
                    {testLoading ? <Loader2 className="animate-spin" /> : <Sparkles />}
                    {testLoading ? 'Pensando una respuesta…' : 'Probar respuesta'}
                  </button>
                </div>

                <div className="wa-bot-test-result" aria-live="polite">
                  {testLoading ? (
                    <div className="wa-bot-test-empty"><Loader2 className="animate-spin" /><span><strong>Blacky está revisando el mensaje</strong><small>Consulta el contexto y el catálogo disponible.</small></span></div>
                  ) : testError ? (
                    <div className="wa-bot-test-empty error"><AlertCircle /><span><strong>No se pudo completar la prueba</strong><small>{testError}</small></span></div>
                  ) : !selectedPhoneAllowed ? (
                    <div className="wa-bot-test-empty warning"><FlaskConical /><span><strong>Este chat está fuera de la prueba</strong><small>Solo el número autorizado puede generar respuestas mientras el Modo test está activo.</small></span></div>
                  ) : testSuggestions.length ? (
                    <>
                      <div className="wa-bot-preview-message"><p>{testSuggestions[testSuggestionIndex]}</p><small>Blacky · simulación</small></div>
                      <button type="button" className="wa-bot-test-another" onClick={generateAnotherPreview}><RefreshCw />Generar otra</button>
                    </>
                  ) : (
                    <div className="wa-bot-test-empty"><Bot /><span><strong>Probá una situación real</strong><small>Escribí lo que diría un cliente para ver cómo contestaría Blacky con estos ajustes.</small></span></div>
                  )}
                </div>

                <div className="wa-bot-profile-summary">
                  <span><small>Tono</small><strong>{CHOICE_LABELS.tone[draft.voice.tone]}</strong></span>
                  <span><small>Trato</small><strong>{CHOICE_LABELS.address_style[draft.voice.address_style]}</strong></span>
                  <span><small>Respuestas</small><strong>{CHOICE_LABELS.reply_length[draft.voice.reply_length]}</strong></span>
                </div>
                <div className="wa-bot-locked-rules">
                  <ShieldCheck />
                  <span><strong>Prueba segura</strong><small>Consulta el catálogo y aplica las reglas actuales, pero nunca envía el resultado al cliente.</small></span>
                </div>
              </aside>
            </div>

            <footer className="wa-bot-modal-footer">
              {dirty || toolSection ? (
                <span className={dirty ? 'dirty' : ''}>
                  {dirty
                    ? 'Tenés cambios sin guardar'
                    : 'Los cambios de acá se aplican en el momento'}
                </span>
              ) : (
                <div className="wa-bot-tool-links">
                  {toolSections.map(({ id, label }) => (
                    <button key={id} type="button" onClick={() => setSection(id)}>
                      {id === 'central' ? <Server /> : <Archive />}{label}
                    </button>
                  ))}
                </div>
              )}
              <div>
                <button type="button" className="wa-secondary-action" disabled={effectiveBusy} onClick={requestClose}>Cerrar</button>
                {(!toolSection || dirty) && (
                  <button type="button" className="wa-primary-action" disabled={effectiveBusy || !dirty} onClick={() => onSave(payload)}>
                    {busy ? <Loader2 className="animate-spin" /> : <FileText />}{busy ? 'Guardando…' : 'Guardar cambios'}
                  </button>
                )}
              </div>
            </footer>
          </>
        )}

        {confirmDiscard && (
          <div className="wa-bot-discard-confirm" role="alertdialog" aria-label="Descartar cambios sin guardar">
            <span><AlertCircle /><span><strong>Hay cambios sin guardar</strong><small>Si cerrás ahora, se perderán solamente estos cambios.</small></span></span>
            <div>
              <button type="button" className="wa-secondary-action" onClick={() => setConfirmDiscard(false)}>Seguir editando</button>
              <button type="button" className="wa-danger-action" onClick={onClose}>Descartar cambios</button>
            </div>
          </div>
        )}
      </section>
    </div>,
    document.body,
  );
}
