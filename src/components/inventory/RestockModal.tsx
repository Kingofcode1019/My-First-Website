import React, { useEffect, useState } from 'react';
import { Product, Supplier } from '../../types';
import { Modal } from '../common/Modal';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { inventoryService } from '../../services/inventory.service';
import { formatCurrency } from '../../lib/utils';

interface RestockModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
  suppliers: Supplier[];
  currencySymbol: string;
  onSaved: () => void;
}

export const RestockModal: React.FC<RestockModalProps> = ({
  isOpen,
  onClose,
  product,
  suppliers,
  currencySymbol,
  onSaved,
}) => {
  const { effectiveUid } = useAuth();
  const { success, error } = useToast();
  const [supplierId, setSupplierId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [purchasePrice, setPurchasePrice] = useState(0);
  const [shippingCost, setShippingCost] = useState(0);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  const subtotal = quantity * purchasePrice;
  const totalAmount = subtotal + shippingCost;
  const landedUnitCost = quantity > 0 ? totalAmount / quantity : 0;

  useEffect(() => {
    if (!isOpen || !product) return;
    setSupplierId(product.supplierId || '');
    setQuantity(1);
    setPurchasePrice(product.purchasePrice || 0);
    setShippingCost(0);
    setNotes('');
  }, [isOpen, product, suppliers]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!effectiveUid || !product) return;
    const supplier = suppliers.find((item) => item.id === supplierId);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      error('Restock quantity must be a positive whole number');
      return;
    }
    if (purchasePrice < 0 || shippingCost < 0) {
      error('Purchase price and shipping cannot be negative');
      return;
    }
    try {
      setLoading(true);
      const purchase = await inventoryService.restockProduct(effectiveUid, {
        productId: product.id,
        productName: product.name,
        supplierId: supplier?.id || '',
        supplierName: supplier?.company || supplier?.name || 'Unassigned',
        quantity,
        purchasePrice,
        shippingCost,
        notes: notes.trim(),
        date: new Date().toISOString(),
      });
      success(`Restock ${purchase.id} recorded${supplier ? ` for ${supplier.company}` : ' under Unassigned Supplier'}. No account balance changed.`);
      onSaved();
      onClose();
    } catch (err: any) {
      error(err.message || 'Failed to record restock purchase');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Restock Product"
      subtitle={product ? `${product.name} · ${product.sku}` : undefined}
      maxWidth="md"
    >
      {product && (
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div className="flex justify-between border-b border-[#e9e4dc] pb-3">
            <span className="text-[#706c64]">Current inventory</span>
            <strong className="font-mono text-[#1c1b18]">{product.currentStock} {product.unit}</strong>
          </div>

          <div>
            <label className="block text-[#4a4741] font-medium mb-1">Supplier</label>
            <select
              value={supplierId}
              onChange={(event) => setSupplierId(event.target.value)}
              className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg text-[#1c1b18]"
            >
              <option value="">Unassigned Supplier</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.company} · {supplier.code}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[#4a4741] font-medium mb-1">Quantity ({product.unit}) *</label>
              <input
                type="number"
                required
                min="1"
                step="1"
                value={quantity}
                onChange={(event) => setQuantity(Math.max(0, Number(event.target.value) || 0))}
                className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block text-[#4a4741] font-medium mb-1">Base Unit Purchase Price ({currencySymbol}) *</label>
              <input
                type="number"
                required
                min="0"
                step="any"
                value={purchasePrice}
                onChange={(event) => setPurchasePrice(Math.max(0, Number(event.target.value) || 0))}
                className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-[#4a4741] font-medium mb-1">Freight / Shipping / Customs ({currencySymbol})</label>
            <input
              type="number"
              min="0"
              step="any"
              value={shippingCost || ''}
              onChange={(event) => setShippingCost(Math.max(0, Number(event.target.value) || 0))}
              className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg font-mono"
            />
          </div>

          <div>
            <label className="block text-[#4a4741] font-medium mb-1">Purchase Note</label>
            <input
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Supplier invoice, customs reference..."
              className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg"
            />
          </div>

          <dl className="space-y-1.5 border-t border-[#e9e4dc] pt-3 font-mono">
            <div className="flex justify-between"><dt>Subtotal</dt><dd>{formatCurrency(subtotal, currencySymbol)}</dd></div>
            <div className="flex justify-between"><dt>Freight / Customs</dt><dd>{formatCurrency(shippingCost, currencySymbol)}</dd></div>
            <div className="flex justify-between font-bold"><dt>Total Purchase Bill</dt><dd>{formatCurrency(totalAmount, currencySymbol)}</dd></div>
            <div className="flex justify-between text-[#047857]"><dt>Landed Cost / Unit</dt><dd>{formatCurrency(landedUnitCost, currencySymbol)}</dd></div>
            <div className="flex justify-between"><dt>Payment Status</dt><dd className="text-[#be123c]">Unpaid</dd></div>
            <div className="flex justify-between"><dt>Due Balance</dt><dd>{formatCurrency(totalAmount, currencySymbol)}</dd></div>
            <p className="pt-2 border-t border-[#e9e4dc] font-sans text-[#706c64]">
              Recording a restock only updates inventory. Record a payment from Finance → Due Balance to reduce an account.
            </p>
          </dl>

          <div className="flex justify-end gap-3 border-t border-[#e9e4dc] pt-3">
            <button type="button" onClick={onClose} disabled={loading} className="px-4 py-2 border border-[#d8d3c9] rounded-lg cursor-pointer">Cancel</button>
            <button type="submit" disabled={loading} className="px-4 py-2 font-semibold text-white bg-[#23424d] rounded-lg disabled:opacity-50 cursor-pointer">
              {loading ? 'Recording purchase...' : 'Create Purchase & Restock'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
};