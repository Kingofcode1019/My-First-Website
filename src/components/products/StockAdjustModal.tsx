import React, { useState } from 'react';
import { Modal } from '../common/Modal';
import { InventoryMovementType, Product } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { productsService } from '../../services/products.service';

interface StockAdjustModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product;
  onSaved: () => void;
}

export const StockAdjustModal: React.FC<StockAdjustModalProps> = ({
  isOpen,
  onClose,
  product,
  onSaved,
}) => {
  const { effectiveUid } = useAuth();
  const { success, error } = useToast();
  const [loading, setLoading] = useState(false);

  const [type, setType] = useState<InventoryMovementType>('adjustment');
  const [quantity, setQuantity] = useState<number>(1);
  const [direction, setDirection] = useState<'add' | 'subtract'>('add');
  const [reason, setReason] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveUid) return;
    if (quantity <= 0) {
      error('Quantity must be greater than 0');
      return;
    }
    if (!reason.trim()) {
      error('Reason for stock adjustment is required');
      return;
    }

    const delta = direction === 'add' ? quantity : -quantity;
    if (direction === 'subtract' && product.currentStock - quantity < 0) {
      error(`Cannot reduce stock below 0. Current: ${product.currentStock}`);
      return;
    }

    try {
      setLoading(true);
      await productsService.adjustStock(
        effectiveUid,
        product.id,
        delta,
        type,
        reason.trim()
      );
      success(`Stock adjusted. New stock: ${product.currentStock + delta}`);
      onSaved();
      onClose();
    } catch (err: any) {
      error(err.message || 'Failed to adjust stock');
    } finally {
      setLoading(false);
    }
  };

  const calculatedNewStock =
    direction === 'add'
      ? product.currentStock + (quantity || 0)
      : Math.max(0, product.currentStock - (quantity || 0));

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Adjust Inventory Stock"
      subtitle={`Product: ${product.name} (${product.sku})`}
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        {/* Current Stock Banner */}
        <div className="flex items-center justify-between p-3.5 rounded-xl bg-[#faf8f5] border border-[#e9e4dc]">
          <div>
            <span className="text-[#706c64]">Current Stock</span>
            <p className="text-lg font-bold font-mono text-[#1c1b18]">
              {product.currentStock} {product.unit}
            </p>
          </div>
          <div className="text-right">
            <span className="text-[#706c64]">Calculated New Stock</span>
            <p className="text-lg font-bold font-mono text-[#059669]">
              {calculatedNewStock} {product.unit}
            </p>
          </div>
        </div>

        {/* Direction Toggle */}
        <div>
          <label className="block text-[#4a4741] font-medium mb-1">Adjustment Action</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setDirection('add');
                setType('adjustment');
              }}
              className={`py-2 px-3 rounded-lg font-semibold border text-center transition-colors cursor-pointer ${
                direction === 'add'
                  ? 'bg-[#ecfdf5] border-[#a7f3d0] text-[#065f46]'
                  : 'bg-white border-[#d8d3c9] text-[#706c64] hover:text-[#1c1b18]'
              }`}
            >
              + Correct Stock Up
            </button>
            <button
              type="button"
              onClick={() => {
                setDirection('subtract');
                setType('adjustment');
              }}
              className={`py-2 px-3 rounded-lg font-semibold border text-center transition-colors cursor-pointer ${
                direction === 'subtract'
                  ? 'bg-[#fff1f2] border-[#fecdd3] text-[#be123c]'
                  : 'bg-white border-[#d8d3c9] text-[#706c64] hover:text-[#1c1b18]'
              }`}
            >
              - Decrease Stock
            </button>
          </div>
        </div>

        {/* Movement Reason Type */}
        <div>
          <label className="block text-[#4a4741] font-medium mb-1">Movement Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as InventoryMovementType)}
            className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg text-[#1c1b18] focus:outline-none focus:border-[#23424d]"
          >
            {direction === 'add' ? (
              <>
                <option value="adjustment">Stock Count Audit Increase</option>
                <option value="return">Warehouse Return</option>
              </>
            ) : (
              <>
                <option value="adjustment">Manual Audit Adjustment / Correction</option>
                <option value="damage">Damaged or Expired Inventory</option>
                <option value="stock_out">Stock Out (Internal consumption)</option>
              </>
            )}
          </select>
        </div>

        {/* Quantity */}
        <div>
          <label className="block text-[#4a4741] font-medium mb-1">Quantity ({product.unit}) *</label>
          <input
            type="number"
            min="1"
            required
            value={quantity}
            onChange={(e) => setQuantity(parseInt(e.target.value) || 0)}
            className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg text-[#1c1b18] font-mono focus:outline-none focus:border-[#23424d]"
          />
        </div>

        {/* Reason */}
        <div>
          <label className="block text-[#4a4741] font-medium mb-1">Reason / Note *</label>
          <input
            type="text"
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Monthly physical inventory recount, damaged in transit"
            className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg text-[#1c1b18] placeholder-[#8a857b] focus:outline-none focus:border-[#23424d]"
          />
        </div>

        {/* Buttons */}
        <div className="flex justify-end gap-3 pt-4 border-t border-[#e9e4dc]">
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
            className="px-4 py-2 font-semibold text-white bg-[#23424d] hover:bg-[#1a323b] rounded-lg transition-colors cursor-pointer shadow-xs"
          >
            {loading ? 'Adjusting...' : 'Confirm Stock Adjustment'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
