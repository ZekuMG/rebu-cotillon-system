import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';
import {
  canAccessTab,
  getEffectivePermissions,
} from '../src/utils/userPermissions.js';
import {
  compareConversationActivity,
  conversationActivityTime,
} from '../src/utils/whatsappConversationOrder.js';
import {
  groupMessagesForDisplay,
  messageDayKey,
  messageDayLabel,
  withDaySeparators,
} from '../src/utils/whatsappMessageGroups.js';

const root = resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const { normalizeWhatsAppBotRequestPath } = require('../electron-whatsapp-bridge.cjs');

test('el puente Electron acepta paginación y rechaza rutas externas o parámetros inesperados', () => {
  assert.equal(
    normalizeWhatsAppBotRequestPath('/api/operator/overview?limit=30&cursor=opaque&filter=attention&search=ana'),
    '/api/operator/overview?limit=30&cursor=opaque&filter=attention&search=ana',
  );
  assert.equal(normalizeWhatsAppBotRequestPath('https://evil.test/api/operator/overview'), null);
  assert.equal(normalizeWhatsAppBotRequestPath('/api/operator/overview?token=secret'), null);
  assert.equal(normalizeWhatsAppBotRequestPath('/api/operator/../health'), null);
});

test('vendedores pueden atender WhatsApp sin administrar el modo global', () => {
  const permissions = getEffectivePermissions('seller');
  assert.equal(permissions['whatsapp.view'], true);
  assert.equal(permissions['whatsapp.reply'], true);
  assert.equal(permissions['whatsapp.reply.outside_window'], false);
  assert.equal(permissions['whatsapp.mode.manage'], false);
  assert.equal(permissions['whatsapp.settings.manage'], false);
  assert.equal(permissions['whatsapp.connection.manage'], false);
  assert.equal(permissions['whatsapp.conversation.archive'], true);
  assert.equal(permissions['whatsapp.conversation.delete'], false);
  assert.equal(canAccessTab({ role: 'seller' }, 'whatsapp'), true);
});

test('dueños pueden administrar el modo global y aprobar presupuestos', () => {
  const permissions = getEffectivePermissions('owner');
  assert.equal(permissions['whatsapp.view'], true);
  assert.equal(permissions['whatsapp.reply'], true);
  assert.equal(permissions['whatsapp.reply.outside_window'], false);
  assert.equal(permissions['whatsapp.mode.manage'], true);
  assert.equal(permissions['whatsapp.budget.approve'], true);
  assert.equal(permissions['whatsapp.settings.manage'], false);
  assert.equal(permissions['whatsapp.connection.manage'], false);
  assert.equal(permissions['whatsapp.conversation.archive'], true);
  assert.equal(permissions['whatsapp.conversation.delete'], false);
});

test('Sistema concentra los permisos sensibles de conexión y configuración', () => {
  const permissions = getEffectivePermissions('system');
  assert.equal(permissions['whatsapp.view'], true);
  assert.equal(permissions['whatsapp.reply'], true);
  assert.equal(permissions['whatsapp.reply.outside_window'], true);
  assert.equal(permissions['whatsapp.mode.manage'], true);
  assert.equal(permissions['whatsapp.budget.approve'], true);
  assert.equal(permissions['whatsapp.settings.manage'], true);
  assert.equal(permissions['whatsapp.connection.manage'], true);
  assert.equal(permissions['whatsapp.conversation.archive'], true);
  assert.equal(permissions['whatsapp.conversation.delete'], true);
});

test('el renderer usa Supabase Auth y el puente Electron sin claves administrativas', async () => {
  const service = await readFile(resolve(root, 'src/utils/whatsappOperator.js'), 'utf8');
  const preload = await readFile(resolve(root, 'preload.cjs'), 'utf8');
  const main = await readFile(resolve(root, 'electron-main.cjs'), 'utf8');
  const bridge = await readFile(resolve(root, 'electron-whatsapp-bridge.cjs'), 'utf8');

  assert.match(service, /supabase\.auth\.getSession/);
  assert.match(service, /whatsappBotRequest/);
  assert.doesNotMatch(service, /service[_-]?role/i);
  assert.doesNotMatch(service, /EVOLUTION_API_KEY/);
  assert.match(preload, /whatsapp-bot-request/);
  assert.match(main, /normalizeWhatsAppBotRequestPath/);
  assert.match(bridge, /\/api\\\/operator/);
  assert.match(main, /https:/);
  assert.match(main, /127\.0\.0\.1/);
  assert.match(main, /nodeIntegration:\s*false/);
  assert.match(main, /contextIsolation:\s*true/);
  assert.match(main, /sandbox:\s*true/);
  assert.match(main, /webSecurity:\s*true/);
  assert.match(main, /\['GET', 'POST', 'DELETE'\]/);
  assert.match(service, /const controller = new AbortController\(\)/);
  assert.match(service, /bot_request_timeout/);
});

test('la bandeja expone atención, lectura, bloqueos, adjuntos y recuperación', async () => {
  const service = await readFile(resolve(root, 'src/utils/whatsappOperator.js'), 'utf8');
  const view = await readFile(resolve(root, 'src/views/WhatsAppInboxView.jsx'), 'utf8');
  const styles = await readFile(resolve(root, 'src/views/WhatsAppInboxView.css'), 'utf8');
  const app = await readFile(resolve(root, 'src/App.jsx'), 'utf8');
  const globalStyles = await readFile(resolve(root, 'src/index.css'), 'utf8');
  const main = await readFile(resolve(root, 'electron-main.cjs'), 'utf8');

  assert.match(service, /summary:\s*\(\)/);
  assert.match(service, /markRead:/);
  assert.match(service, /acquireTypingLock:/);
  assert.match(service, /releaseTypingLock:/);
  assert.match(view, /typingLock\.actor_id !== overview\?\.actor\?\.id/);
  assert.match(view, /setInterval\(\(\) => void acquireTyping\(\), 20000\)/);
  assert.match(view, /lockedByOther && <em className="typing"/);
  assert.match(view, /\? `\$\{typingLock\.actor_name \|\| 'Otra persona'\} está respondiendo/);
  assert.match(view, /disabled=\{!canReply \|\| testChat \|\| current\.opted_out \|\| busy === 'send' \|\| lockedByOther\}/);
  assert.match(service, /retryMessage:/);
  assert.match(service, /dismissFailedMessage:/);
  assert.match(service, /editMessage:/);
  assert.match(service, /deleteMessage:/);
  assert.match(service, /archiveConversation:/);
  assert.match(service, /deleteConversation:/);
  assert.match(service, /body:\s*\{\s*refresh,\s*sourceMessageId\s*\}/);
  assert.match(service, /attachment:/);
  assert.match(service, /publishSettings:/);
  assert.match(service, /updateBudgetDraft:/);
  assert.match(service, /recordBudgetResult:/);
  assert.match(service, /connectionAction:/);
  assert.match(service, /profilePictures:/);
  assert.match(service, /body:\s*\{\s*phones,\s*refresh\s*\}/);
  assert.match(service, /quickReplies:/);
  assert.match(service, /cursor=/);
  assert.match(view, /Por atender/);
  assert.match(view, /Sin leer/);
  assert.match(view, /Presupuestos/);
  assert.match(view, /No enviados/);
  assert.match(view, /const FILTERS = \[\s*\{\s*id: 'all',\s*label: 'Todos'/);
  assert.match(view, /activeFilter\.description/);
  assert.match(view, /metadata\?\.operator\?\.actor_name/);
  assert.match(view, /metadata\?\.origin === 'linked_whatsapp'/);
  assert.match(view, /linkedMembersForPhone/);
  assert.match(view, /Socio vinculado/);
  assert.match(view, /memberMatchCount=\{memberMatchCountsByPhone\.get/);
  assert.match(view, /className=\{`wa-member-indicator \$\{memberState\.tone\}`\}/);
  assert.match(view, /Varios socios usan este teléfono/);
  assert.match(styles, /\.wa-member-indicator\s*\{[\s\S]*?right:\s*-2px;[\s\S]*?bottom:\s*-2px;/);
  assert.match(styles, /\.wa-member-indicator\.ambiguous\s*\{[\s\S]*?var\(--rebu-warning\)/);
  assert.match(view, /const \[filter, setFilter\] = useState\('all'\)/);
  assert.match(view, /Cargar más conversaciones/);
  assert.match(view, /Cargar mensajes anteriores/);
  assert.match(view, /APPEARANCE_KEY/);
  assert.match(view, /requestId !== overviewRequestRef\.current/);
  assert.match(view, /requestId !== detailRequestRef\.current/);
  assert.match(view, /className="wa-chat-contact-trigger"/);
  assert.match(view, /function ArchiveConversationDialog/);
  assert.match(view, /function DeleteConversationDialog/);
  assert.match(view, /whatsappOperator\.archiveConversation/);
  assert.match(view, /whatsappOperator\.deleteConversation/);
  assert.match(view, /confirmation\.trim\(\)\.toUpperCase\(\) === 'ELIMINAR'/);
  assert.match(view, /canDeleteConversation/);
  assert.match(styles, /\.wa-chat-menu > button\.danger/);
  assert.match(styles, /\.wa-destructive-confirmation input/);
  assert.match(view, /aria-controls="wa-contact-panel"/);
  assert.match(view, /aria-expanded=\{activeContext === 'contact'\}/);
  assert.match(view, /id="wa-contact-panel"/);
  assert.match(styles, /\.wa-chat-contact-trigger:focus-visible\s*\{[\s\S]*?outline:/);
  assert.match(view, /currentDetail\?\.conversation\?\.phone !== selectedPhone/);
  assert.match(view, /Opciones de la conversación/);
  assert.match(view, /Datos del negocio/);
  assert.match(view, /<Avatar[\s\S]*?row=\{/);
  assert.match(view, /new Intl\.Segmenter\('es', \{ granularity: 'grapheme' \}\)/);
  assert.match(view, /Array\.from\(name\)\[0\]/);
  assert.match(view, /isTestConversation/);
  assert.match(view, /messages\.some\(\(row\) => row\?\.metadata\?\.test_fixture === true\)/);
  assert.match(view, /Marcar como revisado/);
  assert.match(view, /row\.status === 'failed'[\s\S]*?row\.attention_required/);
  assert.match(styles, /\.wa-failure-actions\s*\{[\s\S]*?grid-template-columns:/);
  assert.match(view, /Conversación aislada: no se enviará nada a WhatsApp/);
  assert.match(view, /Respuestas rápidas/);
  assert.match(view, /quickReplyMessageKey/);
  assert.match(view, /send\(draft, quickReplySourceId\)/);
  assert.match(view, /if \(activeActionRef\.current\) return null/);
  assert.match(view, /activeActionRef\.current = key/);
  assert.match(view, /setBusy\(\(currentBusy\) => \(currentBusy === key \? '' : currentBusy\)\)/);
  assert.match(view, /if \(current\) return current/);
  assert.match(view, /draftsByPhoneRef\.current\.set\(phone, draft\)/);
  assert.match(view, /draftsByPhoneRef\.current\.get\(phone\)/);
  assert.match(view, /if \(next\) draftsByPhoneRef\.current\.set\(phone, next\)/);
  assert.match(view, /else draftsByPhoneRef\.current\.delete\(phone\)/);
  assert.match(view, /document\.visibilityState !== 'visible'/);
  assert.match(view, /const readKey = `\$\{phone\}:\$\{latestInboundMessageId\}`/);
  assert.match(view, /\{unread > 0 && \(/);
  assert.match(view, /className="wa-row-content"/);
  assert.match(view, /loadProfilePictures\(true\)/);
  assert.match(view, /WhatsApp no compartió una foto para este contacto/);
  assert.match(view, /reply\?\.catalogMedia/);
  assert.match(view, /className="wa-catalog-media-strip"/);
  assert.match(view, /Quitar todas/);
  assert.match(styles, /\.wa-catalog-media-strip img\s*\{[\s\S]*?object-fit:\s*contain/);
  assert.match(view, /const \[pendingCatalogSend, setPendingCatalogSend\] = useState\(null\)/);
  assert.match(view, /className="wa-pending-catalog-send"/);
  assert.match(view, /Subiendo \{pendingCatalogSend\.media\.length/);
  assert.match(styles, /\.wa-pending-catalog-grid img\s*\{[\s\S]*?object-fit:\s*cover/);
  assert.match(main, /requestPath\.endsWith\('\/messages\/catalog-media'\)[\s\S]*?120000/);
  assert.match(app, /document\.body\.dataset\.activeWorkspace = activeTab/);
  assert.match(globalStyles, /body\[data-active-workspace='whatsapp'\]\s*\{[\s\S]*?min-width:\s*0/);
  assert.match(globalStyles, /body\[data-active-workspace='whatsapp'\] #root,[\s\S]*?\.app-shell\s*\{[\s\S]*?min-width:\s*0/);
  assert.match(globalStyles, /body\[data-active-workspace='whatsapp'\] \.app-topbar-tools\s*\{[\s\S]*?display:\s*none/);
  assert.match(view, /mode !== 'auto'/);
  assert.match(view, /Solo observar/);
  assert.match(view, /Ayuda para responder/);
  assert.match(view, /Respuestas automáticas/);
  assert.match(view, /connectionStateCopy/);
  assert.match(view, /handoffCopy/);
  assert.match(view, /IntersectionObserver/);
  assert.match(view, /function ImageGallery/);
  assert.match(view, /className="wa-image-open"/);
  assert.match(view, /role="dialog"/);
  assert.match(view, /event\.key === 'Escape'/);
  assert.match(view, /event\.key === 'ArrowLeft'/);
  assert.match(view, /event\.key === 'ArrowRight'/);
  assert.match(view, /Ver imagen anterior/);
  assert.match(view, /Ver imagen siguiente/);
  assert.match(styles, /\.wa-image-gallery\s*\{[\s\S]*?position:\s*fixed/);
  assert.match(styles, /\.wa-image-gallery-stage > img\s*\{[\s\S]*?object-fit:\s*contain/);
  assert.match(view, /function VoiceNotePlayer/);
  assert.match(view, /<audio[\s\S]*?preload="metadata"/);
  assert.match(view, /Pausar mensaje de voz/);
  assert.match(view, /Posición del mensaje de voz/);
  assert.match(view, /Velocidad de reproducción/);
  assert.match(view, /<video[\s\S]*?controls[\s\S]*?playsInline[\s\S]*?preload="metadata"/);
  assert.match(view, /function DocumentViewer/);
  assert.match(view, /Visor de PDF/);
  assert.match(view, /<iframe src=\{data\.dataUrl\}/);
  assert.match(view, /download=\{fileName\}/);
  assert.match(view, /attachmentKindForView/);
  assert.match(styles, /\.wa-voice-note\s*\{[\s\S]*?grid-template-columns:/);
  assert.match(styles, /\.wa-voice-progress::-webkit-slider-runnable-track/);
  assert.match(styles, /\.wa-video-attachment video\s*\{[\s\S]*?object-fit:\s*contain/);
  assert.match(styles, /\.wa-document-viewer\s*\{[\s\S]*?position:\s*fixed/);
  assert.match(view, /fetchAttachmentOnce/);
  assert.match(view, /ATTACHMENT_CACHE_MAX_BYTES/);
  assert.match(view, /conversationActivity/);
  assert.match(view, /activity\.revision !== detailRevisionRef\.current/);
  assert.match(view, /Preparando la bandeja/);
  assert.match(view, /Abriendo la conversaci.n/);
  assert.match(styles, /\.wa-attachment > button\.wa-media-loader,[\s\S]*?width:\s*100%/);
  assert.match(view, /hasImage \? 'has-image'/);
  assert.match(view, /hasImage && !hasCaption \? 'image-without-caption'/);
  assert.match(styles, /\.wa-message > article\.has-image\s*\{[\s\S]*?width:\s*min\(268px,\s*68%\)/);
  assert.match(styles, /\.wa-message > article\.has-image\.image-without-caption\s*\{[\s\S]*?width:\s*min\(228px,\s*68%\)/);
  assert.match(styles, /@media \(max-width: 820px\)[\s\S]*?\.wa-message > article\s*\{[\s\S]*?max-width:\s*min\(90%,\s*560px\)/);
  assert.match(styles, /\.wa-attachment\.image\s*\{[\s\S]*?width:\s*100%/);
  assert.match(styles, /\.wa-attachment img\s*\{[\s\S]*?width:\s*100%[\s\S]*?height:\s*auto/);
  assert.match(styles, /\.wa-attachment > button\.wa-image-open\s*\{[\s\S]*?width:\s*100%/);
  assert.match(styles, /--wa-audio-active:\s*var\(--wa-chat-green\)/);
  assert.match(styles, /scrollbar-color:\s*var\(--wa-chat-control\) var\(--wa-chat-canvas\)/);
  assert.match(view, /className="wa-delivery-state received"/);
  assert.match(view, /conversationItems\.map/);
  assert.match(view, /groupMessagesForDisplay/);
  assert.match(view, /withDaySeparators/);
  assert.match(view, /className="wa-day-separator"/);
  assert.match(styles, /\.wa-day-separator\s*\{[\s\S]*?align-items:\s*center/);
  assert.match(styles, /\.wa-image-album-grid\s*\{/);
  assert.match(view, /document\.visibilityState === 'visible' \? 2500 : 10000/);
  assert.match(view, /window\.setTimeout\(\(\) => void refreshOverview\(\), 10000\)/);
  assert.doesNotMatch(view, /setInterval\(\(\) => void loadOverview\(true\), 10000\)/);
  assert.match(view, /distanceFromBottom <= 72/);
  assert.match(view, /setNewMessageCount/);
  assert.match(view, /className="wa-new-message-notice"/);
  assert.match(view, /scrollToLatest\('smooth'\)/);
  assert.match(view, /!event\.shiftKey/);
  assert.match(view, /Shift \+ Enter para una nueva línea/);
  assert.doesNotMatch(view, />Shadow</);
  assert.doesNotMatch(view, />Copilot</);
  assert.doesNotMatch(view, /credenciales de Evolution/);
  assert.match(app, /Datos demorados/);
  assert.match(app, /Recuperando datos/);
  assert.match(app, /Cargar todo de nuevo/);
  assert.doesNotMatch(app, /Nube parcial/);
  assert.doesNotMatch(app, /Reconectando tiempo real/);
  assert.match(styles, /\.wa-row\s*\{[\s\S]*?min-height:\s*60px/);
  assert.match(styles, /\.wa-row\s*\{[\s\S]*?overflow:\s*hidden/);
  assert.match(styles, /\.wa-row\s*\{[\s\S]*?align-items:\s*center/);
  assert.match(styles, /\.wa-row-content\s*\{[\s\S]*?align-content:\s*center/);
  assert.match(styles, /\.wa-row-content\s*\{[\s\S]*?gap:\s*4px/);
  assert.match(styles, /\.wa-row p\s*\{[\s\S]*?text-overflow:\s*ellipsis[\s\S]*?white-space:\s*nowrap/);
  assert.match(styles, /\.wa-inbox\s*\{[\s\S]*?line-height:\s*1\.2/);
  assert.match(styles, /\.wa-command-actions \.wa-switch\s*\{[\s\S]*?border-radius:\s*16px/);
  assert.match(styles, /\.wa-compose-row\s*\{[\s\S]*?grid-template-columns:\s*42px minmax\(0, 1fr\) 42px/);
  assert.match(styles, /\.wa-row footer:empty\s*\{\s*display:\s*none/);
  assert.match(styles, /\.wa-stream-shell\s*\{[\s\S]*?position:\s*relative/);
  assert.match(styles, /\.wa-new-message-notice\s*\{[\s\S]*?position:\s*absolute/);
  assert.match(view, /className="wa-mode-options"/);
  assert.match(view, /Encendé el bot para cambiar este modo/);
  assert.match(view, /className="wa-menu-action-wide"/);
  assert.match(view, /aria-label="Opciones del mensaje"/);
  assert.match(view, /<Sparkles \/>Generar respuesta/);
  assert.match(view, /<Pencil \/>Editar mensaje/);
  assert.match(view, /<Forward \/>Reenviar mensaje/);
  assert.match(view, /<Info \/>Informaci.n del mensaje/);
  assert.match(view, /<Trash2 \/>Eliminar mensaje/);
  assert.match(view, /menuOpen \? 'menu-open' : ''/);
  assert.match(view, /const replyable = canGenerate[\s\S]*?&& inbound/);
  assert.match(view, /canGenerate=\{canReply && !testChat\}/);
  assert.match(view, /target\?\.closest\?\.\('button, a, audio, video, input, textarea, \[role="menu"\]'\)/);
  assert.match(view, /onToggleMenu\(String\(displayRow\.id\)\)/);
  assert.match(view, /const editable = canMutate[\s\S]*?!inbound[\s\S]*?statusRow\.status === 'sent'/);
  assert.match(view, /const deletable = canMutate[\s\S]*?!inbound[\s\S]*?statusRow\.status === 'sent'/);
  assert.match(view, /const retryable = statusRow\.status === 'failed'[\s\S]*?failure_class[\s\S]*?=== 'definite'/);
  assert.match(view, /loadQuickReplies\(phone,\s*\{\s*sourceMessageId:\s*row\.id\s*\}\)/);
  assert.match(view, /whatsappOperator\.editMessage/);
  assert.match(view, /whatsappOperator\.deleteMessage/);
  assert.match(styles, /\.wa-message-menu-trigger\s*\{[\s\S]*?opacity:\s*0/);
  assert.match(styles, /\.wa-message\.menu-open\s*\{[\s\S]*?z-index:\s*30/);
  assert.match(styles, /\.wa-message > article:hover \.wa-message-menu-trigger/);
  assert.match(styles, /\.wa-message-menu-popover\s*\{[\s\S]*?position:\s*absolute/);
  assert.match(styles, /\.wa-message-dialog-backdrop\s*\{[\s\S]*?position:\s*fixed/);
  assert.match(styles, /\.wa-mode-options > button\s*\{[\s\S]*?min-height:\s*36px/);
  assert.match(styles, /\.wa-menu-actions > button\.wa-menu-action-wide\s*\{[\s\S]*?grid-column:\s*1\s*\/\s*-1/);
});

test('el sidebar cuenta conversaciones y emite un aviso silenciable', async () => {
  const sidebar = await readFile(resolve(root, 'src/components/Sidebar.jsx'), 'utf8');

  assert.match(sidebar, /WHATSAPP_SOUND_MUTED_KEY/);
  assert.match(sidebar, /whatsappOperator\.summary/);
  assert.match(sidebar, /playAttentionTone/);
  assert.match(sidebar, /pending_budgets/);
  assert.match(sidebar, /failed_sends/);
  assert.match(sidebar, /attentionKeys/);
  assert.match(sidebar, /window\.setTimeout\(\(\) => void load\(\), 15000\)/);
  assert.doesNotMatch(sidebar, /setInterval\(load, 15000\)/);
  assert.match(sidebar, /transition-\[opacity,transform\]/);
});

test('abrir y marcar como leído no cambia el orden por actividad real', () => {
  const recent = {
    phone: '5491111111111',
    unread_count: 1,
    updated_at: '2026-07-28T14:05:00Z',
    latest_message: { created_at: '2026-07-28T14:00:00Z' },
  };
  const older = {
    phone: '5491122222222',
    unread_count: 0,
    updated_at: '2026-07-28T14:10:00Z',
    latest_message: { created_at: '2026-07-28T13:00:00Z' },
  };
  assert.equal(conversationActivityTime(recent), Date.parse('2026-07-28T14:00:00Z'));
  assert.deepEqual([older, recent].sort(compareConversationActivity), [recent, older]);

  recent.unread_count = 0;
  recent.updated_at = '2026-07-28T14:20:00Z';
  assert.deepEqual([older, recent].sort(compareConversationActivity), [recent, older]);
});

test('las fotos de un mismo envío se agrupan sin mezclar mensajes distintos', () => {
  const image = (id) => ({ id, media_kind: 'image', mime_type: 'image/jpeg' });
  const rows = [
    {
      id: 1,
      direction: 'outbound',
      operation_key: 'operator:catalog-request:photo:1',
      created_at: '2026-07-28T22:00:00Z',
      attachments: [image('a1')],
    },
    {
      id: 2,
      direction: 'outbound',
      operation_key: 'operator:catalog-request:photo:2',
      created_at: '2026-07-28T22:00:01Z',
      attachments: [image('a2')],
    },
    {
      id: 3,
      direction: 'outbound',
      operation_key: 'operator:other-request:photo:1',
      created_at: '2026-07-28T22:00:02Z',
      attachments: [image('a3')],
    },
  ];
  const blocks = groupMessagesForDisplay(rows);
  assert.equal(blocks.length, 2);
  assert.deepEqual(blocks[0].rows.map((row) => row.id), [1, 2]);
  assert.deepEqual(blocks[1].rows.map((row) => row.id), [3]);
});

test('la conversación separa días según Buenos Aires y no agrupa fotos a través de medianoche', () => {
  const image = (id) => ({ id, media_kind: 'image', mime_type: 'image/jpeg' });
  const rows = [
    {
      id: 10,
      direction: 'inbound',
      created_at: '2026-08-04T02:59:50Z',
      attachments: [image('before-midnight')],
    },
    {
      id: 11,
      direction: 'inbound',
      created_at: '2026-08-04T03:00:10Z',
      attachments: [image('after-midnight')],
    },
  ];
  const blocks = groupMessagesForDisplay(rows);
  const items = withDaySeparators(blocks, '2026-08-04T15:00:00Z');
  assert.equal(messageDayKey(rows[0].created_at), '2026-08-03');
  assert.equal(messageDayKey(rows[1].created_at), '2026-08-04');
  assert.equal(messageDayLabel(rows[0].created_at, '2026-08-04T15:00:00Z'), 'Ayer');
  assert.equal(messageDayLabel(rows[1].created_at, '2026-08-04T15:00:00Z'), 'Hoy');
  assert.equal(blocks.length, 2);
  assert.deepEqual(items.filter((item) => item.type === 'day-separator').map((item) => item.label), ['Ayer', 'Hoy']);
});

test('envíos manuales y presupuestos conservan claves idempotentes estables', async () => {
  const view = await readFile(resolve(root, 'src/views/WhatsAppInboxView.jsx'), 'utf8');
  const migration = await readFile(
    resolve(root, 'supabase/migrations/20260728_whatsapp_permission_hardening.sql'),
    'utf8',
  );

  assert.match(view, /manualSendOperationRef/);
  assert.match(view, /budget-text:\$\{entry\.id\}/);
  assert.match(view, /budget-pdf:\$\{entry\.id\}/);
  assert.match(view, /budget_delivery_incomplete/);
  assert.match(migration, /permissions_override/);
  assert.match(migration, /whatsapp\.budget\.approve/);
});

test('Electron genera el PDF del presupuesto sin diálogo de guardado', async () => {
  const preload = await readFile(resolve(root, 'preload.cjs'), 'utf8');
  const main = await readFile(resolve(root, 'electron-main.cjs'), 'utf8');

  assert.match(preload, /generateWhatsAppBudgetPdf/);
  assert.match(main, /generate-whatsapp-budget-pdf/);
  assert.match(main, /printToPDF/);
  assert.match(main, /show:\s*false/);
});
