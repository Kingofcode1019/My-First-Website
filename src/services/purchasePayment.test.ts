import assert from 'node:assert/strict';
import test from 'node:test';
import { applyPurchasePayment, getInitialPurchasePayment, getPurchasePaymentSummary } from '../lib/purchasePayment';

test('new inventory purchases start unpaid without deducting an account balance', () => {
  assert.deepEqual(getInitialPurchasePayment(), {
    amountPaid: 0,
    paymentStatus: 'due',
  });
});

test('purchase history summary reports paid, partially paid, and unpaid balances', () => {
  assert.deepEqual(getPurchasePaymentSummary(10_000, 10_000, 'paid'), {
    amountPaid: 10_000,
    amountDue: 0,
    paymentStatus: 'paid',
  });
  assert.deepEqual(getPurchasePaymentSummary(10_000, 3_000, 'partial'), {
    amountPaid: 3_000,
    amountDue: 7_000,
    paymentStatus: 'partial',
  });
  assert.deepEqual(getPurchasePaymentSummary(10_000, undefined, 'due'), {
    amountPaid: 0,
    amountDue: 10_000,
    paymentStatus: 'due',
  });
});

test('purchase due payments accumulate and set paid status only when the due reaches zero', () => {
  assert.deepEqual(applyPurchasePayment(10_000, 0, 3_000), {
    amountPaid: 3_000,
    amountDue: 7_000,
    paymentStatus: 'partial',
  });
  assert.deepEqual(applyPurchasePayment(10_000, 3_000, 7_000), {
    amountPaid: 10_000,
    amountDue: 0,
    paymentStatus: 'paid',
  });
});

test('purchase due payment rejects zero, negative, and over-due amounts', () => {
  assert.throws(() => applyPurchasePayment(10_000, 0, 0), /greater than zero/);
  assert.throws(() => applyPurchasePayment(10_000, 0, -1), /greater than zero/);
  assert.throws(() => applyPurchasePayment(10_000, 3_000, 7_001), /cannot exceed/);
});
