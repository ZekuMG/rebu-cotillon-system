import test from 'node:test';
import assert from 'node:assert/strict';

import { CLOUD_SELECTS, isHistoryLogAction } from '../src/utils/cloudSelects.js';
import {
  hasHydratedSupplierLinks,
  updateStockLifecycleLinks,
} from '../src/utils/productLifecycle.js';
import {
  createPosBagSaleItem,
  getPosBagItemsSummary,
  isPosBagItem,
  POS_BAG_PRICE,
} from '../src/utils/posSaleExtras.js';
import {
  buildSharedUserAvatarCache,
  compactSharedUsersSnapshot,
  getOfflineAvatarFingerprint,
  hydrateSharedUsersSnapshotAvatars,
} from '../src/utils/offlineSnapshots.js';

test('la carga base incluye supplier_links', () => {
  assert.ok(CLOUD_SELECTS.productsList.split(',').includes('supplier_links'));
});

test('el snapshot offline de usuarios no conserva avatares pesados', () => {
  const compacted = compactSharedUsersSnapshot({
    authMode: 'supabase',
    scope: 'all',
    users: [{
      id: 'system-1',
      displayName: 'Sistema Rebu',
      role: 'system',
      avatar: `data:image/png;base64,${'A'.repeat(2_000_000)}`,
      permissionsOverride: { 'whatsapp.reply': true },
      effectivePermissions: { 'whatsapp.reply': true },
    }],
  });

  assert.equal(compacted.users[0].avatar, 'SR');
  assert.equal(
    compacted.users[0].avatarFingerprint,
    getOfflineAvatarFingerprint(`data:image/png;base64,${'A'.repeat(2_000_000)}`),
  );
  assert.equal(compacted.users[0].permissionsOverride['whatsapp.reply'], true);
  assert.ok(JSON.stringify(compacted).length < 10_000);
});

test('el arranque recupera la miniatura local sin volver a guardar la foto pesada', async () => {
  const fullAvatar = `data:image/png;base64,${'A'.repeat(250_000)}`;
  const thumbnail = 'data:image/webp;base64,miniatura';
  const snapshot = compactSharedUsersSnapshot({
    authMode: 'supabase',
    users: [{ id: 'user-1', displayName: 'Ramiro', avatar: fullAvatar }],
  });
  const avatarCache = await buildSharedUserAvatarCache(
    [{ id: 'user-1', displayName: 'Ramiro', avatar: fullAvatar }],
    { createThumbnail: async () => thumbnail },
  );
  const hydrated = hydrateSharedUsersSnapshotAvatars(snapshot, avatarCache);

  assert.equal(snapshot.users[0].avatar, 'RA');
  assert.equal(hydrated.users[0].avatar, thumbnail);
  assert.ok(JSON.stringify(avatarCache).length < 1_000);
});

test('una miniatura vieja no se aplica a un avatar que cambio', () => {
  const snapshot = compactSharedUsersSnapshot({
    authMode: 'supabase',
    users: [{ id: 'user-1', displayName: 'Ramiro', avatar: 'data:image/png;base64,nueva' }],
  });
  const hydrated = hydrateSharedUsersSnapshotAvatars(snapshot, {
    entries: {
      'user-1': {
        fingerprint: getOfflineAvatarFingerprint('data:image/png;base64,anterior'),
        avatar: 'data:image/webp;base64,vieja',
      },
    },
  });

  assert.equal(hydrated.users[0].avatar, 'RA');
});

test('el ciclo de stock conserva todos los metadatos del proveedor', () => {
  const original = {
    casa_alberto: { providerCode: 'ABC-123', price_tracking: { lastSupplierPrice: 2500 } },
    excel_import: { aliases: [{ code: 'PASTA-01' }] },
    deleted_item: { reason: 'dato historico' },
    stock_lifecycle: { customFlag: true, outOfStockSince: '2026-07-01T00:00:00.000Z' },
  };

  const result = updateStockLifecycleLinks(original, {
    stockBefore: 0,
    stockAfter: 4,
    delta: 4,
    now: '2026-07-13T14:00:00.000Z',
  });

  assert.deepEqual(result.casa_alberto, original.casa_alberto);
  assert.deepEqual(result.excel_import, original.excel_import);
  assert.deepEqual(result.deleted_item, original.deleted_item);
  assert.equal(result.stock_lifecycle.customFlag, true);
  assert.equal(result.stock_lifecycle.lastRestockedAt, '2026-07-13T14:00:00.000Z');
  assert.equal('outOfStockSince' in result.stock_lifecycle, false);
});

test('se distingue un producto hidratado de uno sin supplier_links', () => {
  assert.equal(hasHydratedSupplierLinks({ supplier_links: null }), true);
  assert.equal(hasHydratedSupplierLinks({ supplierLinks: {} }), false);
});

test('las acciones Realtime conocidas se clasifican sin usar Set.has', () => {
  assert.equal(isHistoryLogAction('Nueva Venta'), true);
  assert.equal(isHistoryLogAction('Venta Eliminada'), true);
  assert.equal(isHistoryLogAction('Accion no relacionada'), false);
  assert.equal(isHistoryLogAction(undefined), false);
});

test('la bolsita POS conserva precio fijo e identidad estadistica', () => {
  const bag = createPosBagSaleItem();

  assert.equal(bag.title, 'Bolsita');
  assert.equal(bag.price, POS_BAG_PRICE);
  assert.equal(bag.quantity, 1);
  assert.equal(isPosBagItem(bag), true);
  assert.deepEqual(getPosBagItemsSummary([bag]), {
    count: 1,
    revenue: POS_BAG_PRICE,
  });
});

test('la bolsita recargada desde sale_items sigue siendo reconocible y no exige costo', () => {
  const cloudBag = {
    product_id: null,
    product_title: 'Bolsita',
    quantity: 1,
    price: 50,
    subtotal: 50,
    is_custom: true,
  };

  assert.equal(isPosBagItem(cloudBag), true);
  assert.equal(createPosBagSaleItem().costSource, 'excluded_pos_extra');
});
