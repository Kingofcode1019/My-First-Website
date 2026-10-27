import React, { useState, useEffect } from 'react';
import { Modal } from '../common/Modal';
import { Account } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { financeService } from '../../services/finance.service';
import { formatCurrency, localDateTimeInputToISOString, toLocalDateTimeInput } from '../../lib/utils';
import { FinanceCategory } from '../../types';
import { financeCategoryKey, PREDEFINED_FINANCE_CATEGORIES } from '../../lib/financeCategories';

interface ExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: Account[];
  currencySymbol: string;
  onSaved: () => void;
}

export const ExpenseModal: React.FC<ExpenseModalProps> = ({
  isOpen,
  onClose,
  accounts,
  currencySymbol,
  onSaved,
}) => {
  const { effectiveUid } = useAuth();
  const { success, error } = useToast();
  const [loading, setLoading] = useState(false);

  const [amount, setAmount] = useState<number>(0);
  const [accountId, setAccountId] = useState('');
  const [category, setCategory] = useState('');
  const [customCategoryName, setCustomCategoryName] = useState('');
  const [savedCategories, setSavedCategories] = useState<FinanceCategory[]>([]);
  const [note, setNote] = useState('');
  const [date, setDate] = useState(toLocalDateTimeInput);

  useEffect(() => {
    if (isOpen) {
      setAmount(0);
      setAccountId(accounts[0]?.id || '');
      setCategory('');
      setCustomCategoryName('');
      setNote('');
      setDate(toLocalDateTimeInput());
    }
  }, [isOpen, accounts]);

  useEffect(() => {
    let cancelled = false;
    if (!isOpen || !effectiveUid) return;
    financeService.getFinanceCategories(effectiveUid, 'expense')
      .then((categories) => {
        if (!cancelled) setSavedCategories(categories);
      })
      .catch((err: unknown) => {
        if (!cancelled) error(err instanceof Error ? err.message : 'Failed to load expense categories');
      });
    return () => { cancelled = true; };
  }, [isOpen, effectiveUid, error]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveUid) return;
    if (!Number.isFinite(amount) || amount <= 0) {
      error('Amount must be greater than 0');
      return;
    }
    if (!accountId) {
      error('Please select an account');
      return;
    }

    try {
      setLoading(true);
      const selectedCategory = category === 'Other'
        ? customCategoryName.trim() || 'Other'
        : category;
      if (
        category === 'Other' &&
        customCategoryName.trim() &&
        !PREDEFINED_FINANCE_CATEGORIES.expense
          .some((name) => financeCategoryKey(name) === financeCategoryKey(customCategoryName))
      ) {
        await financeService.saveFinanceCategory(effectiveUid, 'expense', customCategoryName);
      }
      const transactionData = {
        amount: Number(amount),
        accountId,
        ...(category ? { category: selectedCategory } : {}),
        date: localDateTimeInputToISOString(date),
        note: note.trim(),
      };

      if (category === 'Equipment / Fixed Asset') {
        await financeService.recordAssetPurchase(effectiveUid, transactionData);
        success('Asset purchase recorded and deducted from wallet');
      } else {
        await financeService.recordExpense(effectiveUid, transactionData);
        success('Expense recorded and deducted from wallet');
      }
      onSaved();
      onClose();
    } catch (err: any) {
      error(err.message || 'Failed to record expense');
    } finally {
      setLoading(false);
    }
  };

  const archiveSelectedCategory = async () => {
    const saved = savedCategories.find((item) => item.name === category);
    if (!effectiveUid || !saved) return;
    try {
      await financeService.archiveFinanceCategory(effectiveUid, saved.id);
      setSavedCategories((current) => current.filter((item) => item.id !== saved.id));
      setCategory('');
      success('Expense category archived');
    } catch (err) {
      error(err instanceof Error ? err.message : 'Failed to archive category');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Record Business Expense"
      subtitle="Deducts operating funds and reflects on Net Profit calculations"
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        <div>
          <label className="block text-[#4a4741] font-medium mb-1">
            Expense Amount ({currencySymbol}) *
          </label>
          <input
            type="number"
            step="any"
            min="0.01"
            required
            value={amount || ''}
            onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
            placeholder="0.00"
            className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg text-[#1c1b18] font-mono text-base font-bold focus:outline-none focus:border-[#23424d]"
          />
        </div>

        <div>
          <label className="block text-[#4a4741] font-medium mb-1">Pay From Account *</label>
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg text-[#1c1b18] focus:outline-none focus:border-[#23424d]"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({formatCurrency(a.currentBalance, currencySymbol)})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[#4a4741] font-medium mb-1">Expense Category</label>
          <select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setCustomCategoryName('');
            }}
            className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg text-[#1c1b18] focus:outline-none focus:border-[#23424d]"
          >
            <option value="">No category</option>
            {PREDEFINED_FINANCE_CATEGORIES.expense.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
            {savedCategories.map((saved) => (
              <option key={saved.id} value={saved.name}>{saved.name}</option>
            ))}
          </select>
          {savedCategories.some((item) => item.name === category) && (
            <button type="button" onClick={archiveSelectedCategory} className="mt-1 text-[11px] text-[#be123c] hover:underline">
              Archive selected custom category
            </button>
          )}
        </div>

        {category === 'Other' && (
          <div>
            <label className="block text-[#4a4741] font-medium mb-1">Specify Category (optional)</label>
            <input
              value={customCategoryName}
              onChange={(e) => setCustomCategoryName(e.target.value)}
              placeholder="e.g. Packaging Materials"
              className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg text-[#1c1b18]"
            />
          </div>
        )}
        <div>
          <label className="block text-[#4a4741] font-medium mb-1">Expense Date and Time</label>
          <input
            type="datetime-local"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg text-[#1c1b18] font-mono focus:outline-none focus:border-[#23424d]"
          />
        </div>

        <div>
          <label className="block text-[#4a4741] font-medium mb-1">Description / Memo</label>
          <textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. 100x Poly packaging bags and tape"
            className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg text-[#1c1b18] focus:outline-none focus:border-[#23424d]"
          />
        </div>

        <div className="flex justify-end gap-3 pt-3 border-t border-[#e9e4dc]">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 font-semibold text-[#4a4741] hover:text-[#1c1b18] bg-white border border-[#d8d3c9] hover:bg-[#f7f4ee] rounded-lg transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2 font-semibold text-white bg-[#be123c] hover:bg-[#9f1239] rounded-lg transition-colors cursor-pointer shadow-xs"
          >
            {loading ? 'Recording...' : 'Record Expense'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
