import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  getSaleDateChange,
  parseDateTimeLocalValue,
  toDateTimeLocalValue,
} from '../src/utils/saleDate.js';

const now = new Date(2026, 9, 15, 10, 30);

test('Fecha de venta: ida y vuelta con el campo datetime-local', () => {
  const date = new Date(2026, 9, 14, 18, 5, 42);
  assert.equal(toDateTimeLocalValue(date), '2026-10-14T18:05');
  assert.equal(parseDateTimeLocalValue('2026-10-14T18:05').getTime(), new Date(2026, 9, 14, 18, 5).getTime());
  assert.equal(parseDateTimeLocalValue('2026-02-31T10:00'), null);
  assert.equal(parseDateTimeLocalValue('ayer'), null);
  assert.equal(toDateTimeLocalValue(null), '');
});

test('Fecha de venta: abrir y guardar sin tocarla no es un cambio', () => {
  const original = new Date(2026, 9, 15, 9, 12, 59);
  assert.deepEqual(getSaleDateChange(original, '2026-10-15T09:12', now), { changed: false });
  assert.deepEqual(getSaleDateChange(original, '', now), { changed: false });
});

test('Fecha de venta: pasarla a un día anterior, sin límite para atrás', () => {
  const original = new Date(2026, 9, 15, 9, 12);
  const yesterday = getSaleDateChange(original, '2026-10-14T19:40', now);
  assert.equal(yesterday.changed, true);
  assert.equal(yesterday.nextDate.getTime(), new Date(2026, 9, 14, 19, 40).getTime());
  assert.equal(yesterday.previousDate, original);

  const lastYear = getSaleDateChange(original, '2025-03-01T11:00', now);
  assert.equal(lastYear.changed, true);
});

test('Fecha de venta: no deja fechas futuras ni inválidas', () => {
  const original = new Date(2026, 9, 15, 9, 12);
  assert.match(getSaleDateChange(original, '2026-10-15T10:31', now).error, /futura/);
  assert.match(getSaleDateChange(original, '2026-10-16T09:00', now).error, /futura/);
  assert.match(getSaleDateChange(original, '2026-13-01T09:00', now).error, /válida/);
});

test('Fecha de venta: la base solo la cambia con sesión y permiso de caja', () => {
  const sql = readFileSync('supabase/migrations/20261015120000_cambiar_fecha_de_venta.sql', 'utf8');
  assert.match(sql, /create or replace function public\.change_sale_date\(/);
  assert.match(sql, /require_rebu_permission\(actor, 'register\.manage'\)/);
  assert.match(sql, /if actor is null then/);
  assert.match(sql, /p_created_at > now\(\)/);
  assert.match(sql, /revoke all on function public\.change_sale_date\(text, timestamptz\) from public, anon;/);
  assert.doesNotMatch(sql, /to [^;]*\banon\b/);
});
