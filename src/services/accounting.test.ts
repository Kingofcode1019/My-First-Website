import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addOrderPayment,
  buildCustomerPaymentJournalLines,
  buildOtherInflowJournalLines,
  buildSaleJournalLines,
  calculateNetProfit,
  calculateSaleAmounts,
  getInitialPaymentStatus,
  getOrderAmountDue,
} from './accounting';
import { Order } from '../types';

const sampleOrder = (overrides: Partial<Order> = {}): Order => ({
  id: 'order-1',
  orderNumber: 'ORD-0001',
  customerId: 'customer-1',
  customerName: 'Rahim',
  customerPhone: '01700000000',
  customerAddress: 'Dhaka',
  items: [{ productId: 'shirt', productName: 'T-Shirt', sku: 'TS-1', quantity: 2, sellingPrice: 800, purchasePrice: 500, total: 1600 }],
  subtotal: 1600,
  discount: 0,
  deliveryCharge: 0,
  totalAmount: 1600,
  paymentMethod: 'Cash',
  paymentStatus: 'unpaid',
  orderStatus: 'delivered',
  stockDeducted: true,
  saleRecognized: true,
  revenueRecorded: true,
  orderDate: '2026-10-08T00:00:00.000Z',
  createdAt: '2026-10-08T00:00:00.000Z',
  updatedAt: '2026-10-08T00:00:00.000Z',
  ...overrides,
});

test('supplied sale scenario keeps revenue, COGS, cash and receivables separate', () => {
  const sale = calculateSaleAmounts([
    { quantity: 2, sellingPrice: 800, purchasePrice: 500, total: 1600 },
  ], 0, 0);
  assert.equal(sale.productRevenue, 1600);
  assert.equal(sale.cogs, 1000);
  assert.equal(sale.grossProfit, 600);

  const cashSaleLines = buildSaleJournalLines({ amounts: sale, amountPaid: 1600, accountId: 'bkash' });
  assert.equal(cashSaleLines.find((line) => line.account === 'cash')?.debit, 1600);
  assert.equal(cashSaleLines.find((line) => line.account === 'accounts_receivable'), undefined);

  const creditSaleLines = buildSaleJournalLines({ amounts: sale, amountPaid: 0 });
  assert.equal(creditSaleLines.find((line) => line.account === 'accounts_receivable')?.debit, 1600);
  assert.equal(creditSaleLines.find((line) => line.account === 'cash'), undefined);

  const creditOrder = sampleOrder({ amountDue: 1600 });
  const payment = addOrderPayment(creditOrder, {
    id: 'payment-1', type: 'ar_payment', amount: 1000, accountId: 'bkash', date: '2026-10-08T00:00:00.000Z',
  });
  assert.equal(payment.amountPaid, 1000);
  assert.equal(payment.amountDue, 600);
  assert.equal(payment.paymentStatus, 'partially_paid');
  assert.equal(getOrderAmountDue({ ...creditOrder, ...payment }), 600);
  assert.equal(buildCustomerPaymentJournalLines(1000, 'bkash').find((line) => line.account === 'sales_revenue'), undefined);

  assert.equal(calculateNetProfit(3200, 2000, 200), 1000);
});

test('owner capital and loan proceeds are not classified as product sales', () => {
  const capital = buildOtherInflowJournalLines(20000, 'bkash', 'owner_investment');
  const loan = buildOtherInflowJournalLines(50000, 'bank', 'loan_received');
  assert.equal(capital.find((line) => line.account === 'owner_equity')?.credit, 20000);
  assert.equal(loan.find((line) => line.account === 'loan_payable')?.credit, 50000);
  assert.equal(capital.find((line) => line.account === 'sales_revenue'), undefined);
  assert.equal(loan.find((line) => line.account === 'sales_revenue'), undefined);
});

test('cash-on-delivery orders stay pending until cash is actually collected', () => {
  const codOrder = sampleOrder({
    paymentMethod: 'Cash on Delivery',
    paymentStatus: 'pending',
    amountPaid: 0,
    amountDue: 1600,
    payments: [],
    revenueRecorded: false,
  });

  const pendingStatus = getInitialPaymentStatus('Cash on Delivery');
  assert.equal(pendingStatus, 'pending');

  const collected = addOrderPayment(codOrder, {
    id: 'payment-1',
    type: 'ar_payment',
    amount: 1600,
    accountId: 'cash',
    date: '2026-10-09T00:00:00.000Z',
    reference: 'COD-001',
  });

  assert.equal(collected.paymentStatus, 'paid');
  assert.equal(collected.amountDue, 0);
  assert.throws(() => addOrderPayment({ ...codOrder, ...collected }, {
    id: 'payment-1',
    type: 'ar_payment',
    amount: 1600,
    accountId: 'cash',
    date: '2026-10-09T00:00:00.000Z',
    reference: 'COD-001',
  }), /Duplicate payment already recorded/);
});