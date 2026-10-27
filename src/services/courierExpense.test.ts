import assert from 'node:assert/strict';
import test from 'node:test';
import { Account } from '../types';
import { buildCourierFeeExpense } from './courierExpense';

const account: Account = {
  id: 'cash',
  name: 'Cash',
  type: 'cash',
  startingBalance: 100,
  currentBalance: 100,
  isActive: true,
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
};

test('zero business-paid courier fee creates no expense', () => {
  assert.equal(buildCourierFeeExpense({ id: 'order-1', orderNumber: 'ORD-1' }, account, 0, 'return', '2026-01-01'), null);
});

test('positive business-paid courier fee creates one linked operating expense', () => {
  const transaction = buildCourierFeeExpense(
    { id: 'order-1', orderNumber: 'ORD-1' },
    account,
    25,
    'return',
    '2026-01-01'
  );
  assert.equal(transaction?.id, 'courier_return_order-1');
  assert.equal(transaction?.type, 'expense');
  assert.equal(transaction?.amount, 25);
  assert.equal(transaction?.category, 'Delivery / Courier');
  assert.equal(transaction?.accountId, 'cash');
  assert.equal(transaction?.linkedOrderId, 'order-1');
});

test('negative courier fee is rejected', () => {
  assert.throws(
    () => buildCourierFeeExpense({ id: 'order-1', orderNumber: 'ORD-1' }, account, -1, 'cancel', '2026-01-01'),
    /non-negative/
  );
});
