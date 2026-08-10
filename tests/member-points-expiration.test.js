import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPointExpirationReport } from '../src/utils/memberPointsExpiration.js';

test('usa la fecha real del libro mayor para vencer puntos de pagos de pedidos', () => {
  const report = buildPointExpirationReport(
    [{ id: 7, name: 'Socio', points: 3, createdAt: '2025-01-01T00:00:00Z' }],
    [],
    {
      now: new Date('2026-08-10T12:00:00Z'),
      pointEntries: [{
        id: 'entry-1',
        client_id: 7,
        delta: 3,
        entry_type: 'order_payment',
        earned_at: '2026-01-01T12:00:00Z',
      }],
    },
  );

  assert.equal(report.totals.expiredPoints, 3);
  assert.equal(report.expiredMembers[0].expiredLots[0].sourceType, 'order_payment');
});

test('las reversiones del ledger consumen primero los lotes mÃ¡s antiguos', () => {
  const report = buildPointExpirationReport(
    [{ id: 8, name: 'Socio 2', points: 2 }],
    [],
    {
      now: new Date('2026-08-10T12:00:00Z'),
      upcomingDays: 180,
      pointEntries: [
        { id: 'old', client_id: 8, delta: 2, earned_at: '2026-01-01T12:00:00Z' },
        { id: 'new', client_id: 8, delta: 2, earned_at: '2026-07-01T12:00:00Z' },
        { id: 'reverse', client_id: 8, delta: -2, earned_at: '2026-07-02T12:00:00Z' },
      ],
    },
  );

  assert.equal(report.totals.expiredPoints, 0);
  assert.equal(report.totals.upcomingPoints, 2);
});

test('un saldo sin fecha comprobable no vence de inmediato', () => {
  const report = buildPointExpirationReport(
    [{ id: 9, name: 'Saldo legado', points: 5, createdAt: '2020-01-01T00:00:00Z' }],
    [],
    { now: new Date('2026-08-10T12:00:00Z'), pointEntries: [] },
  );

  assert.equal(report.totals.expiredPoints, 0);
});
