import { Account, JournalEntry, Purchase, PurchasePayment, Transaction } from '../types';
import { isInventoryPurchaseCategory } from './financeCategories';
import { getPurchasePaymentSummary } from './purchasePayment';

export interface ManualTransactionUpdate {
  amount: number;
  accountId: string;
  category?: string;
  note?: string;
  date: string;
  reason?: string;
}

export interface TransferTransactionUpdate {
  amount: number;
  accountId: string;
  targetAccountId: string;
  date: string;
  note?: string;
  reason?: string;
}

export function calculateTransferBalances(
  accounts: Account[],
  original: Transaction,
  update: TransferTransactionUpdate
): Account[] {
  if (original.type !== 'transfer' || !original.targetAccountId) {
    throw new Error('Original transaction is not a valid account transfer');
  }
  if (!Number.isFinite(original.amount) || original.amount <= 0) throw new Error('Transfer amount is invalid');
  if (!Number.isFinite(update.amount) || update.amount <= 0) throw new Error('Transfer amount must be greater than zero');
  if (!update.accountId || !update.targetAccountId || update.accountId === update.targetAccountId) {
    throw new Error('Select two different transfer accounts');
  }

  const sourceIndex = accounts.findIndex((account) => account.id === original.accountId);
  const destinationIndex = accounts.findIndex((account) => account.id === original.targetAccountId);
  const updatedSourceIndex = accounts.findIndex((account) => account.id === update.accountId);
  const updatedDestinationIndex = accounts.findIndex((account) => account.id === update.targetAccountId);
  if ([sourceIndex, destinationIndex, updatedSourceIndex, updatedDestinationIndex].some((index) => index < 0)) {
    throw new Error('One or more transfer accounts do not exist');
  }

  const balances = accounts.map((account) => ({ ...account }));
  const deltas = new Map<string, number>();
  deltas.set(original.accountId, (deltas.get(original.accountId) || 0) + original.amount);
  deltas.set(original.targetAccountId, (deltas.get(original.targetAccountId) || 0) - original.amount);
  deltas.set(update.accountId, (deltas.get(update.accountId) || 0) - update.amount);
  deltas.set(update.targetAccountId, (deltas.get(update.targetAccountId) || 0) + update.amount);
  const now = new Date().toISOString();
  for (const account of balances) {
    const delta = deltas.get(account.id) || 0;
    if (delta !== 0) {
      account.currentBalance += delta;
      account.updatedAt = now;
    }
  }
  return balances;
}

export function isStandaloneManualTransaction(transaction: Transaction): boolean {
  return (
    (transaction.type === 'income' || transaction.type === 'expense') &&
    !transaction.referenceId &&
    !transaction.orderId &&
    !transaction.customerId &&
    !transaction.supplierId &&
    !transaction.eventType &&
    !transaction.targetAccountId
  );
}

export function isPurchasePaymentTransaction(
  transaction: Transaction,
  purchases: Purchase[]
): boolean {
  if (
    transaction.type !== 'expense' ||
    !transaction.referenceId ||
    !isInventoryPurchaseCategory(transaction.category)
  ) return false;

  const purchase = purchases.find((item) => item.id === transaction.referenceId);
  const payment = purchase?.payments?.find((item) => item.id === transaction.id);
  return Boolean(
    payment &&
    payment.amount === transaction.amount &&
    payment.accountId === transaction.accountId
  );
}

export function buildUpdatedPurchasePayment(
  purchase: Purchase,
  original: Transaction,
  update: ManualTransactionUpdate,
  account: Account
): { purchase: Purchase; payment: PurchasePayment } {
  const totalAmount = Number(purchase.totalAmount ?? purchase.totalCost);
  const existingSummary = getPurchasePaymentSummary(
    totalAmount,
    purchase.amountPaid,
    purchase.paymentStatus
  );
  const paymentIndex = purchase.payments?.findIndex((item) => item.id === original.id) ?? -1;
  if (paymentIndex < 0) {
    throw new Error('Linked purchase payment history is missing; correct this payment from the purchase record');
  }
  const existingPayment = purchase.payments![paymentIndex];
  if (
    existingPayment.amount !== original.amount ||
    existingPayment.accountId !== original.accountId
  ) {
    throw new Error('Purchase payment records do not match; correct this payment from the purchase record');
  }

  const updatedAmountPaid = existingSummary.amountPaid - original.amount + update.amount;
  if (updatedAmountPaid < 0 || updatedAmountPaid > totalAmount) {
    throw new Error('Edited payment would exceed the purchase total');
  }
  const payment: PurchasePayment = {
    ...existingPayment,
    amount: update.amount,
    accountId: account.id,
    accountName: account.name,
    date: update.date,
    note: update.note?.trim(),
  };
  if (!payment.note) delete payment.note;
  const payments = [...purchase.payments!];
  payments[paymentIndex] = payment;
  const updatedSummary = getPurchasePaymentSummary(totalAmount, updatedAmountPaid);

  return {
    payment,
    purchase: {
      ...purchase,
      amountPaid: updatedSummary.amountPaid,
      paymentStatus: updatedSummary.paymentStatus,
      payments,
    },
  };
}

export function isEditableManualTransaction(
  transaction: Transaction,
  linkedJournals: JournalEntry[]
): boolean {
  return isStandaloneManualTransaction(transaction) && linkedJournals.length === 0;
}

export function calculateManualTransactionBalances(
  accounts: Account[],
  original: Transaction,
  update?: ManualTransactionUpdate
): Account[] {
  const amount = update?.amount ?? original.amount;
  const accountId = update?.accountId ?? original.accountId;
  const originalAccount = accounts.find((account) => account.id === original.accountId);
  const updatedAccount = accounts.find((account) => account.id === accountId);
  if (!originalAccount) throw new Error('Transaction account not found');
  if (!updatedAccount) throw new Error('Selected account does not exist');
  if (!Number.isFinite(original.amount) || original.amount <= 0) throw new Error('Transaction amount is invalid');
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Amount must be greater than zero');

  const direction = ['income', 'other_inflow', 'owner_investment', 'loan_received', 'refund_received']
    .includes(original.type) ? 1 : -1;
  const now = new Date().toISOString();
  const result = accounts.map((account) => ({ ...account }));
  const sourceIndex = result.findIndex((account) => account.id === original.accountId);
  const destinationIndex = result.findIndex((account) => account.id === accountId);

  if (sourceIndex === destinationIndex) {
    result[sourceIndex].currentBalance += direction * (amount - original.amount);
    result[sourceIndex].updatedAt = now;
  } else {
    result[sourceIndex].currentBalance -= direction * original.amount;
    result[sourceIndex].updatedAt = now;
    result[destinationIndex].currentBalance += direction * amount;
    result[destinationIndex].updatedAt = now;
  }
  return result;
}

export function reverseManualTransactionBalances(accounts: Account[], transaction: Transaction): Account[] {
  const account = accounts.find((item) => item.id === transaction.accountId);
  if (!account) throw new Error('Transaction account not found');
  if (!Number.isFinite(transaction.amount) || transaction.amount <= 0) {
    throw new Error('Transaction amount is invalid');
  }
  const now = new Date().toISOString();
  return accounts.map((item) => item.id === transaction.accountId
    ? {
        ...item,
        currentBalance: item.currentBalance - (
          ['income', 'other_inflow', 'owner_investment', 'loan_received', 'refund_received'].includes(transaction.type)
            ? transaction.amount
            : -transaction.amount
        ),
        updatedAt: now,
      }
    : { ...item });
}

export function buildUpdatedManualTransaction(
  original: Transaction,
  update: ManualTransactionUpdate,
  account: Account
): Transaction {
  const updated: Transaction = {
    ...original,
    amount: update.amount,
    accountId: account.id,
    accountName: account.name,
    date: update.date,
    note: update.note?.trim() || undefined,
    category: update.category?.trim() || undefined,
  };
  if (!updated.note) delete updated.note;
  if (!updated.category) delete updated.category;
  return updated;
}
