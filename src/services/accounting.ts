import { AccountingAccount, JournalEntry, JournalLine, Order, OrderItem, OrderPayment, PaymentStatus } from '../types';

export interface SaleAmounts {
  productRevenue: number;
  deliveryIncome: number;
  totalCollectedValue: number;
  cogs: number;
  grossProfit: number;
}

export function calculateSaleAmounts(
  items: Pick<OrderItem, 'quantity' | 'sellingPrice' | 'purchasePrice' | 'total'>[],
  discount: number,
  deliveryCharge: number
): SaleAmounts {
  const subtotal = items.reduce((sum, item) => sum + (item.total ?? item.quantity * item.sellingPrice), 0);
  const productRevenue = Math.max(0, subtotal - Math.max(0, discount || 0));
  const deliveryIncome = Math.max(0, deliveryCharge || 0);
  const cogs = items.reduce((sum, item) => sum + Math.max(0, item.purchasePrice || 0) * Math.max(0, item.quantity || 0), 0);
  return {
    productRevenue,
    deliveryIncome,
    totalCollectedValue: productRevenue + deliveryIncome,
    cogs,
    grossProfit: productRevenue - cogs,
  };
}

export function getInitialPaymentStatus(paymentMethod: string): PaymentStatus {
  const method = (paymentMethod || '').trim().toLowerCase();
  if (method.includes('cash on delivery') || method.includes('cod')) return 'pending';
  return 'paid';
}

export function getPaymentStatus(totalAmount: number, amountPaid: number): PaymentStatus {
  const total = Math.max(0, Number(totalAmount) || 0);
  const paid = Math.min(total, Math.max(0, Number(amountPaid) || 0));
  if (paid === 0) return 'unpaid';
  if (paid >= total) return 'paid';
  return 'partially_paid';
}

export function getOrderAmountDue(order: Pick<Order, 'totalAmount' | 'paymentStatus' | 'amountPaid' | 'amountDue' | 'saleRecognized'>): number {
  if (order.saleRecognized === false) return 0;
  if (typeof order.amountDue === 'number') return Math.max(0, order.amountDue);
  if (order.paymentStatus === 'paid' || order.paymentStatus === 'refunded' || order.paymentStatus === 'pending') return 0;
  const legacyPaid = order.paymentStatus === 'partially_paid' ? Number(order.amountPaid) || 0 : 0;
  return Math.max(0, order.totalAmount - legacyPaid);
}

export function sumAccountsReceivable(orders: Pick<Order, 'totalAmount' | 'paymentStatus' | 'amountPaid' | 'amountDue' | 'saleRecognized'>[]): number {
  return orders.reduce((sum, order) => sum + getOrderAmountDue(order), 0);
}

export function calculateNetProfit(productRevenue: number, cogs: number, operatingExpenses: number): number {
  return productRevenue - cogs - operatingExpenses;
}

export function assertJournalBalanced(lines: { debit: number; credit: number }[]): void {
  const debit = lines.reduce((sum, line) => sum + line.debit, 0);
  const credit = lines.reduce((sum, line) => sum + line.credit, 0);
  if (Math.abs(debit - credit) > 0.005) {
    throw new Error(`Unbalanced accounting entry: debits ${debit}, credits ${credit}`);
  }
}

export function makeJournalEntry(input: {
  id: string;
  eventType: JournalEntry['eventType'];
  sourceId: string;
  reference: string;
  date: string;
  note?: string;
  lines: JournalLine[];
}): JournalEntry {
  assertJournalBalanced(input.lines);
  return { ...input, createdAt: new Date().toISOString() };
}

function line(account: AccountingAccount, debit: number, credit: number, accountId?: string) {
  return { account, debit, credit, ...(accountId ? { accountId } : {}) };
}

export function buildSaleJournalLines(input: {
  amounts: SaleAmounts;
  amountPaid: number;
  accountId?: string;
}): ReturnType<typeof line>[] {
  const paid = Math.max(0, input.amountPaid);
  if (paid > 0 && !input.accountId) throw new Error('An account is required for collected sale payments');
  const due = Math.max(0, input.amounts.totalCollectedValue - paid);
  const lines = [
    ...(paid > 0 ? [line('cash', paid, 0, input.accountId)] : []),
    ...(due > 0 ? [line('accounts_receivable', due, 0)] : []),
    ...(input.amounts.productRevenue > 0 ? [line('sales_revenue', 0, input.amounts.productRevenue)] : []),
    ...(input.amounts.deliveryIncome > 0 ? [line('delivery_income', 0, input.amounts.deliveryIncome)] : []),
    ...(input.amounts.cogs > 0 ? [line('cogs', input.amounts.cogs, 0), line('inventory', 0, input.amounts.cogs)] : []),
  ];
  assertJournalBalanced(lines);
  return lines;
}

export function buildCustomerPaymentJournalLines(amount: number, accountId: string) {
  if (amount <= 0 || !accountId) throw new Error('A positive payment and deposit account are required');
  const lines = [line('cash', amount, 0, accountId), line('accounts_receivable', 0, amount)];
  assertJournalBalanced(lines);
  return lines;
}

export function buildOperatingExpenseJournalLines(amount: number, accountId: string) {
  if (amount <= 0 || !accountId) throw new Error('A positive expense and payment account are required');
  const lines = [line('operating_expense', amount, 0), line('cash', 0, amount, accountId)];
  assertJournalBalanced(lines);
  return lines;
}

export function buildOtherInflowJournalLines(
  amount: number,
  accountId: string,
  classification: 'other_income' | 'owner_investment' | 'loan_received' | 'refund_received'
) {
  if (amount <= 0 || !accountId) throw new Error('A positive inflow and deposit account are required');
  const offsetAccount: AccountingAccount = classification === 'owner_investment'
    ? 'owner_equity'
    : classification === 'loan_received'
      ? 'loan_payable'
      : 'other_income';
  const lines = [line('cash', amount, 0, accountId), line(offsetAccount, 0, amount)];
  assertJournalBalanced(lines);
  return lines;
}

export function addOrderPayment(
  order: Order,
  payment: OrderPayment
): Pick<Order, 'amountPaid' | 'amountDue' | 'paymentStatus' | 'payments'> {
  if (payment.amount <= 0) throw new Error('Payment must be greater than zero');

  const existingPayments = order.payments || [];
  const duplicate = existingPayments.some((entry) => {
    if (entry.id === payment.id) return true;
    if (payment.reference && entry.reference === payment.reference) return true;
    return false;
  });
  if (duplicate) throw new Error('Duplicate payment already recorded for this order');

  const currentPaid = Math.max(0, Number(order.amountPaid) || 0);
  const nextPaid = currentPaid + payment.amount;
  if (nextPaid > order.totalAmount + 0.005) throw new Error('Payment cannot exceed the order balance');
  const amountDue = Math.max(0, order.totalAmount - nextPaid);
  return {
    amountPaid: nextPaid,
    amountDue,
    paymentStatus: getPaymentStatus(order.totalAmount, nextPaid),
    payments: [...existingPayments, payment],
  };
}