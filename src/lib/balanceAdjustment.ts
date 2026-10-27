import { Account, Transaction } from '../types';

export interface BalanceAdjustmentInput {
  actualBalance: number;
  reason: string;
  date: string;
  responsibleUserId: string;
  idempotencyKey: string;
}

export function buildBalanceAdjustmentTransaction(
  account: Account,
  input: BalanceAdjustmentInput,
  transactionId: string,
  createdAt: string
): Transaction {
  if (!Number.isFinite(input.actualBalance)) throw new Error('Enter a valid actual balance');
  if (!input.reason.trim()) throw new Error('Enter a reason for the balance adjustment');
  if (!input.responsibleUserId) throw new Error('Adjustment responsible user is missing');
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(input.idempotencyKey)) {
    throw new Error('Adjustment request is missing a valid unique key');
  }
  if (!Number.isFinite(new Date(input.date).getTime())) throw new Error('Enter a valid adjustment date');

  const previousBalance = Number(account.currentBalance) || 0;
  const difference = input.actualBalance - previousBalance;
  return {
    id: transactionId,
    type: 'balance_adjustment',
    amount: Math.abs(difference),
    accountId: account.id,
    accountName: account.name,
    category: 'Balance Adjustment',
    referenceId: transactionId,
    previousBalance,
    adjustedBalance: input.actualBalance,
    adjustmentDifference: difference,
    adjustmentReason: input.reason.trim(),
    adjustedBy: input.responsibleUserId,
    idempotencyKey: input.idempotencyKey,
    date: input.date,
    note: input.reason.trim(),
    createdAt,
  };
}
