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
import {
  claimCentralMachineForDevice,
  deactivateStaleCentralOverride,
  reconcileCentralOverride,
} from '../src/utils/whatsappCentralMachine.js';
import { describeWhatsAppConnection } from '../src/utils/whatsappConnection.js';

const root = resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const {
  DEFAULT_WHATSAPP_BOT_URL,
  normalizeWhatsAppBotRequestPath,
  resolveWhatsAppBotBaseUrl,
} = require('../electron-whatsapp-bridge.cjs');

test('el puente Electron acepta paginación y rechaza rutas externas o parámetros inesperados', () => {
  assert.equal(
    normalizeWhatsAppBotRequestPath('/api/operator/overview?limit=30&cursor=opaque&filter=attention&search=ana'),
    '/api/operator/overview?limit=30&cursor=opaque&filter=attention&search=ana',
  );
  assert.equal(normalizeWhatsAppBotRequestPath('https://evil.test/api/operator/overview'), null);
  assert.equal(normalizeWhatsAppBotRequestPath('/api/operator/overview?token=secret'), null);
  assert.equal(normalizeWhatsAppBotRequestPath('/api/operator/../health'), null);
});

test('las PCs remotas usan Tailscale y la central conserva el acceso local', () => {
  assert.equal(
    DEFAULT_WHATSAPP_BOT_URL,
    'https://rebu-whatsapp-central.tailbdf1e7.ts.net',
  );
  assert.equal(
    resolveWhatsAppBotBaseUrl(),
    'https://rebu-whatsapp-central.tailbdf1e7.ts.net',
  );
  assert.equal(
    resolveWhatsAppBotBaseUrl({ localOverride: 'http://127.0.0.1:3000/' }),
    'http://127.0.0.1:3000',
  );
  assert.equal(
    resolveWhatsAppBotBaseUrl({ environmentOverride: 'https://bot.example.com/?ignored=true' }),
    'https://bot.example.com',
  );
  assert.throws(
    () => resolveWhatsAppBotBaseUrl({ environmentOverride: 'http://192.168.1.20:3000' }),
    /HTTPS/i,
  );
  assert.throws(
    () => resolveWhatsAppBotBaseUrl({ environmentOverride: 'https://user:secret@bot.example.com' }),
    /HTTPS/i,
  );
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
  assert.match(preload, /get-whatsapp-central-candidate/);
  assert.match(preload, /activate-whatsapp-central-machine/);
  assert.match(preload, /deactivate-whatsapp-central-machine/);
  assert.match(main, /normalizeWhatsAppBotRequestPath/);
  assert.match(main, /getWhatsAppCentralCandidate/);
  assert.match(main, /localWhatsAppHealth\('\/health\/live'\)/);
  assert.match(main, /live\.body\?\.service === 'rebu-whatsapp-node'/);
  assert.match(main, /centralMachineActive === true/);
  assert.match(main, /bot_central_unreachable/);
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

test('la interfaz remota distingue Tailscale desconectado de un QR pendiente', async () => {
  const view = await readFile(resolve(root, 'src/views/WhatsAppInboxView.jsx'), 'utf8');
  const centralPanel = await readFile(resolve(root, 'src/components/WhatsAppBotSettingsPanel.jsx'), 'utf8');

  assert.match(view, /bot_central_unreachable/);
  assert.match(view, /No se puede llegar a la PC central/);
  assert.match(view, /Docker no hace falta aquí/);
  assert.match(view, /centralTransportUnavailable \? 'status' : 'qr'/);
  assert.match(view, /WhatsApp necesita atención en la central/);
  assert.match(view, /El QR está reservado para Sistema/);
  assert.match(view, /if \(!isActive\) return undefined;[\s\S]{0,3000}conversationActivity\(phone\)/);
  assert.match(view, /if \(!isActive\) return undefined;[\s\S]{0,700}refreshDeviceAccess/);
  assert.match(view, /if \(!isActive \|\| !deviceAccessResolved\) return undefined;[\s\S]{0,300}connectedStreak/);
  assert.match(centralPanel, /Esta PC funciona como puesto remoto/);
  assert.match(centralPanel, /No necesita Docker ni Evolution/);
});

test('el acceso por dispositivo se solicita, se aprueba en la central y nunca expone el secreto al renderer', async () => {
  const view = await readFile(resolve(root, 'src/views/WhatsAppInboxView.jsx'), 'utf8');
  const centralPanel = await readFile(resolve(root, 'src/components/WhatsAppBotSettingsPanel.jsx'), 'utf8');
  const accessService = await readFile(resolve(root, 'src/utils/whatsappDeviceAccess.js'), 'utf8');
  const preload = await readFile(resolve(root, 'preload.cjs'), 'utf8');
  const main = await readFile(resolve(root, 'electron-main.cjs'), 'utf8');
  const migration = await readFile(
    resolve(root, 'supabase/migrations/20260816234500_whatsapp_device_access.sql'),
    'utf8',
  );

  assert.match(view, /No estás habilitado para usar WhatsApp en este dispositivo/);
  assert.match(view, /Solicitar acceso a la central/);
  assert.match(view, /Descargar Tailscale/);
  assert.match(view, /deviceAccessBlocked/);
  assert.match(centralPanel, /Dispositivos autorizados/);
  assert.match(centralPanel, /onReviewDeviceAccess\?\.\(request\.id, 'approved'\)/);
  assert.match(centralPanel, /onReviewDeviceAccess\?\.\(request\.id, 'revoked'\)/);

  assert.match(accessService, /get_my_whatsapp_device_access/);
  assert.match(accessService, /request_whatsapp_device_access/);
  assert.match(accessService, /review_whatsapp_device_access/);
  assert.match(preload, /getWhatsAppAccessDevice/);
  assert.match(main, /X-Rebu-Device-Id/);
  assert.match(main, /X-Rebu-Device-Token/);
  assert.match(main, /tokenHash: createHash\('sha256'\)/);
  assert.doesNotMatch(preload, /accessToken/);

  assert.match(migration, /create table if not exists public\.whatsapp_device_access_requests/);
  assert.match(migration, /alter table public\.whatsapp_device_access_requests enable row level security/);
  assert.match(migration, /revoke all on table public\.whatsapp_device_access_requests from public, anon, authenticated/);
  assert.match(migration, /actor_role not in \('system', 'sistema'\)/);
  assert.match(migration, /authorize_whatsapp_device_access/);
  assert.match(migration, /last_authorized_at < now\(\) - interval '5 minutes'/);
  assert.match(migration, /where public\.whatsapp_device_access_requests\.token_hash = excluded\.token_hash/);
  const tableDefinition = migration.match(/create table if not exists public\.whatsapp_device_access_requests[\s\S]+?\n\);/)?.[0] || '';
  assert.doesNotMatch(tableDefinition, /device_token/i);
});

test('la transferencia central activa local, reclama y conserva el candidato verificado', async () => {
  const calls = [];
  const verifiedCandidate = {
    deviceId: '4f671f4a-513c-4c53-85ad-b04a6f9ca20a',
    deviceName: 'CAJA-CENTRAL',
    localServiceRunning: true,
    localServiceReady: true,
    whatsappConnected: true,
    checkedAt: 'verified',
  };
  const result = await claimCentralMachineForDevice({
    desktop: {
      activateWhatsAppCentralMachine: async (deviceId) => {
        calls.push(['activate', deviceId]);
        return { success: true, candidate: verifiedCandidate };
      },
      deactivateWhatsAppCentralMachine: async () => {
        calls.push(['deactivate']);
        return { success: true };
      },
    },
    operator: {
      claimCentralMachine: async (payload) => {
        calls.push(['claim', payload.checkedAt, payload.expectedDeviceId]);
        return { claimed: true, machine: { device_id: payload.deviceId } };
      },
    },
    candidate: { ...verifiedCandidate, checkedAt: 'initial' },
    currentCentralMachine: { machine: { device_id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479' } },
  });

  assert.deepEqual(calls, [
    ['activate', verifiedCandidate.deviceId],
    ['claim', 'verified', 'f47ac10b-58cc-4372-a567-0e02b2c3d479'],
  ]);
  assert.equal(result.candidate.checkedAt, 'verified');
  assert.equal(result.claimed.claimed, true);
});

test('una PC sin WhatsApp conectado no puede iniciar la transferencia central', async () => {
  let activated = 0;
  await assert.rejects(
    claimCentralMachineForDevice({
      desktop: {
        activateWhatsAppCentralMachine: async () => {
          activated += 1;
          return { success: true };
        },
        deactivateWhatsAppCentralMachine: async () => ({ success: true }),
      },
      operator: { claimCentralMachine: async () => ({ claimed: true }) },
      candidate: {
        deviceId: '4f671f4a-513c-4c53-85ad-b04a6f9ca20a',
        localServiceRunning: true,
        localServiceReady: true,
        whatsappConnected: false,
      },
      currentCentralMachine: null,
    }),
    { code: 'central_whatsapp_disconnected' },
  );
  assert.equal(activated, 0);
});

test('la transferencia revierte el endpoint local si la reclamación falla', async () => {
  const calls = [];
  const conflict = Object.assign(new Error('central changed'), { code: 'central_machine_changed' });
  await assert.rejects(
    claimCentralMachineForDevice({
      desktop: {
        activateWhatsAppCentralMachine: async () => {
          calls.push('activate');
          return { success: true };
        },
        deactivateWhatsAppCentralMachine: async () => {
          calls.push('deactivate');
          return { success: true, changed: true };
        },
      },
      operator: {
        claimCentralMachine: async () => {
          calls.push('claim');
          throw conflict;
        },
      },
      candidate: {
        deviceId: '4f671f4a-513c-4c53-85ad-b04a6f9ca20a',
        localServiceRunning: true,
        localServiceReady: true,
        whatsappConnected: true,
      },
      currentCentralMachine: null,
    }),
    (error) => error === conflict,
  );
  assert.deepEqual(calls, ['activate', 'claim', 'deactivate']);
});

test('un rollback local fallido se informa como estado recuperable específico', async () => {
  await assert.rejects(
    claimCentralMachineForDevice({
      desktop: {
        activateWhatsAppCentralMachine: async () => ({ success: true }),
        deactivateWhatsAppCentralMachine: async () => ({ success: false }),
      },
      operator: {
        claimCentralMachine: async () => {
          throw new Error('claim failed');
        },
      },
      candidate: {
        deviceId: '4f671f4a-513c-4c53-85ad-b04a6f9ca20a',
        localServiceRunning: true,
        localServiceReady: true,
        whatsappConnected: true,
      },
      currentCentralMachine: null,
    }),
    (error) => error?.code === 'central_machine_local_reset_failed',
  );
});

test('una PC que perdió la centralidad desactiva su override local', async () => {
  const calls = [];
  const candidate = { deviceId: '4f671f4a-513c-4c53-85ad-b04a6f9ca20a' };
  const desktop = {
    deactivateWhatsAppCentralMachine: async (deviceId) => {
      calls.push(deviceId);
      return { success: true, changed: true };
    },
  };
  await deactivateStaleCentralOverride({
    desktop,
    candidate,
    centralMachine: { available: true, machine: { device_id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479' } },
  });
  await deactivateStaleCentralOverride({
    desktop,
    candidate,
    centralMachine: { available: true, machine: { device_id: candidate.deviceId } },
  });
  assert.deepEqual(calls, [candidate.deviceId]);
});

test('la PC central restaura su ruta local después de una respuesta de transferencia perdida', async () => {
  const calls = [];
  const candidate = {
    deviceId: '4f671f4a-513c-4c53-85ad-b04a6f9ca20a',
    centralMachineActive: false,
    localServiceRunning: true,
    localServiceReady: true,
    whatsappConnected: true,
  };
  const result = await reconcileCentralOverride({
    desktop: {
      activateWhatsAppCentralMachine: async (deviceId) => {
        calls.push(deviceId);
        return { success: true };
      },
    },
    candidate,
    centralMachine: {
      available: true,
      lease_active: true,
      machine: { device_id: candidate.deviceId },
    },
  });
  assert.equal(result.changed, true);
  assert.deepEqual(calls, [candidate.deviceId]);
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
  assert.match(view, /disabled=\{!canReply \|\| testChat \|\| !testModeAllowsCurrent \|\| current\.opted_out \|\| busy === 'send' \|\| lockedByOther\}/);
  assert.match(service, /retryMessage:/);
  assert.match(service, /dismissFailedMessage:/);
  assert.match(service, /editMessage:/);
  assert.match(service, /deleteMessage:/);
  assert.match(service, /archiveConversation:/);
  assert.match(service, /deleteConversation:/);
  assert.match(service, /body:\s*\{\s*refresh,\s*sourceMessageId\s*\}/);
  assert.match(service, /attachment:/);
  assert.match(service, /publishSettings:/);
  assert.match(service, /botSettings:/);
  assert.match(service, /publishBotSettings:/);
  assert.match(service, /updateBudgetDraft:/);
  assert.match(service, /recordBudgetResult:/);
  assert.match(service, /connectionAction:/);
  assert.match(service, /profilePictures:/);
  assert.match(service, /body:\s*\{\s*phones,\s*refresh\s*\}/);
  assert.match(service, /quickReplies:/);
  assert.match(service, /previewBotReply:/);
  assert.match(service, /\/bot-settings\/preview/);
  assert.match(service, /setTestMode:/);
  assert.match(service, /\/test-mode/);
  assert.match(service, /centralMachine:/);
  assert.match(service, /claimCentralMachine:/);
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
  assert.match(view, /detail\?\.conversation \|\| overview\?\.conversations\?\.find/);
  assert.match(view, /\.filter\(\(row\) => String\(row\?\.status \|\| ''\)\.toLowerCase\(\) !== 'suggested'\)/);
  assert.match(view, /current\.status === 'human'[\s\S]*?<Hand \/>Atenci.n manual/);
  assert.match(view, /className="wa-chat-contact-trigger"/);
  assert.match(view, /function ArchiveConversationDialog/);
  assert.match(view, /function DeleteConversationDialog/);
  assert.match(view, /whatsappOperator\.archiveConversation/);
  assert.match(view, /whatsappOperator\.deleteConversation/);
  // Ya no se escribe "ELIMINAR" a mano (pedido de Mikkel, 17-ago-2026): alcanza
  // con confirmar en el diálogo. La confirmación que espera el bot la manda la
  // app, así que el borrado tiene que seguir enviándola.
  assert.match(view, /onConfirm\('ELIMINAR'\)/);
  assert.doesNotMatch(view, /Para confirmar, escribí/);
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
  assert.match(view, /Configurar bot/);
  assert.match(view, /openBotSettings/);
  assert.match(view, /const \[botSettingsOpen, setBotSettingsOpen\] = useState\(false\)/);
  assert.match(view, /\{botSettingsOpen && \(/);
  assert.doesNotMatch(view, /activeContext === 'bot-settings'/);
  const botSettingsPanel = await readFile(resolve(root, 'src/components/WhatsAppBotSettingsPanel.jsx'), 'utf8');
  const centralMachineHelper = await readFile(resolve(root, 'src/utils/whatsappCentralMachine.js'), 'utf8');
  assert.match(botSettingsPanel, /createPortal/);
  assert.match(botSettingsPanel, /aria-modal="true"/);
  assert.match(botSettingsPanel, /Probar a Blacky/);
  assert.match(botSettingsPanel, /No se guarda ni se envía/);
  assert.match(botSettingsPanel, /initialTestMessage/);
  assert.match(botSettingsPanel, /onPreview\(\{ message, behavior: payload, phone: selectedTestPhone \}\)/);
  assert.match(botSettingsPanel, /Generar otra/);
  assert.match(botSettingsPanel, /Modo test/);
  assert.match(botSettingsPanel, /Activar o desactivar Modo test/);
  assert.match(botSettingsPanel, /Máquina central de WhatsApp/);
  assert.match(botSettingsPanel, /canManageCentralMachine && section === 'central'/);
  assert.match(botSettingsPanel, /Establecer esta PC como central/);
  assert.match(botSettingsPanel, /El servidor local todavía no está listo/);
  assert.match(botSettingsPanel, /role="alertdialog"/);
  assert.match(botSettingsPanel, /centralMachineError/);
  assert.match(botSettingsPanel, /centralLeaseActive/);
  assert.match(botSettingsPanel, /centralLeaseExpired/);
  assert.match(botSettingsPanel, /centralWhatsappConnected/);
  assert.match(botSettingsPanel, /wa-central-pulse/);
  assert.match(botSettingsPanel, /Los cambios de acá se aplican en el momento/);
  assert.match(view, /overview\?\.actor\?\.role \|\| ''\)\.toLowerCase\(\) === 'system'/);
  assert.match(centralMachineHelper, /expectedDeviceId: currentCentralMachine\?\.machine\?\.device_id \|\| ''/);
  assert.match(view, /claimCentralMachineForDevice/);
  assert.match(view, /reconcileCentralOverride/);
  assert.match(centralMachineHelper, /activateWhatsAppCentralMachine\(candidate\.deviceId\)/);
  assert.match(centralMachineHelper, /deactivateWhatsAppCentralMachine/);
  assert.match(view, /central_machine_local_reset_failed/);
  assert.match(view, /preserveActionError: true/);
  assert.match(view, /background: true/);
  assert.match(botSettingsPanel, /Número autorizado/);
  assert.match(botSettingsPanel, /onTestModeChange/);
  assert.match(botSettingsPanel, /Reglas y permisos/);
  assert.match(botSettingsPanel, /Temas que puede responder automáticamente/);
  assert.match(botSettingsPanel, /Prueba segura/);
  assert.match(botSettingsPanel, /Frases que no debe decir/);
  assert.match(botSettingsPanel, /Palabras que requieren una persona/);
  assert.match(botSettingsPanel, /value=\{ruleDraft\.always_do\}/);
  assert.match(botSettingsPanel, /parseList\(ruleDraft\.always_do\)/);
  assert.match(botSettingsPanel, /Hay cambios sin guardar/);
  // Personalidad: cada valor de CHOICES tiene que existir también en la lista
  // blanca del bot (BOT_VOICE_CHOICES) y en su mapa de instrucciones. Si no,
  // se elige, se guarda y Blacky sigue escribiendo igual. El test que compara
  // los dos repos vive del lado del bot (test/node-bot.test.js).
  assert.match(botSettingsPanel, /\['playful', 'Divertido'\][\s\S]*?\['festive', 'Fiestero'\][\s\S]*?\['youthful', 'Juvenil'\][\s\S]*?\['formal', 'Formal'\]/);
  assert.match(botSettingsPanel, /address_style: \[\['vos', 'Voseo'\], \['tu', 'Tuteo neutro'\], \['usted', 'Usted'\], \['mirror', 'Como el cliente'\]\]/);
  assert.match(botSettingsPanel, /reply_length: \[\['ultra_brief', 'De una línea'\]/);
  assert.match(botSettingsPanel, /\['high', 'Muchos'\], \['very_high', 'De fiesta'\]/);
  assert.match(botSettingsPanel, /slang_level: \[\['neutral', 'Neutro'\]/);
  assert.match(botSettingsPanel, /follow_up: \[\['minimal', 'Casi ninguna'\]/);
  assert.match(botSettingsPanel, /closing_style: \[\['neutral', 'Sin cierre fijo'\]/);
  assert.match(botSettingsPanel, /slang_level: 'natural',\s*\n\s*follow_up: 'light',\s*\n\s*closing_style: 'neutral',/);
  assert.match(botSettingsPanel, /Detalles de estilo<small>Si los dejás como están/);
  assert.match(botSettingsPanel, /label="Modismos argentinos"[\s\S]*?label="Repreguntas al cliente"[\s\S]*?label="Cómo se despide"/);
  assert.match(botSettingsPanel, /aria-haspopup="listbox"/);
  assert.match(botSettingsPanel, /className="wa-bot-choice-menu" role="listbox"/);
  assert.match(botSettingsPanel, /aria-selected=\{value === id\}/);
  assert.doesNotMatch(botSettingsPanel, /wa-section-copy/);
  assert.doesNotMatch(botSettingsPanel, /<em>\{index \+ 1\}<\/em>/);
  assert.match(botSettingsPanel, /id: 'mode', label: 'Funcionamiento'/);
  assert.match(botSettingsPanel, /id: 'voice', label: 'Personalidad'/);
  assert.match(botSettingsPanel, /id: 'rules', label: 'Reglas y permisos'/);
  assert.match(botSettingsPanel, /LEGACY_SECTIONS = \{[\s\S]*?identity: 'voice'[\s\S]*?limits: 'rules'/);
  assert.match(botSettingsPanel, /className="wa-bot-tool-links"/);
  assert.match(botSettingsPanel, /Volver a la configuración/);
  assert.match(botSettingsPanel, /className="wa-bot-mode-options"/);
  assert.match(botSettingsPanel, /available: false/);
  assert.match(botSettingsPanel, /id: 'copilot',[\s\S]*?available: true/);
  assert.match(botSettingsPanel, /label: 'Solo observar'/);
  assert.doesNotMatch(botSettingsPanel, /wa-bot-nav-intro/);
  assert.match(botSettingsPanel, /event\.key !== 'Tab'/);
  assert.match(botSettingsPanel, /previousFocusRef\.current\?\.focus/);
  assert.match(styles, /\.wa-bot-settings-backdrop\s*\{/);
  assert.match(styles, /\.wa-bot-settings-modal\s*\{/);
  assert.match(styles, /\.wa-bot-choice-menu\s*\{[\s\S]*?position:\s*absolute/);
  assert.match(styles, /\.wa-bot-modal-body\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) 340px/);
  assert.match(styles, /\.wa-bot-settings-nav\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
  assert.doesNotMatch(styles, /\.wa-bot-settings-nav\.with-central/);
  assert.doesNotMatch(styles, /\.wa-bot-settings-nav > button > em/);
  assert.match(styles, /\.wa-bot-subhead\s*\{/);
  assert.match(styles, /\.wa-bot-tool-head\s*\{/);
  assert.match(styles, /\.wa-bot-tool-links\s*\{/);
  assert.match(styles, /\.wa-central-station\.current\s*\{/);
  assert.match(styles, /\.wa-central-pulse\.active\s*\{/);
  assert.match(styles, /\.wa-central-pulse\.expired\s*\{/);
  assert.match(styles, /grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(styles, /\.wa-bot-modal-body\.tool-focus\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(styles, /\.wa-bot-modal-body\.tool-focus \.wa-bot-modal-preview\s*\{[\s\S]*?display:\s*none/);
  assert.match(styles, /\.wa-bot-test-result\s*\{/);
  assert.match(styles, /\.wa-bot-test-mode\s*\{/);
  assert.match(styles, /\.wa-test-mode-chip\s*\{/);
  assert.match(styles, /\.wa-test-mode-lock\s*\{/);
  assert.match(styles, /\.wa-bot-toggle-list i\.on/);
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
  assert.match(view, /initialTestMessage=\{String\(latestInboundMessage\?\.content \|\| ''\)\}/);
  assert.match(view, /whatsappOperator\.previewBotReply\(options\)/);
  assert.match(view, /overview\?\.lastActiveMode \|\| 'copilot'/);
  assert.match(view, /const testModeAllowsCurrent = !testModeEnabled/);
  assert.match(view, /Chat bloqueado por Modo test/);
  assert.match(view, /whatsappOperator\.setTestMode\(next\)/);
  assert.match(view, /canGenerate=\{canReply && !testChat && testModeAllowsCurrent\}/);
  assert.match(view, /send\(draft, quickReplySourceId\)/);
  assert.match(view, /if \(activeActionRef\.current\) return null/);
  assert.match(view, /activeActionRef\.current = key/);
  assert.match(view, /setBusy\(\(currentBusy\) => \(currentBusy === key \? '' : currentBusy\)\)/);
  // Antes loadOverview reponía la selección con setPhone((current) => ...).
  // Ahora refrescar, filtrar o marcar como leído no tocan la conversación
  // elegida porque directamente ya no hay ningún setPhone ahí adentro.
  assert.doesNotMatch(view, /setPhone\(\(current\)/);
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
  // La bandeja ya no muestra un spinner mudo: ahora va una barra con avance real.
  assert.doesNotMatch(view, /Preparando la bandeja/);
  assert.match(view, /<InboxLoadingBar progress=\{inboxProgress\} \/>/);
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
  assert.match(view, /stream\.scrollTop = stream\.scrollHeight/);
  assert.match(view, /openingScrollPhoneRef\.current = phone/);
  assert.match(view, /addEventListener\('loadedmetadata', pinAfterMediaReady, true\)/);
  assert.match(view, /const alreadySelected = phone === row\.phone/);
  assert.match(view, /alreadySelected[\s\S]*?scrollToLatest\('auto'\)/);
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
  assert.doesNotMatch(view, /className="wa-mode-options"/);
  assert.match(view, /whatsappOperator\.setMode\([\s\S]*?off \? overview\?\.lastActiveMode \|\| 'copilot' : 'off'/);
  assert.match(view, /mode=\{selectedMode\}/);
  assert.match(view, /onModeChange=\{\(nextMode\)/);
  assert.match(view, /className="wa-menu-action-wide"/);
  assert.match(view, /aria-label="Opciones del mensaje"/);
  assert.match(view, /<Sparkles \/>Generar respuesta/);
  assert.match(view, /<Pencil \/>Editar mensaje/);
  assert.match(view, /<Forward \/>Reenviar mensaje/);
  assert.match(view, /<Info \/>Informaci.n del mensaje/);
  assert.match(view, /<Trash2 \/>Eliminar mensaje/);
  assert.match(view, /menuOpen \? 'menu-open' : ''/);
  assert.match(view, /const replyable = canGenerate[\s\S]*?&& inbound/);
  assert.match(view, /canGenerate=\{canReply && !testChat && testModeAllowsCurrent\}/);
  assert.doesNotMatch(view, /target\?\.closest\?\.\('button, a, audio, video, input, textarea, \[role="menu"\]'\)/);
  assert.match(view, /className="wa-message-menu-trigger"[\s\S]*?onToggleMenu\(String\(displayRow\.id\)\)/);
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
  assert.match(styles, /\.wa-bot-mode-options > button\s*\{[\s\S]*?min-height:\s*64px/);
  assert.match(styles, /\.wa-menu-actions > button\.wa-menu-action-wide\s*\{[\s\S]*?grid-column:\s*1\s*\/\s*-1/);
});

test('la bandeja abre sin conversación elegida y siempre deja volver a la lista', async () => {
  const view = await readFile(resolve(root, 'src/views/WhatsAppInboxView.jsx'), 'utf8');
  const styles = await readFile(resolve(root, 'src/views/WhatsAppInboxView.css'), 'utf8');

  // Arranca vacía: nadie entra a un chat que no pidió abrir.
  assert.match(view, /const \[phone, setPhone\] = useState\(''\)/);

  // Refrescar la lista (incluido el refresco silencioso que dispara "marcar
  // como leído") no puede elegir conversación por su cuenta.
  const loadOverviewStart = view.indexOf('const loadOverview');
  const loadOverviewEnd = view.indexOf('const loadDetail');
  assert.ok(loadOverviewStart > 0 && loadOverviewEnd > loadOverviewStart);
  const loadOverview = view.slice(loadOverviewStart, loadOverviewEnd);
  assert.doesNotMatch(loadOverview, /setPhone\(/);
  assert.doesNotMatch(loadOverview, /conversations\?\.\[0\]\?\.phone/);
  assert.doesNotMatch(loadOverview, /row\.handoff \|\| row\.failed_message/);

  // El ref que sólo servía para sostener esa autoselección no quedó dando vueltas.
  assert.doesNotMatch(view, /manualListRef/);

  // Sólo se elige tocando una fila de la lista o volviendo atrás.
  assert.match(view, /setPhone\(row\.phone\)/);
  assert.match(view, /className=\{`wa-inbox[\s\S]*?\$\{phone \? 'has-selection' : ''\}/);

  // Sin selección se ve la bienvenida, que ahora es la primera pantalla del día.
  assert.match(view, /!current \? \([\s\S]{0,400}?wa-empty wa-empty-welcome/);
  assert.match(view, /Seleccioná una conversación/);
  assert.match(view, /lista de la izquierda/);
  assert.match(styles, /\.wa-empty-welcome\s*\{[\s\S]*?flex-direction:\s*column/);

  // El botón de volver se ve siempre, no sólo en pantalla angosta.
  assert.match(styles, /\.wa-back\s*\{[\s\S]*?display:\s*inline-flex/);
  assert.match(view, /aria-label="Volver a la lista"/);
  assert.match(view, /title="Volver a la lista"/);

  // En angosto la lista y el chat se turnan según haya selección, y ahí dentro
  // ya no hace falta redeclarar .wa-back.
  const narrowStart = styles.indexOf('@media (max-width: 820px)');
  const narrowEnd = styles.indexOf('@media', narrowStart + 10);
  assert.ok(narrowStart > 0 && narrowEnd > narrowStart);
  const narrow = styles.slice(narrowStart, narrowEnd);
  assert.match(narrow, /\.wa-inbox\.has-selection \.wa-list\s*\{[\s\S]*?display:\s*none/);
  assert.match(narrow, /\.wa-inbox:not\(\.has-selection\) \.wa-chat\s*\{[\s\S]*?display:\s*none/);
  assert.doesNotMatch(narrow, /\.wa-back\s*\{/);
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
    resolve(root, 'supabase/migrations/20260728010000_whatsapp_permission_hardening.sql'),
    'utf8',
  );

  assert.match(view, /manualSendOperationRef/);
  assert.doesNotMatch(view, /budget-text:/);
  assert.match(view, /content: `Presupuesto \$\{codigo\} por \$\{formatMoney\(value\.total\)\}`/);
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

test('mientras WhatsApp espera el escaneo se muestra el QR, no un cartel de éxito', () => {
  const view = describeWhatsAppConnection({
    connectionInfo: {
      state: { instance: { state: 'connecting' } },
      qr: { base64: 'data:image/png;base64,AAAA' },
      connected: false,
      evolution_available: true,
    },
  });

  assert.equal(view.status, 'qr');
  assert.equal(view.qrSource, 'data:image/png;base64,AAAA');
});

test('"connecting" sin QR no se anuncia como cuenta ya vinculada', () => {
  // En Baileys "connecting" significa que WhatsApp espera el escaneo, no que la
  // vinculación ya ocurrió. Anunciarlo como éxito tapa el QR para siempre.
  const view = describeWhatsAppConnection({
    connectionInfo: {
      state: { instance: { state: 'connecting' } },
      qr: null,
      connected: false,
      evolution_available: true,
    },
  });

  assert.equal(view.status, 'waiting');
});

test('el servicio local caído se distingue de estar esperando el escaneo', () => {
  const view = describeWhatsAppConnection({
    connectionInfo: {
      state: null,
      qr: null,
      connected: false,
      evolution_available: false,
      evolution_error: 'evolution_unreachable',
    },
  });

  assert.equal(view.status, 'service_down');
  assert.equal(view.code, 'evolution_unreachable');
});

test('si no se llega a la PC central, ese problema tiene prioridad', () => {
  const view = describeWhatsAppConnection({
    connectionInfo: null,
    connectionIssue: { code: 'bot_central_unreachable' },
  });

  assert.equal(view.status, 'unreachable');
});

test('una sesión abierta no pide QR', () => {
  const view = describeWhatsAppConnection({
    connectionInfo: {
      state: { instance: { state: 'open' } },
      connected: true,
      evolution_available: true,
    },
  });

  assert.equal(view.status, 'connected');
  assert.equal(view.qrSource, '');
});

test('un QR crudo sin encabezado se convierte en imagen mostrable', () => {
  const view = describeWhatsAppConnection({
    connectionInfo: { qr: { base64: 'AAAA' }, evolution_available: true },
  });

  assert.equal(view.qrSource, 'data:image/png;base64,AAAA');
});

test('la bandeja ya no anuncia "QR Detectado" mientras espera el escaneo', async () => {
  const view = await readFile(resolve(root, 'src/views/WhatsAppInboxView.jsx'), 'utf8');

  assert.doesNotMatch(view, /QR Detectado/);
  assert.match(view, /describeWhatsAppConnection/);
});

test('normalización de búsqueda elimina tildes, mayúsculas y espacios', async () => {
  const { normalizeSearchText } = await import('../src/utils/whatsappInboxHelpers.js');

  assert.equal(normalizeSearchText('  Cotillón  '), 'cotillon');
  assert.equal(normalizeSearchText('GIRASOLES'), 'girasoles');
  assert.equal(normalizeSearchText('Áéíóú Üñ'), 'aeiou un');
  assert.equal(normalizeSearchText(''), '');
  assert.equal(normalizeSearchText(null), '');
});

test('prioridad por colores según tiempo sin respuesta (verde 5m-1h, amarillo 1-3h, rojo +3h)', async () => {
  const { unansweredPriority } = await import('../src/utils/whatsappInboxHelpers.js');
  const now = new Date('2026-08-19T14:00:00Z').getTime();

  // Menos de 5 minutos: neutro/gris
  const rowRecent = {
    latest_message: { direction: 'inbound', created_at: '2026-08-19T13:57:00Z' },
  };
  assert.equal(unansweredPriority(rowRecent, now)?.tone, 'unanswered');
  assert.equal(unansweredPriority(rowRecent, now)?.color, 'gray');

  // Entre 5 minutos y 1 hora: verde
  const rowGreen = {
    latest_message: { direction: 'inbound', created_at: '2026-08-19T13:30:00Z' },
  };
  assert.equal(unansweredPriority(rowGreen, now)?.tone, 'unanswered-green');
  assert.equal(unansweredPriority(rowGreen, now)?.color, 'green');

  // Entre 1 hora y 3 horas: amarillo
  const rowYellow = {
    latest_message: { direction: 'inbound', created_at: '2026-08-19T12:00:00Z' },
  };
  assert.equal(unansweredPriority(rowYellow, now)?.tone, 'unanswered-yellow');
  assert.equal(unansweredPriority(rowYellow, now)?.color, 'yellow');

  // Más de 3 horas: rojo
  const rowRed = {
    latest_message: { direction: 'inbound', created_at: '2026-08-19T10:00:00Z' },
  };
  assert.equal(unansweredPriority(rowRed, now)?.tone, 'unanswered-red');
  assert.equal(unansweredPriority(rowRed, now)?.color, 'red');

  // Mensajes salientes respondidos: null (no aplica prioridad sin responder)
  const rowOutbound = {
    latest_message: { direction: 'outbound', created_at: '2026-08-19T10:00:00Z' },
  };
  assert.equal(unansweredPriority(rowOutbound, now), null);

  // Chat de prueba: null
  const rowTest = {
    latest_message: { direction: 'inbound', created_at: '2026-08-19T10:00:00Z', metadata: { test_fixture: true } },
  };
  assert.equal(unansweredPriority(rowTest, now), null);
});

test('la bandeja conserva el ancho izquierdo al abrir el panel derecho y soporta respuestas citadas y visor ampliado', async () => {
  const view = await readFile(resolve(root, 'src/views/WhatsAppInboxView.jsx'), 'utf8');
  const styles = await readFile(resolve(root, 'src/views/WhatsAppInboxView.css'), 'utf8');

  // 1. Panel izquierdo no se achica
  assert.match(styles, /\.wa-inbox\.context-open \.wa-line\s*\{[\s\S]*?grid-template-columns:\s*minmax\(340px,\s*390px\)/);

  // 2. Visor de imágenes en pantalla grande con zoom
  assert.match(view, /wa-image-gallery/);
  assert.match(view, /toggleFullscreenMode/);
  assert.match(view, /ZoomIn/);
  assert.match(view, /ZoomOut/);
  assert.match(styles, /\.wa-image-gallery\.is-fullscreen/);
  assert.match(styles, /\.wa-image-gallery-tool/);

  // 3. Respuestas citadas
  assert.match(view, /QuotedMessage/);
  assert.match(view, /wa-replying-bar/);
  assert.match(view, /data-message-action="reply"/);
  assert.match(styles, /\.wa-quoted-bubble/);
  assert.match(styles, /\.wa-replying-bar/);

  // 4. Búsqueda y resaltado
  assert.match(view, /highlightMatches/);
  assert.match(view, /wa-search-clear/);
  assert.match(styles, /\.wa-search-match/);
  assert.match(styles, /\.wa-search-clear/);

  // 5. Prioridades por color en estilos
  assert.match(styles, /\.unanswered-green/);
  assert.match(styles, /\.unanswered-yellow/);
  assert.match(styles, /\.unanswered-red/);
});

test('gestión de etiquetas y persistencia en whatsappTags', async () => {
  const {
    SYSTEM_TAGS,
    getTagById,
    toggleTagForPhone,
    getTagsForPhone,
  } = await import('../src/utils/whatsappTags.js');

  assert.ok(SYSTEM_TAGS.length >= 6);
  assert.equal(getTagById('budget').label, 'Presupuesto');
  assert.equal(getTagById('order').label, 'Pedido');
  assert.equal(getTagById('vip').label, 'Cliente Frecuente');

  let tagsMap = {};
  tagsMap = toggleTagForPhone(tagsMap, '5491112345678', 'budget');
  assert.deepEqual(tagsMap['5491112345678'], ['budget']);

  tagsMap = toggleTagForPhone(tagsMap, '5491112345678', 'vip');
  assert.deepEqual(tagsMap['5491112345678'], ['budget', 'vip']);

  const loadedTags = getTagsForPhone(tagsMap, '5491112345678');
  assert.equal(loadedTags.length, 2);
  assert.equal(loadedTags[0].id, 'budget');
  assert.equal(loadedTags[1].id, 'vip');

  // Toggle off
  tagsMap = toggleTagForPhone(tagsMap, '5491112345678', 'budget');
  assert.deepEqual(tagsMap['5491112345678'], ['vip']);
});

test('cálculo de historial de ventas para socios vinculados en WhatsApp', async () => {
  const { calculateMemberSalesStats } = await import('../src/utils/whatsappTags.js');

  const member = {
    id: 'm-101',
    memberNumber: '0042',
    name: 'Carolina Gómez',
    phone: '11 4455-6677',
    dni: '38111222',
  };

  const sampleTransactions = [
    {
      id: 'tx-1',
      date: '2026-08-15T14:30:00Z',
      total: 12500,
      client: { id: 'm-101', name: 'Carolina Gómez' },
      items: [{ name: 'Globos Pastel', quantity: 2 }],
      status: 'completed',
    },
    {
      id: 'tx-2',
      date: '2026-08-18T18:00:00Z',
      total: 7500,
      client: { memberNumber: '0042', name: 'Carolina Gómez' },
      items: [{ name: 'Guirnalda Feliz Cumple', quantity: 1 }],
      status: 'completed',
    },
    {
      id: 'tx-voided',
      date: '2026-08-10T10:00:00Z',
      total: 50000,
      client: { id: 'm-101' },
      status: 'voided', // Debe ignorarse
    },
    {
      id: 'tx-other',
      date: '2026-08-18T19:00:00Z',
      total: 3000,
      client: { id: 'other-client' },
      status: 'completed',
    },
  ];

  const stats = calculateMemberSalesStats(member, sampleTransactions);
  assert.equal(stats.ticketCount, 2);
  assert.equal(stats.totalSpent, 20000);
  assert.equal(stats.averageTicket, 10000);
  assert.equal(stats.lastPurchaseDate, '2026-08-18T18:00:00Z');
  assert.equal(stats.recentTransactions.length, 2);
  assert.equal(stats.recentTransactions[0].id, 'tx-2'); // Orden descendente por fecha
});

test('el panel de contacto deriva el historial del socio antes de renderizarlo', async () => {
  const view = await readFile(resolve(root, 'src/views/WhatsAppInboxView.jsx'), 'utf8');

  assert.match(view, /const memberSalesStats = useMemo\(/);
  assert.match(view, /calculateMemberSalesStats\(linkedMember, transactions\)/);
});

test('interfaz de WhatsApp soporta búsqueda interna, menú contextual, etiquetas, doble clic y rediseño de contacto', async () => {
  const view = await readFile(resolve(root, 'src/views/WhatsAppInboxView.jsx'), 'utf8');
  const styles = await readFile(resolve(root, 'src/views/WhatsAppInboxView.css'), 'utf8');

  // 1. Búsqueda dentro del chat
  assert.match(view, /ChatSearchBar/);
  assert.match(view, /wa-chat-search-bar/);
  assert.match(view, /matchingMessageIds/);
  assert.match(styles, /\.wa-chat-search-bar/);
  assert.match(styles, /\.wa-chat-search-counter/);

  // 2. Menú contextual con clic derecho
  assert.match(view, /WhatsAppContextMenu/);
  assert.match(view, /onContextMenu/);
  assert.match(styles, /\.wa-context-menu/);
  assert.match(styles, /\.wa-context-menu-head/);

  // 3. Sistema de etiquetas y selector modal
  assert.match(view, /WhatsAppTagSelectorModal/);
  assert.match(view, /wa-tag-filter-bar/);
  assert.match(view, /wa-tag-pill/);
  assert.match(view, /wa-row-tags/);
  assert.match(styles, /\.wa-tag-pill/);
  assert.match(styles, /\.wa-row-tags/);
  assert.match(styles, /\.wa-tag-modal/);

  // 4. Doble clic para abrir Contacto
  assert.match(view, /onDoubleClick/);
  assert.match(view, /setContextMode\('contact'\)/);

  // 5. Rediseño de Contacto (foto grande, historial de ventas, fotos compartidas)
  assert.match(view, /wa-contact-avatar-hero/);
  assert.match(view, /wa-contact-name-lg/);
  assert.match(view, /wa-contact-sales-box/);
  assert.match(view, /wa-contact-media-section/);
  assert.match(styles, /\.wa-avatar-hero/);
  assert.match(styles, /\.wa-contact-sales-box/);
  assert.match(styles, /\.wa-contact-media-grid/);

  // 6. Filas centradas con número en la misma línea
  assert.match(styles, /\.wa-row-middle/);
  assert.match(styles, /\.wa-row-middle \.unread/);

  // 7. Modificación y persistencia de apodos / nombres
  assert.match(view, /WhatsAppRenameContactModal/);
  assert.match(view, /wa-contact-edit-name-btn/);
  assert.match(view, /wa-contact-name-edit-form/);
  assert.match(styles, /\.wa-contact-edit-name-btn/);
  assert.match(styles, /\.wa-rename-modal/);
});

test('resolución de nombres de contacto prioriza apodo, agenda, socio y pushname y preserva nombres en búsqueda', async () => {
  const { resolveContactName, setContactAlias } = await import('../src/utils/whatsappTags.js');
  const { mergeConversationBatches } = await import('../src/utils/inboxLoadProgress.js');

  const phone = '5491154830409';
  const row = { phone, customer_name: 'Original WhatsApp' };

  // 1. Sin nada configurado: usa el nombre original de WhatsApp
  assert.equal(resolveContactName(row), 'Original WhatsApp');

  // 2. Con socio vinculado: usa el nombre del socio
  const members = [{ phone: '1154830409', name: 'Ramiro Socio' }];
  assert.equal(resolveContactName(row, { members }), 'Ramiro Socio');

  // 3. Con contacto en Agenda: tiene prioridad sobre el socio
  const agendaContacts = [{ phone: '011 5483-0409', name: 'Ramiro Agenda' }];
  assert.equal(resolveContactName(row, { members, agendaContacts }), 'Ramiro Agenda');

  // 4. Con apodo personalizado en Rebu: máxima prioridad
  const aliases = { [phone]: 'Mi Amigo Ramiro' };
  assert.equal(resolveContactName(row, { members, agendaContacts, aliases }), 'Mi Amigo Ramiro');

  // 5. Asignar y quitar apodos con setContactAlias
  const nextAliases = setContactAlias({}, phone, 'Super Ramiro');
  assert.equal(nextAliases[phone], 'Super Ramiro');
  const clearedAliases = setContactAlias(nextAliases, phone, '');
  assert.equal(clearedAliases[phone], undefined);

  // 6. mergeConversationBatches no borra el nombre si la búsqueda devuelve customer_name nulo
  const existingBatches = [{ phone, customer_name: 'Test' }];
  const searchResultsFromBackend = [{ phone, customer_name: null }];
  const merged = mergeConversationBatches(existingBatches, searchResultsFromBackend);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].customer_name, 'Test');
});

test('búsqueda de mensajes dentro de los chats y resaltado visual con animación', async () => {
  const view = await readFile(resolve(root, 'src/views/WhatsAppInboxView.jsx'), 'utf8');
  const styles = await readFile(resolve(root, 'src/views/WhatsAppInboxView.css'), 'utf8');

  // 1. Selector de mensaje con soporte para múltiples IDs agrupados
  assert.match(view, /data-msg-ids/);
  assert.match(view, /data-msg-ids~=/);
  assert.match(view, /wa-msg-highlight/);

  // 2. Resaltado de coincidencias con <mark>
  assert.match(view, /highlightMatches/);
  assert.match(view, /wa-search-match/);
  assert.match(styles, /mark\.wa-search-match/);

  // 3. Barra de búsqueda y animación de pulso
  assert.match(styles, /\.wa-chat-search-bar/);
  assert.match(styles, /\.wa-chat-search-counter/);
  assert.match(styles, /\.wa-chat-search-nav/);
  assert.match(styles, /@keyframes waMsgHighlightPulse/);
  assert.match(styles, /\.wa-message\.wa-msg-highlight/);
});
