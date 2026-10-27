import assert from 'node:assert/strict';
import test from 'node:test';
import { Account, Purchase, Transaction } from '../types';
import { buildBalanceAdjustmentTransaction } from '../lib/balanceAdjustment';
import { buildEditedPurchase, updateProductForPurchaseEdit } from '../lib/purchaseEdit';
import {
  buildUpdatedPurchasePayment,
  buildUpdatedManualTransaction,
  calculateManualTransactionBalances,
  isEditableManualTransaction,
  isPurchasePaymentTransaction,
  reverseManualTransactionBalances,
  calculateTransferBalances,
} from '../lib/manualTransaction';

const accounts: Account[] = [
  {
    id: 'cash',
    name: 'Cash',
    type: 'cash',
    startingBalance: 0,
    currentBalance: 5000,
    isActive: true,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'bkash',
    name: 'bKash',
    type: 'bkash',
    startingBalance: 0,
    currentBalance: 2000,
    isActive: true,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
];

function transaction(type: 'income' | 'expense', accountId: string, amount: number): Transaction {
  const account = accounts.find((item) => item.id === accountId)!;
  return {
    id: 'transaction-1',
    type,
    amount,
    accountId,
    accountName: account.name,
    category: 'Original category',
    note: 'Original description',
    date: '2025-01-01T00:00:00.000Z',
    createdAt: '2025-01-01T00:00:00.000Z',
  };
}

test('editing an inflow amount applies only the balance difference', () => {
  const result = calculateManualTransactionBalances(accounts, transaction('income', 'cash', 5000), {
    amount: 3000,
    accountId: 'cash',
    date: '2025-01-01T00:00:00.000Z',
  });
  assert.equal(result.find((account) => account.id === 'cash')?.currentBalance, 3000);
});

test('editing an outflow amount applies only the balance difference', () => {
  const result = calculateManualTransactionBalances(accounts, transaction('expense', 'bkash', 2000), {
    amount: 1200,
    accountId: 'bkash',
    date: '2025-01-01T00:00:00.000Z',
  });
  assert.equal(result.find((account) => account.id === 'bkash')?.currentBalance, 2800);
});

test('changing an inflow account reverses the source and applies the destination effect', () => {
  const result = calculateManualTransactionBalances(accounts, transaction('income', 'cash', 5000), {
    amount: 5000,
    accountId: 'bkash',
    date: '2025-01-01T00:00:00.000Z',
  });
  assert.equal(result.find((account) => account.id === 'cash')?.currentBalance, 0);
  assert.equal(result.find((account) => account.id === 'bkash')?.currentBalance, 7000);
});

test('changing an outflow account reverses the source and deducts the destination', () => {
  const result = calculateManualTransactionBalances(accounts, transaction('expense', 'cash', 1000), {
    amount: 1000,
    accountId: 'bkash',
    date: '2025-01-01T00:00:00.000Z',
  });
  assert.equal(result.find((account) => account.id === 'cash')?.currentBalance, 6000);
  assert.equal(result.find((account) => account.id === 'bkash')?.currentBalance, 1000);
});

test('deleting inflows and outflows reverses their account effects', () => {
  const incomeResult = reverseManualTransactionBalances(accounts, transaction('income', 'cash', 1000));
  const expenseResult = reverseManualTransactionBalances(accounts, transaction('expense', 'bkash', 1000));
  assert.equal(incomeResult.find((account) => account.id === 'cash')?.currentBalance, 4000);
  assert.equal(expenseResult.find((account) => account.id === 'bkash')?.currentBalance, 3000);
});

test('updates preserve transaction ID and clear optional fields when blank', () => {
  const updated = buildUpdatedManualTransaction(transaction('income', 'cash', 5000), {
    amount: 3000,
    accountId: 'bkash',
    category: '  ',
    note: '',
    date: '2025-02-01T00:00:00.000Z',
  }, accounts[1]);
  assert.equal(updated.id, 'transaction-1');
  assert.equal(updated.accountId, 'bkash');
  assert.equal(updated.category, undefined);
  assert.equal(updated.note, undefined);
  assert.equal(updated.date, '2025-02-01T00:00:00.000Z');
});

test('only standalone transactions without journal links are eligible', () => {
  const standalone = transaction('income', 'cash', 1000);
  assert.equal(isEditableManualTransaction(standalone, []), true);
  assert.equal(isEditableManualTransaction(standalone, [{
    id: 'journal-1',
    eventType: 'other_inflow',
    sourceId: standalone.id,
    reference: standalone.id,
    date: standalone.date,
    lines: [],
    createdAt: standalone.createdAt,
  }]), false);
  assert.equal(isEditableManualTransaction({ ...standalone, supplierId: 'supplier-1' }, []), false);
});

test('editing a linked Product Purchase payment updates paid amount, due, and payment details', () => {
  const paymentTransaction: Transaction = {
    id: 'payment-1',
    type: 'expense',
    amount: 300,
    accountId: 'cash',
    accountName: 'Cash',
    category: 'Product Purchase',
    referenceId: 'purchase-1',
    date: '2025-01-01T00:00:00.000Z',
    note: 'First payment',
    createdAt: '2025-01-01T00:00:00.000Z',
  };
  const purchase: Purchase = {
    id: 'purchase-1',
    items: [],
    subtotal: 500,
    shippingCost: 0,
    totalAmount: 500,
    totalCost: 500,
    amountPaid: 300,
    paymentStatus: 'partial',
    payments: [{
      id: paymentTransaction.id,
      amount: 300,
      accountId: 'cash',
      accountName: 'Cash',
      date: paymentTransaction.date,
      note: paymentTransaction.note,
    }],
    date: paymentTransaction.date,
    createdAt: paymentTransaction.createdAt,
  };
  const update = {
    amount: 200,
    accountId: 'bkash',
    category: 'Changed category',
    note: '',
    date: '2025-02-01T00:00:00.000Z',
  };

  assert.equal(isPurchasePaymentTransaction(paymentTransaction, [purchase]), true);
  const balances = calculateManualTransactionBalances(accounts, paymentTransaction, update);
  const newAccount = balances.find((account) => account.id === 'bkash')!;
  const { purchase: updatedPurchase, payment } = buildUpdatedPurchasePayment(
    purchase,
    paymentTransaction,
    update,
    newAccount
  );
  const updatedTransaction = buildUpdatedManualTransaction(paymentTransaction, update, newAccount);

  assert.equal(balances.find((account) => account.id === 'cash')?.currentBalance, 5300);
  assert.equal(newAccount.currentBalance, 1800);
  assert.equal(updatedPurchase.amountPaid, 200);
  assert.equal(updatedPurchase.paymentStatus, 'partial');
  assert.equal(updatedPurchase.totalAmount - updatedPurchase.amountPaid!, 300);
  assert.equal(payment.accountId, 'bkash');
  assert.equal(payment.note, undefined);
  assert.equal(updatedTransaction.id, paymentTransaction.id);
});

test('linked purchase payment edit cannot increase paid total beyond purchase total', () => {
  const paymentTransaction: Transaction = {
    id: 'payment-1',
    type: 'expense',
    amount: 300,
    accountId: 'cash',
    accountName: 'Cash',
    category: 'Product Purchase',
    referenceId: 'purchase-1',
    date: '2025-01-01T00:00:00.000Z',
    createdAt: '2025-01-01T00:00:00.000Z',
  };
  const purchase: Purchase = {
    id: 'purchase-1',
    items: [],
    subtotal: 500,
    shippingCost: 0,
    totalAmount: 500,
    totalCost: 500,
    amountPaid: 300,
    paymentStatus: 'partial',
    payments: [{
      id: paymentTransaction.id,
      amount: 300,
      accountId: 'cash',
      accountName: 'Cash',
      date: paymentTransaction.date,
    }],
    date: paymentTransaction.date,
    createdAt: paymentTransaction.createdAt,
  };
  assert.throws(
    () => buildUpdatedPurchasePayment(purchase, paymentTransaction, {
      amount: 501,
      accountId: 'cash',
      date: '2025-02-01T00:00:00.000Z',
    }, accounts[0]),
    /exceed the purchase total/
  );
});

test('purchase bill edit recalculates total and due without changing the purchase identity', () => {
  const purchase: Purchase = {
    id: 'purchase-1',
    supplierId: 'supplier-1',
    supplierName: 'Supplier',
    items: [{
      productId: 'product-1',
      productName: 'Item',
      quantity: 10,
      purchasePrice: 5,
      effectiveUnitCost: 6,
      totalCost: 60,
    }],
    subtotal: 50,
    shippingCost: 10,
    totalAmount: 60,
    totalCost: 60,
    amountPaid: 20,
    paymentStatus: 'partial',
    date: '2025-01-01T00:00:00.000Z',
    createdAt: '2025-01-01T00:00:00.000Z',
  };
  const updated = buildEditedPurchase(purchase, {
    supplierId: 'supplier-1',
    supplierName: 'Supplier',
    items: [{ productId: 'product-1', productName: 'Item', quantity: 12, purchasePrice: 5 }],
    shippingCost: 12,
    date: '2025-01-02T00:00:00.000Z',
  });
  assert.equal(updated.id, purchase.id);
  assert.equal(updated.totalAmount, 72);
  assert.equal(updated.amountPaid, 20);
  assert.equal(updated.paymentStatus, 'partial');
  assert.equal(updated.totalAmount - updated.amountPaid!, 52);
  assert.deepEqual(updated.items.map((item) => item.quantity), [12]);
});

test('purchase bill cannot be edited below the amount already paid', () => {
  const purchase: Purchase = {
    id: 'purchase-1',
    items: [{ productId: 'product-1', productName: 'Item', quantity: 10, purchasePrice: 10, effectiveUnitCost: 10, totalCost: 100 }],
    subtotal: 100,
    shippingCost: 0,
    totalAmount: 100,
    totalCost: 100,
    amountPaid: 80,
    date: '2025-01-01T00:00:00.000Z',
    createdAt: '2025-01-01T00:00:00.000Z',
  };
  assert.throws(() => buildEditedPurchase(purchase, {
    items: [{ productId: 'product-1', productName: 'Item', quantity: 5, purchasePrice: 10 }],
    shippingCost: 0,
    date: '2025-01-01T00:00:00.000Z',
  }), /lower than the amount already paid/);
});

test('purchase quantity correction adjusts the existing stock rather than adding the full bill twice', () => {
  const updated = updateProductForPurchaseEdit(18, 10, 0, {
    productId: 'product-1',
    productName: 'Item',
    quantity: 10,
    purchasePrice: 10,
    effectiveUnitCost: 10,
    totalCost: 100,
  }, {
    productId: 'product-1',
    productName: 'Item',
    quantity: 12,
    purchasePrice: 10,
    effectiveUnitCost: 10,
    totalCost: 120,
  });
  assert.equal(updated.currentStock, 20);
  assert.equal(updated.purchasePrice, 10);
});

test('editing a transfer corrects both accounts once and preserves the net balance', () => {
  const transfer: Transaction = {
    id: 'transfer-1',
    type: 'transfer',
    amount: 200,
    accountId: 'cash',
    accountName: 'Cash',
    targetAccountId: 'bkash',
    targetAccountName: 'bKash',
    date: '2025-01-01T00:00:00.000Z',
    createdAt: '2025-01-01T00:00:00.000Z',
  };
  const current = accounts.map((account) => ({
    ...account,
    currentBalance: account.id === 'cash' ? 800 : 700,
  }));
  const adjusted = calculateTransferBalances(current, transfer, {
    amount: 300,
    accountId: 'cash',
    targetAccountId: 'bkash',
    date: '2025-02-01T00:00:00.000Z',
  });
  assert.equal(adjusted.find((account) => account.id === 'cash')?.currentBalance, 700);
  assert.equal(adjusted.find((account) => account.id === 'bkash')?.currentBalance, 800);
  assert.equal(adjusted.reduce((sum, account) => sum + account.currentBalance, 0), 1500);
});

test('balance adjustment records an explicit non-income difference and previous balance', () => {
  const adjustment = buildBalanceAdjustmentTransaction(
    { ...accounts[0], currentBalance: 975 },
    {
      actualBalance: 900,
      reason: 'Cash count',
      date: '2025-02-01T00:00:00.000Z',
      responsibleUserId: 'user-1',
      idempotencyKey: 'request-1',
    },
    'adjust_request-1',
    '2025-02-01T00:00:00.000Z'
  );
  assert.equal(adjustment.type, 'balance_adjustment');
  assert.equal(adjustment.amount, 75);
  assert.equal(adjustment.previousBalance, 975);
  assert.equal(adjustment.adjustedBalance, 900);
  assert.equal(adjustment.adjustmentDifference, -75);
  assert.equal(adjustment.idempotencyKey, 'request-1');
});
