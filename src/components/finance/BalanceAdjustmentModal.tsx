import React, { useMemo, useState } from 'react';
import { Account } from '../../types';
import { Modal } from '../common/Modal';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { financeService } from '../../services/finance.service';
import { formatCurrency, localDateTimeInputToISOString, toLocalDateTimeInput } from '../../lib/utils';

interface BalanceAdjustmentModalProps {
  isOpen: boolean;
  accounts: Account[];
  currencySymbol: string;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}

export const BalanceAdjustmentModal: React.FC<BalanceAdjustmentModalProps> = ({
  isOpen,
  accounts,
  currencySymbol,
  onClose,
  onSaved,
}) => {
  const { effectiveUid } = useAuth();
  const { success, error } = useToast();
  const [accountId, setAccountId] = useState('');
  const [actualBalance, setActualBalance] = useState('');
  const [reason, setReason] = useState('');
  const [date, setDate] = useState(toLocalDateTimeInput);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [loading, setLoading] = useState(false);
  const account = accounts.find((item) => item.id === accountId);
  const difference = useMemo(
    () => Number(actualBalance) - (Number(account?.currentBalance) || 0),
    [account, actualBalance]
  );

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!effectiveUid || !account) return;
    const balance = Number(actualBalance);
    if (!Number.isFinite(balance)) {
      error('Enter a valid actual balance');
      return;
    }
    if (!reason.trim()) {
      error('Enter a reason for the adjustment');
      return;
    }
    if (!date || !Number.isFinite(new Date(date).getTime())) {
      error('Enter a valid adjustment date');
      return;
    }

    try {
      setLoading(true);
      await financeService.recordBalanceAdjustment(effectiveUid, {
        accountId,
        actualBalance: balance,
        reason: reason.trim(),
        date: localDateTimeInputToISOString(date),
        idempotencyKey,
      });
      success('Account reconciled and adjustment history recorded');
      setAccountId('');
      setActualBalance('');
      setReason('');
      setDate(toLocalDateTimeInput());
      setIdempotencyKey(crypto.randomUUID());
      await onSaved();
      onClose();
    } catch (err) {
      error(err instanceof Error ? err.message : 'Could not adjust account balance');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Adjust Account Balance"
      subtitle="Reconcile Business Manager with a counted cash, wallet, or bank balance. This is recorded separately from income and expenses."
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        <div>
          <label className="block text-[#4a4741] font-medium mb-1">Account *</label>
          <select
            required
            value={accountId}
            onChange={(event) => setAccountId(event.target.value)}
            className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg"
          >
            <option value="">Select account</option>
            {accounts.filter((item) => item.isActive).map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} ({formatCurrency(item.currentBalance, currencySymbol)})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[#4a4741] font-medium mb-1">Actual balance ({currencySymbol}) *</label>
          <input
            type="number"
            required
            step="any"
            value={actualBalance}
            onChange={(event) => setActualBalance(event.target.value)}
            className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg font-mono"
          />
        </div>
        {account && actualBalance !== '' && Number.isFinite(difference) && (
          <div className="rounded-xl border border-[#d8d3c9] bg-[#faf8f5] p-3">
            <div className="flex justify-between gap-3 text-[#706c64]">
              <span>Current Business Manager balance</span>
              <strong>{formatCurrency(account.currentBalance, currencySymbol)}</strong>
            </div>
            <div className="flex justify-between gap-3 mt-1 text-[#1c1b18]">
              <span>Adjustment difference</span>
              <strong className="font-mono">
                {difference > 0 ? '+' : ''}{formatCurrency(difference, currencySymbol)}
              </strong>
            </div>
          </div>
        )}
        <div>
          <label className="block text-[#4a4741] font-medium mb-1">Reason *</label>
          <textarea
            required
            rows={2}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg"
            placeholder="For example: physical cash count"
          />
        </div>
        <div>
          <label className="block text-[#4a4741] font-medium mb-1">Date and Time *</label>
          <input
            type="datetime-local"
            required
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg font-mono"
          />
        </div>
        <div className="flex justify-end gap-3 pt-3 border-t border-[#e9e4dc]">
          <button type="button" onClick={onClose} disabled={loading} className="px-4 py-2 font-semibold text-[#4a4741] bg-white border border-[#d8d3c9] rounded-lg">
            Cancel
          </button>
          <button type="submit" disabled={loading || !accountId} className="px-5 py-2 font-semibold text-white bg-[#23424d] rounded-lg disabled:opacity-50">
            {loading ? 'Saving...' : 'Record Adjustment'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
