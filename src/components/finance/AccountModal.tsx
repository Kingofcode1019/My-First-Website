import React, { useState, useEffect } from 'react';
import { Modal } from '../common/Modal';
import { Account, AccountType } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { financeService } from '../../services/finance.service';

interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  account?: Account | null;
  currencySymbol: string;
  onSaved: () => void;
}

export const AccountModal: React.FC<AccountModalProps> = ({
  isOpen,
  onClose,
  account,
  currencySymbol,
  onSaved,
}) => {
  const { effectiveUid } = useAuth();
  const { success, error } = useToast();
  const [loading, setLoading] = useState(false);

  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('cash');
  const [startingBalance, setStartingBalance] = useState<number>(0);

  useEffect(() => {
    if (account) {
      setName(account.name);
      setType(account.type);
      setStartingBalance(account.startingBalance);
    } else {
      setName('');
      setType('bkash');
      setStartingBalance(0);
    }
  }, [account, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveUid) return;
    if (!name.trim()) {
      error('Account name is required');
      return;
    }

    try {
      setLoading(true);
      if (account) {
        await financeService.updateAccount(effectiveUid, account.id, {
          name: name.trim(),
          type,
        });
        success('Account updated successfully');
      } else {
        const startVal = Number(startingBalance) || 0;
        await financeService.createAccount(effectiveUid, {
          name: name.trim(),
          type,
          startingBalance: startVal,
          currentBalance: startVal,
          isActive: true,
        });
        success('New account created and ready for transactions');
      }
      onSaved();
      onClose();
    } catch (err: any) {
      error(err.message || 'Failed to save account');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={account ? 'Edit Account / Wallet' : 'Add New Account / Wallet'}
      subtitle="Track separate balances for Cash, bKash, Nagad, and Bank accounts"
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        <div>
          <label className="block text-[#4a4741] font-medium mb-1">Account / Wallet Name *</label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. bKash Merchant, City Bank Corporate"
            className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg text-[#1c1b18] focus:outline-none focus:border-[#23424d]"
          />
        </div>

        <div>
          <label className="block text-[#4a4741] font-medium mb-1">Account Type *</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as AccountType)}
            className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg text-[#1c1b18] focus:outline-none focus:border-[#23424d]"
          >
            <option value="cash">Cash on Hand / Petty Cash</option>
            <option value="bkash">bKash Merchant / Personal</option>
            <option value="nagad">Nagad Wallet</option>
            <option value="bank">Bank Account</option>
            <option value="other">Other Digital Gateway / Card</option>
          </select>
        </div>

        {!account && (
          <div>
            <label className="block text-[#4a4741] font-medium mb-1">
              Opening Starting Balance ({currencySymbol})
            </label>
            <input
              type="number"
              step="any"
              min="0"
              value={startingBalance}
              onChange={(e) => setStartingBalance(parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg text-[#1c1b18] font-mono focus:outline-none focus:border-[#23424d]"
            />
            <span className="text-[10px] text-[#8a857b] mt-0.5 block">
              Set starting capital or existing account balance
            </span>
          </div>
        )}

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
            {loading ? 'Saving...' : account ? 'Update Account' : 'Create Account'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
