import assert from 'node:assert/strict';
import test from 'node:test';
import { createInvoiceNumber, createOrderNumber, getInvoiceNumber } from '../lib/invoice';

test('invoice and order numbers are stable and unique for generated order IDs', () => {
  const issuedAt = '2026-10-11T15:00:00.000Z';
  const firstInvoice = createInvoiceNumber('firebase-order-a8f7c2', issuedAt);
  const secondInvoice = createInvoiceNumber('firebase-order-b1d9e4', issuedAt);

  assert.equal(firstInvoice, 'INV-20261011-FIREBASEORDERA8F7C2');
  assert.notEqual(firstInvoice, secondInvoice);
  assert.equal(createOrderNumber('order-a8f7c2'), 'ORD-ORDERA8F7C2');
});

test('legacy orders use their existing order number as the invoice reference', () => {
  assert.equal(getInvoiceNumber({ id: 'legacy-id', orderNumber: 'ORD-000123' }), 'ORD-000123');
});
