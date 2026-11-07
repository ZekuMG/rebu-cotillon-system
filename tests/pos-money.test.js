import test from 'node:test';
import assert from 'node:assert/strict';
import { getPosLineSubtotal, getPosSubtotal, roundPosMoney } from '../src/utils/posMoney.js';

test('dos pesajes suman los centavos mostrados por separado', () => {
  const weighing = { price: 8.0635, quantity: 333, product_type: 'weight' };
  assert.equal(getPosLineSubtotal(weighing), 2685.15);
  assert.equal(getPosSubtotal([weighing, weighing]), 5370.30);
  assert.equal(weighing.price, 8.0635);
});

test('la moneda conserva pesos y centavos, sin escalones comerciales', () => {
  assert.equal(getPosLineSubtotal({ price: 8.0635, quantity: 200 }), 1612.70);
  assert.equal(getPosLineSubtotal({ price: 3503, quantity: 2 }), 7006);
  assert.equal(getPosSubtotal([{ price: 8.0675, quantity: 200 }, { price: 3500, quantity: 1 }, { price: 50, quantity: 1 }]), 5163.50);
});

test('los medios centavos y los descuentos siguen el mismo criterio de signo', () => {
  assert.equal(roundPosMoney(1.005), 1.01);
  assert.equal(roundPosMoney(10.075), 10.08);
  assert.equal(roundPosMoney(-1.005), -1.01);
  assert.equal(getPosSubtotal([{ price: 1.005, quantity: 1 }, { price: -1.005, quantity: 1 }]), 0);
  assert.equal(roundPosMoney(0.1 + 0.2), 0.3);
  assert.equal(roundPosMoney('invalid'), 0);
});
