import React, { useState, useEffect } from 'react';
import { Modal } from '../common/Modal';
import { Account } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { financeService } from '../../services/finance.service';
import { formatCurrency, localDateTimeInputToISOString, toLocalDateTimeInput } from '../../lib/utils';
import { ArrowRight, Info } from 'lucide-react';

interface TransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: Account[];
  currencySymbol: string;
  onSaved: () => void;
}

export const TransferModal: React.FC<TransferModalProps> = ({
  isOpen,
  onClose,
  accounts,
  currencySymbol,
  onSaved,
}) => {
  const { effectiveUid } = useAuth();
  const { success, error } = useToast();
  const [loading, setLoading] = useState(false);

  const [fromAccountId, setFromAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState('');
  const [amount, setAmount] = useState<number>(0);
  const [note, setNote] = useState('');
  const [date, setDate] = useState(toLocalDateTimeInput);

  useEffect(() => {
    if (isOpen && accounts.length >= 2) {
      setFromAccountId(accounts[0].id);
      setToAccountId(accounts[1].id);
      setAmount(0);
      setNote('');
      setDate(toLocalDateTimeInput());
    }
  }, [isOpen, accounts]);

  const fromAcc = accounts.find((a) => a.id === fromAccountId);
  const toAcc = accounts.find((a) => a.id === toAccountId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveUid) return;
    if (fromAccountId === toAccountId) {
      error('From and To accounts cannot be the same');
      return;
    }
    if (amount <= 0) {
      error('Transfer amount must be greater than 0');
      return;
    }
    if (fromAcc && fromAcc.currentBalance < amount) {
      error(`Insufficient balance in ${fromAcc.name}. Available: ${fromAcc.currentBalance}`);
      return;
    }

    try {
      setLoading(true);
      await financeService.recordTransfer(effectiveUid, {
        fromAccountId,
        toAccountId,
        amount: Number(amount),
        date: localDateTimeInputToISOString(date),
        note: note.trim() || undefined,
      });
      success('Funds transferred successfully between accounts!');
      onSaved();
      onClose();
    } catch (err: any) {
      error(err.message || 'Transfer failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Transfer Funds Between Accounts"
      subtitle="Move cash to bank, cashout from bKash, or rebalance wallets"
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        {/* Visual From -> To Banner */}
        <div className="p-3.5 bg-[#faf8f5] border border-[#e9e4dc] rounded-2xl flex items-center justify-between">
          <div className="flex-1">
            <span className="text-[11px] text-[#706c64]">Source (From)</span>
            <p className="font-bold text-[#1c1b18] truncate">{fromAcc?.name || 'Select'}</p>
            <p className="font-mono text-[11px] text-[#047857]">
              {fromAcc ? formatCurrency(fromAcc.currentBalance, currencySymbol) : ''}
            </p>
          </div>

          <div className="p-2 rounded-full bg-white border border-[#d8d3c9] text-[#706c64] mx-2">
            <ArrowRight className="w-4 h-4 text-[#23424d]" />
          </div>

          <div className="flex-1 text-right">
            <span className="text-[11px] text-[#706c64]">Destination (To)</span>
            <p className="font-bold text-[#1c1b18] truncate">{toAcc?.name || 'Select'}</p>
            <p className="font-mono text-[11px] text-[#047857]">
              {toAcc ? formatCurrency(toAcc.currentBalance, currencySymbol) : ''}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[#4a4741] font-medium mb-1">From Account *</label>
            <select
              value={fromAccountId}
              onChange={(e) => setFromAccountId(e.target.value)}
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
            <label className="block text-[#4a4741] font-medium mb-1">To Account *</label>
            <select
              value={toAccountId}
              onChange={(e) => setToAccountId(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg text-[#1c1b18] focus:outline-none focus:border-[#23424d]"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({formatCurrency(a.currentBalance, currencySymbol)})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-[#4a4741] font-medium mb-1">
            Transfer Amount ({currencySymbol}) *
          </label>
          <input
            type="number"
            step="any"
            min="1"
            required
            value={amount || ''}
            onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
            placeholder="0.00"
            className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg text-[#1c1b18] font-mono text-base font-bold focus:outline-none focus:border-[#23424d]"
          />
        </div>

        <div>
          <label className="block text-[#4a4741] font-medium mb-1">Date and Time</label>
          <input
            type="datetime-local"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg text-[#1c1b18] font-mono focus:outline-none focus:border-[#23424d]"
          />
        </div>

        <div>
          <label className="block text-[#4a4741] font-medium mb-1">Notes / Transfer Reason</label>
          <textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. bKash Merchant cash-out to Bank"
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
            className="px-5 py-2 font-semibold text-white bg-[#23424d] hover:bg-[#1a323b] rounded-lg transition-colors cursor-pointer shadow-xs"
          >
            {loading ? 'Transferring...' : 'Execute Transfer'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
