import { Account, Transaction } from '../types';

export type CourierExpenseAction = 'cancel' | 'return';

export function buildCourierFeeExpense(
  order: { id: string; orderNumber: string },
  account: Account,
  amount: number,
  action: CourierExpenseAction,
  date: string
): Transaction | null {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error('Courier fee paid by the business must be a valid non-negative amount');
  }
  if (amount === 0) return null;

  return {
    id: `courier_${action}_${order.id}`,
    type: 'expense',
    amount,
    accountId: account.id,
    accountName: account.name,
    category: 'Delivery / Courier',
    referenceId: order.orderNumber,
    linkedOrderId: order.id,
    date,
    note: `Courier fee paid by business for ${action === 'cancel' ? 'cancelled' : 'returned'} order #${order.orderNumber}`,
    createdAt: date,
  };
}
