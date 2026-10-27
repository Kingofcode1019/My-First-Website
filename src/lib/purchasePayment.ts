export type PurchasePaymentStatus = 'paid' | 'due' | 'partial';

export function getPurchasePaymentSummary(
  totalAmount: number,
  rawAmountPaid?: number,
  savedStatus?: PurchasePaymentStatus
): {
  amountPaid: number;
  amountDue: number;
  paymentStatus: PurchasePaymentStatus;
} {
  const amountPaid = rawAmountPaid === undefined
    ? savedStatus === 'paid' ? totalAmount : 0
    : Number(rawAmountPaid);
  const normalizedPaid = Number.isFinite(amountPaid) ? Math.max(0, amountPaid) : 0;
  const paymentStatus = rawAmountPaid === undefined
    ? savedStatus || 'due'
    : normalizedPaid >= totalAmount && totalAmount > 0
      ? 'paid'
      : normalizedPaid > 0 ? 'partial' : 'due';
  return {
    amountPaid: normalizedPaid,
    amountDue: Math.max(0, totalAmount - normalizedPaid),
    paymentStatus,
  };
}

export function getInitialPurchasePayment(): { amountPaid: 0; paymentStatus: 'due' } {
  return { amountPaid: 0, paymentStatus: 'due' };
}

export function applyPurchasePayment(
  totalAmount: number,
  currentAmountPaid: number | undefined,
  paymentAmount: number
): {
  amountPaid: number;
  amountDue: number;
  paymentStatus: PurchasePaymentStatus;
} {
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
    throw new Error('Purchase total must be greater than zero');
  }
  if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
    throw new Error('Payment amount must be greater than zero');
  }
  const paidBefore = Number(currentAmountPaid) || 0;
  const dueBefore = Math.max(0, totalAmount - paidBefore);
  if (paymentAmount > dueBefore) throw new Error('Payment cannot exceed the remaining purchase due');

  const amountPaid = paidBefore + paymentAmount;
  const amountDue = Math.max(0, totalAmount - amountPaid);
  return {
    amountPaid,
    amountDue,
    paymentStatus: amountDue === 0 ? 'paid' : 'partial',
  };
}
