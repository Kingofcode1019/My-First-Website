import React, { useEffect, useState } from 'react';
import { Account, Transaction } from '../../types';
import { Modal } from '../common/Modal';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { financeService } from '../../services/finance.service';
import { formatCurrency, localDateTimeInputToISOString, toLocalDateTimeInput } from '../../lib/utils';
import { isInventoryPurchaseCategory } from '../../lib/financeCategories';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { ManualTransactionUpdate } from '../../lib/manualTransaction';

interface EditManualTransactionModalProps {
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

export const EditManualTransactionModal: React.FC<EditManualTransactionModalProps> = ({
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
  const [category, setCategory] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState('');
  const [reason, setReason] = useState('');
  const [pendingUpdate, setPendingUpdate] = useState<ManualTransactionUpdate | null>(null);
  const [loading, setLoading] = useState(false);
  const isLinkedPurchasePayment = Boolean(
    transaction?.type === 'expense' &&
    transaction.referenceId &&
    isInventoryPurchaseCategory(transaction.category)
  );

  useEffect(() => {
    if (!isOpen || !transaction) return;
    setAmount(String(transaction.amount));
    setAccountId(transaction.accountId);
    setCategory(transaction.category || '');
    setNote(transaction.note || '');
    setDate(dateInputValue(transaction.date));
    setReason('');
    setPendingUpdate(null);
  }, [isOpen, transaction]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!effectiveUid || !transaction) return;
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      error('Amount must be greater than zero');
      return;
    }
    if (!accountId) {
      error('Select an account');
      return;
    }
    if (!date || !Number.isFinite(new Date(date).getTime())) {
      error('Enter a valid transaction date');
      return;
    }

    setPendingUpdate({
      amount: parsedAmount,
      accountId,
      category,
      note,
      date: localDateTimeInputToISOString(date),
      reason,
    });
  };

  const confirmSave = async () => {
    if (!effectiveUid || !transaction || !pendingUpdate) return;
    try {
      setLoading(true);
      await financeService.updateManualTransaction(effectiveUid, transaction.id, pendingUpdate);
      success('Transaction updated and account balances corrected');
      await onSaved();
      setPendingUpdate(null);
      onClose();
    } catch (err) {
      error(err instanceof Error ? err.message : 'Failed to update transaction');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isLinkedPurchasePayment ? 'Edit Product Purchase Payment' : `Edit ${transaction?.type === 'income' ? 'Inflow' : 'Outflow'}`}
      subtitle={isLinkedPurchasePayment
        ? 'Updates this purchase payment, its due balance, and account balances without changing inventory.'
        : 'The existing transaction will be updated and account balances recalculated.'}
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        <div>
          <label className="block text-[#4a4741] font-medium mb-1">
            Amount ({currencySymbol}) *
          </label>
          <input
            type="number"
            required
            min="0.01"
            step="any"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg font-mono text-base font-bold"
          />
        </div>

        <div>
          <label className="block text-[#4a4741] font-medium mb-1">Account *</label>
          <select
            required
            value={accountId}
            onChange={(event) => setAccountId(event.target.value)}
            className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg"
          >
            <option value="">Select account</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name} ({formatCurrency(account.currentBalance, currencySymbol)})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[#4a4741] font-medium mb-1">
            Category{isLinkedPurchasePayment ? '' : ' (optional)'}
          </label>
          <input
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            readOnly={isLinkedPurchasePayment}
            className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg read-only:bg-[#f4f1eb]"
          />
          {isLinkedPurchasePayment && (
            <p className="mt-1 text-[10px] text-[#706c64]">
              This classification is kept as Product Purchase so it remains excluded from operating expenses.
            </p>
          )}
        </div>

        <div>
          <label className="block text-[#4a4741] font-medium mb-1">Description (optional)</label>
          <textarea
            rows={2}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg"
          />
        </div>

        <div>
          <label className="block text-[#4a4741] font-medium mb-1">Date *</label>
          <input
            type="datetime-local"
            required
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg font-mono"
          />
        </div>

        <div>
          <label className="block text-[#4a4741] font-medium mb-1">Correction reason (optional)</label>
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg"
            placeholder="Why is this transaction being corrected?"
          />
        </div>

        <div className="flex justify-end gap-3 pt-3 border-t border-[#e9e4dc]">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 font-semibold text-[#4a4741] bg-white border border-[#d8d3c9] rounded-lg"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2 font-semibold text-white bg-[#23424d] rounded-lg"
          >
            {loading ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
      <ConfirmDialog
        isOpen={Boolean(pendingUpdate)}
        onClose={() => setPendingUpdate(null)}
        onConfirm={confirmSave}
        loading={loading}
        title="Confirm Transaction Correction"
        message={`Save this correction to the existing transaction? The account effect will be recalculated once. Amount: ${formatCurrency(transaction?.amount || 0, currencySymbol)} → ${formatCurrency(pendingUpdate?.amount || 0, currencySymbol)}; account: ${transaction?.accountName || '—'} → ${accounts.find((item) => item.id === pendingUpdate?.accountId)?.name || '—'}.`}
        confirmLabel="Save Correction"
      />
    </Modal>
  );
};
