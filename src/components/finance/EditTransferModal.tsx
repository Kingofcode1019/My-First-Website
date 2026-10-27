import React, { useEffect, useState } from 'react';
import { Account, Transaction } from '../../types';
import { TransferTransactionUpdate } from '../../lib/manualTransaction';
import { Modal } from '../common/Modal';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { financeService } from '../../services/finance.service';
import { formatCurrency, localDateTimeInputToISOString, toLocalDateTimeInput } from '../../lib/utils';

interface EditTransferModalProps {
  isOpen: boolean;
  transaction: Transaction | null;
  accounts: Account[];
  currencySymbol: string;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}

function dateInputValue(value: string): string {
  return toLocalDateTimeInput(value);
}

export const EditTransferModal: React.FC<EditTransferModalProps> = ({
  isOpen,
  transaction,
  accounts,
  currencySymbol,
  onClose,
  onSaved,
}) => {
  const { effectiveUid } = useAuth();
  const { success, error } = useToast();
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState('');
  const [targetAccountId, setTargetAccountId] = useState('');
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const [pendingUpdate, setPendingUpdate] = useState<TransferTransactionUpdate | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !transaction) return;
    setAmount(String(transaction.amount));
    setAccountId(transaction.accountId);
    setTargetAccountId(transaction.targetAccountId || '');
    setDate(dateInputValue(transaction.date));
    setNote(transaction.note || '');
    setReason('');
  }, [isOpen, transaction]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!transaction || !effectiveUid) return;
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      error('Transfer amount must be greater than zero');
      return;
    }
    if (!accountId || !targetAccountId || accountId === targetAccountId) {
      error('Select two different transfer accounts');
      return;
    }
    if (!date || !Number.isFinite(new Date(date).getTime())) {
      error('Enter a valid transfer date');
      return;
    }
    setPendingUpdate({
      amount: parsedAmount,
      accountId,
      targetAccountId,
      date: localDateTimeInputToISOString(date),
      note,
      reason,
    });
  };

  const confirmSave = async () => {
    if (!effectiveUid || !transaction || !pendingUpdate) return;
    try {
      setLoading(true);
      await financeService.updateTransfer(effectiveUid, transaction.id, pendingUpdate);
      success('Transfer updated and both account balances corrected');
      await onSaved();
      setPendingUpdate(null);
      onClose();
    } catch (err) {
      error(err instanceof Error ? err.message : 'Failed to update transfer');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Edit Account Transfer"
      subtitle="The existing transfer will be replaced atomically; both affected account balances are recalculated."
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        <div>
          <label className="block text-[#4a4741] font-medium mb-1">Amount ({currencySymbol}) *</label>
          <input type="number" required min="0.01" step="any" value={amount} onChange={(event) => setAmount(event.target.value)} className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg font-mono" />
        </div>
        <div>
          <label className="block text-[#4a4741] font-medium mb-1">From account *</label>
          <select required value={accountId} onChange={(event) => setAccountId(event.target.value)} className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg">
            <option value="">Select source</option>
            {accounts.map((item) => <option key={item.id} value={item.id}>{item.name} ({formatCurrency(item.currentBalance, currencySymbol)})</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[#4a4741] font-medium mb-1">To account *</label>
          <select required value={targetAccountId} onChange={(event) => setTargetAccountId(event.target.value)} className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg">
            <option value="">Select destination</option>
            {accounts.map((item) => <option key={item.id} value={item.id}>{item.name} ({formatCurrency(item.currentBalance, currencySymbol)})</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[#4a4741] font-medium mb-1">Date *</label>
          <input type="datetime-local" required value={date} onChange={(event) => setDate(event.target.value)} className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg font-mono" />
        </div>
        <div>
          <label className="block text-[#4a4741] font-medium mb-1">Description (optional)</label>
          <textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg" />
        </div>
        <div>
          <label className="block text-[#4a4741] font-medium mb-1">Correction reason (optional)</label>
          <input value={reason} onChange={(event) => setReason(event.target.value)} className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg" />
        </div>
        <div className="flex justify-end gap-3 pt-3 border-t border-[#e9e4dc]">
          <button type="button" onClick={onClose} disabled={loading} className="px-4 py-2 font-semibold text-[#4a4741] bg-white border border-[#d8d3c9] rounded-lg">Cancel</button>
          <button type="submit" disabled={loading} className="px-5 py-2 font-semibold text-white bg-[#23424d] rounded-lg">{loading ? 'Saving...' : 'Review Changes'}</button>
        </div>
      </form>
      <ConfirmDialog
        isOpen={Boolean(pendingUpdate)}
        onClose={() => setPendingUpdate(null)}
        onConfirm={confirmSave}
        loading={loading}
        title="Confirm Transfer Correction"
        message={`Save this correction to the existing transfer? Amount: ${formatCurrency(transaction?.amount || 0, currencySymbol)} → ${formatCurrency(pendingUpdate?.amount || 0, currencySymbol)}. Both account balances will be adjusted together.`}
        confirmLabel="Save Transfer"
      />
    </Modal>
  );
};
