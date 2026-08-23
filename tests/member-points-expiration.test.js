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

test('upcomingGroups agrupa por fecha y contiene la lista de socios con sus puntos a perder', () => {
  const report = buildPointExpirationReport(
    [
      { id: 10, memberNumber: 1, name: 'Ana', points: 50 },
      { id: 11, memberNumber: 2, name: 'Beto', points: 120 },
    ],
    [],
    {
      now: new Date('2026-08-10T12:00:00Z'),
      upcomingDays: 60,
      pointEntries: [
        // Ganan puntos en febrero (vencen en agosto)
        { id: 'e1', client_id: 10, delta: 50, earned_at: '2026-02-15T12:00:00Z' },
        { id: 'e2', client_id: 11, delta: 120, earned_at: '2026-02-15T12:00:00Z' },
      ],
    },
  );

  assert.equal(report.upcomingGroups.length, 1);
  const group = report.upcomingGroups[0];
  assert.equal(group.points, 170);
  assert.equal(group.memberCount, 2);
  assert.equal(Array.isArray(group.members), true);
  assert.equal(group.members.length, 2);

  // Ordenado por defecto por puntos a perder (Mayor a menor: Beto 120 > Ana 50)
  assert.equal(group.members[0].name, 'Beto');
  assert.equal(group.members[0].expiringPoints, 120);
  assert.equal(group.members[1].name, 'Ana');
  assert.equal(group.members[1].expiringPoints, 50);
});
