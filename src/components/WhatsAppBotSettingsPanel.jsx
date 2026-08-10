import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  Bot,
  Check,
  ChevronDown,
  FileText,
  FlaskConical,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';

const DEFAULT_VALUE = {
  identity: { name: 'Blacky', role: 'asistente virtual de Rebu' },
  voice: {
    tone: 'cheerful',
    address_style: 'vos',
    reply_length: 'brief',
    emoji_level: 'low',
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

const SECTIONS = [
  { id: 'mode', label: 'Funcionamiento', help: 'Cuándo responde Blacky' },
  { id: 'identity', label: 'Identidad y tono', help: 'Cómo se presenta y escribe' },
  { id: 'messages', label: 'Mensajes clave', help: 'Qué dice en momentos importantes' },
  { id: 'capabilities', label: 'Permisos del bot', help: 'Qué puede consultar o preparar' },
  { id: 'limits', label: 'Contexto y límites', help: 'Reglas propias y derivaciones' },
];

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

const CHOICES = {
  tone: [
    ['cheerful', 'Alegre'],
    ['warm', 'Cálido'],
    ['professional', 'Profesional'],
  ],
  address_style: [['vos', 'Voseo'], ['usted', 'Usted']],
  reply_length: [['brief', 'Breves'], ['balanced', 'Equilibradas'], ['detailed', 'Detalladas']],
  emoji_level: [['none', 'Sin emojis'], ['low', 'Pocos'], ['medium', 'Moderados']],
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
  initialTestMessage = '',
  loading = false,
  loadError = false,
  busy = false,
  onModeChange,
  onTestModeChange,
  onPreview,
  onRetry,
  onSave,
  onClose,
}) {
  const initialDraft = useMemo(() => formValue(value), [value]);
  const initialRuleDraft = useMemo(() => createRuleDraft(initialDraft), [initialDraft]);
  const [section, setSection] = useState('mode');
  const [draft, setDraft] = useState(initialDraft);
  const [ruleDraft, setRuleDraft] = useState(initialRuleDraft);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [testMessage, setTestMessage] = useState(String(initialTestMessage || '').slice(0, 4000));
  const [testSuggestions, setTestSuggestions] = useState([]);
  const [testSuggestionIndex, setTestSuggestionIndex] = useState(0);
  const [testLoading, setTestLoading] = useState(false);
  const [testError, setTestError] = useState('');
  const modalRef = useRef(null);
  const titleRef = useRef(null);
  const requestCloseRef = useRef(null);
  const previousFocusRef = useRef(null);

  const payload = useMemo(() => payloadFromDraft(draft, ruleDraft), [draft, ruleDraft]);
  const previewProfileKey = useMemo(() => JSON.stringify(payload), [payload]);
  const originalPayload = useMemo(
    () => payloadFromDraft(initialDraft, initialRuleDraft),
    [initialDraft, initialRuleDraft],
  );
  const dirty = JSON.stringify(payload) !== JSON.stringify(originalPayload);

  const update = (group, patch) => setDraft((current) => ({
    ...current,
    [group]: { ...current[group], ...patch },
  }));

  const requestClose = useCallback(() => {
    if (busy) return;
    if (dirty) setConfirmDiscard(true);
    else onClose();
  }, [busy, dirty, onClose]);

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
              <small>Administrá su funcionamiento, personalidad, respuestas y límites desde un solo lugar.</small>
            </div>
          </div>
          <div className="wa-bot-modal-version">
            <span>{version ? `Versión ${version}` : 'Perfil de Blacky'}</span>
            <button type="button" onClick={requestClose} aria-label="Cerrar configuración del bot"><X /></button>
          </div>
        </header>

        {loading ? <LoadingState /> : loadError ? <ErrorState onRetry={onRetry} /> : (
          <>
            <div className="wa-bot-modal-body">
              <nav className="wa-bot-settings-nav" aria-label="Secciones de configuración">
                {SECTIONS.map(({ id, label, help }, index) => (
                  <button
                    key={id}
                    type="button"
                    className={section === id ? 'active' : ''}
                    aria-current={section === id ? 'step' : undefined}
                    onClick={() => setSection(id)}
                  >
                    <em>{index + 1}</em>
                    <span><strong>{label}</strong><small>{help}</small></span>
                  </button>
                ))}
              </nav>

              <main className="wa-bot-settings-content">
                {section === 'mode' && (
                  <div className="wa-bot-settings-section">
                    <div className="wa-section-copy">
                      <span>1</span>
                      <div><strong>Cómo trabaja Blacky</strong><small>Elegí si Blacky responde por su cuenta o si prepara opciones para que una persona las revise. Solo observar continúa pausado.</small></div>
                    </div>

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
                          <small>Limita Blacky y todas sus pruebas a una sola conversación.</small>
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
                            <strong>{testModePhone}</strong>
                          </span>
                          {!selectedPhoneAllowed && selectedTestPhone && (
                            <button
                              type="button"
                              disabled={!canManageMode || testModeBusy}
                              onClick={() => onTestModeChange?.({ enabled: true, phone: selectedTestPhone })}
                            >Usar {selectedContactName || 'este chat'}</button>
                          )}
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
                        <small>El cambio se aplica en el momento y no necesita el botón Guardar cambios.</small>
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
                        <span><strong>Faltan datos del negocio</strong><small>Blacky puede quedar activo, pero algunas consultas se derivarán hasta completar esos datos.</small></span>
                      </div>
                    )}
                    <div className="wa-bot-mode-notice">
                      <ShieldCheck />
                      <span><strong>La atención humana siempre sigue disponible</strong><small>Si el cliente pide una persona o Blacky no puede confirmar algo, la conversación queda marcada para revisión.</small></span>
                    </div>
                  </div>
                )}

                {section === 'identity' && (
                  <div className="wa-bot-settings-section">
                    <div className="wa-section-copy">
                      <span>2</span>
                      <div><strong>Identidad y forma de hablar</strong><small>Configura la personalidad general. El saludo cambia automáticamente según la hora.</small></div>
                    </div>
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
                  </div>
                )}

                {section === 'messages' && (
                  <div className="wa-bot-settings-section">
                    <div className="wa-section-copy">
                      <span>3</span>
                      <div><strong>Mensajes importantes</strong><small>Son bases de respuesta: Blacky puede adaptarlas al contexto sin cambiar su intención.</small></div>
                    </div>
                    <label>Opciones al presentarse<small>Se agrega después de “Soy Blacky...”.</small><textarea value={draft.messages.welcome_options} maxLength={500} onChange={(event) => update('messages', { welcome_options: event.target.value })} /></label>
                    <label>Cuando pide hablar con una persona<small>El horario del local se agrega automáticamente.</small><textarea value={draft.messages.human_handoff} maxLength={500} onChange={(event) => update('messages', { human_handoff: event.target.value })} /></label>
                    <label>Cuando no puede confirmar algo<small>Evita inventar información y deja el chat para revisión.</small><textarea value={draft.messages.uncertain_answer} maxLength={500} onChange={(event) => update('messages', { uncertain_answer: event.target.value })} /></label>
                  </div>
                )}

                {section === 'capabilities' && (
                  <div className="wa-bot-settings-section">
                    <div className="wa-section-copy">
                      <span>4</span>
                      <div><strong>Permisos y respuestas automáticas</strong><small>Desactivar una herramienta hace que Blacky derive esa parte a una persona.</small></div>
                    </div>
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
                  </div>
                )}

                {section === 'limits' && (
                  <div className="wa-bot-settings-section">
                    <div className="wa-section-copy">
                      <span>5</span>
                      <div><strong>Contexto y reglas propias</strong><small>Escribí una indicación por línea. No hace falta usar lenguaje técnico.</small></div>
                    </div>
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
              <span className={dirty ? 'dirty' : ''}>
                {dirty ? 'Tenés cambios sin guardar' : version ? `Configuración guardada · versión ${version}` : 'Configuración lista'}
              </span>
              <div>
                <button type="button" className="wa-secondary-action" disabled={busy} onClick={requestClose}>Cerrar</button>
                <button type="button" className="wa-primary-action" disabled={busy || !dirty} onClick={() => onSave(payload)}>
                  {busy ? <Loader2 className="animate-spin" /> : <FileText />}{busy ? 'Guardando…' : 'Guardar cambios'}
                </button>
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
