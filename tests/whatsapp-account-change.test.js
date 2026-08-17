import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ACCOUNT_STORAGE_KEY,
  describeAccountChange,
  readStoredAccount,
  shortAccount,
  writeStoredAccount,
} from '../src/utils/whatsappAccountChange.js';

test('avisa solo cuando el numero realmente cambio', () => {
  assert.equal(describeAccountChange({ current: '5491166384715', previous: '5491166384715' }), null);
  assert.ok(describeAccountChange({ current: '5491166384715', previous: '5491125905870' }));
});

test('no avisa la primera vez ni sin numero vinculado', () => {
  assert.equal(describeAccountChange({ current: '5491166384715', previous: '' }), null, 'primera vez');
  assert.equal(describeAccountChange({ current: '', previous: '5491125905870' }), null, 'sin vincular');
  assert.equal(describeAccountChange(), null);
});

test('el texto nombra los dos numeros y aclara que no se perdio nada', () => {
  const aviso = describeAccountChange({ current: '5491166384715', previous: '5491125905870' });
  assert.match(aviso.detail, /4715/);
  assert.match(aviso.detail, /5870/);
  assert.match(aviso.detail, /guardadas/i);
});

test('ignora diferencias de formato del mismo numero', () => {
  assert.equal(
    describeAccountChange({ current: '+54 9 11 6638-4715', previous: '5491166384715' }),
    null,
  );
});

test('shortAccount muestra los ultimos cuatro digitos', () => {
  assert.equal(shortAccount('5491166384715'), '…4715');
  assert.equal(shortAccount('+54 9 11 6638-4715'), '…4715');
  assert.equal(shortAccount(''), '');
  assert.equal(shortAccount(null), '');
});

test('el almacenamiento guarda solo digitos y aguanta fallas', () => {
  const store = new Map();
  const storage = {
    getItem: (k) => store.get(k) || null,
    setItem: (k, v) => store.set(k, v),
  };
  writeStoredAccount(storage, '+54 9 11 6638-4715');
  assert.equal(store.get(ACCOUNT_STORAGE_KEY), '5491166384715');
  assert.equal(readStoredAccount(storage), '5491166384715');

  const roto = { getItem: () => { throw new Error('bloqueado'); }, setItem: () => { throw new Error('bloqueado'); } };
  assert.equal(readStoredAccount(roto), '');
  assert.doesNotThrow(() => writeStoredAccount(roto, '549'));
  assert.equal(readStoredAccount(undefined), '');
});
