import React, { useEffect, useState } from 'react';
import { Purchase, Supplier } from '../../types';
import { Modal } from '../common/Modal';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { financeService } from '../../services/finance.service';
import { formatCurrency } from '../../lib/utils';

interface LinkedShippingExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  purchase: Purchase | null;
  supplier: Supplier | null;
  currencySymbol: string;
  onSaved: () => void;
}

export const LinkedShippingExpenseModal: React.FC<LinkedShippingExpenseModalProps> = ({
  isOpen,
  onClose,
  purchase,
  supplier,
  currencySymbol,
  onSaved,
}) => {
  const { effectiveUid } = useAuth();
  const { success, error } = useToast();
  const [shippingAmount, setShippingAmount] = useState(0);
  const [billedBy, setBilledBy] = useState<'supplier' | 'courier'>('supplier');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setShippingAmount(0);
    setBilledBy('supplier');
    setDate(new Date().toISOString().slice(0, 10));
    setNote('');
  }, [isOpen, purchase]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!effectiveUid || !purchase || !supplier) return;
    if (shippingAmount <= 0) {
      error('Shipping amount must be greater than zero');
      return;
    }
    try {
      setLoading(true);
      const result = await financeService.addLinkedShippingExpense(
        effectiveUid,
        purchase.id,
        shippingAmount,
        supplier.id,
        new Date(date).toISOString(),
        note.trim() || undefined,
        billedBy
      );
      success(
        `Freight linked to purchase. ${formatCurrency(result.capitalizedAmount, currencySymbol)} added to remaining inventory cost. Record any actual payment separately in Finance.`
      );
      onSaved();
      onClose();
    } catch (err: any) {
      error(err.message || 'Failed to add linked shipping expense');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Add Linked Shipping Cost"
      subtitle={purchase ? `Purchase ${purchase.id} · ${supplier?.code || ''}` : undefined}
      maxWidth="md"
    >
      {purchase && supplier && (
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div className="flex items-center justify-between border-b border-[#e9e4dc] pb-3">
            <span className="text-[#706c64]">Current shipping recorded</span>
            <strong className="font-mono">{formatCurrency(purchase.shippingCost || 0, currencySymbol)}</strong>
          </div>

          <div>
            <label className="block text-[#4a4741] font-medium mb-1">Additional Freight / Customs Cost ({currencySymbol}) *</label>
            <input
              type="number"
              required
              min="0.01"
              step="any"
              value={shippingAmount || ''}
              onChange={(event) => setShippingAmount(Math.max(0, Number(event.target.value) || 0))}
              className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg font-mono"
            />
          </div>

          <div>
            <label className="block text-[#4a4741] font-medium mb-1">Shipping provider (reference only)</label>
            <select
              value={billedBy}
              onChange={(event) => setBilledBy(event.target.value as 'supplier' | 'courier')}
              className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg"
            >
              <option value="supplier">Purchase supplier</option>
              <option value="courier">Separate courier</option>
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[#4a4741] font-medium mb-1">Bill Date *</label>
              <input type="date" required value={date} onChange={(event) => setDate(event.target.value)} className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg font-mono" />
            </div>
            <div>
              <label className="block text-[#4a4741] font-medium mb-1">Note</label>
              <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Invoice / customs reference" className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg" />
            </div>
          </div>

          <p className="text-[#706c64] border-t border-[#e9e4dc] pt-3">
            Freight is allocated across this purchase’s units for inventory valuation. This only updates purchase history and stock cost; record any actual cash outflow separately in Finance.
          </p>

          <div className="flex justify-end gap-3 border-t border-[#e9e4dc] pt-3">
            <button type="button" onClick={onClose} disabled={loading} className="px-4 py-2 border border-[#d8d3c9] rounded-lg cursor-pointer">Cancel</button>
            <button type="submit" disabled={loading} className="px-4 py-2 font-semibold text-white bg-[#23424d] rounded-lg disabled:opacity-50 cursor-pointer">
              {loading ? 'Recording...' : 'Add Shipping Cost'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
};