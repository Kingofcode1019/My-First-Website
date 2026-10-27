import React, { useState, useEffect } from 'react';
import { Modal } from '../common/Modal';
import { Product, PurchaseItem, Supplier } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { purchasesService } from '../../services/purchases.service';
import { formatCurrency } from '../../lib/utils';
import { Plus, Trash2 } from 'lucide-react';

interface PurchaseOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  suppliers: Supplier[];
  products: Product[];
  currencySymbol: string;
  defaultSupplierId?: string;
  onSaved: () => void;
}

export const PurchaseOrderModal: React.FC<PurchaseOrderModalProps> = ({
  isOpen,
  onClose,
  suppliers,
  products,
  currencySymbol,
  defaultSupplierId,
  onSaved,
}) => {
  const { effectiveUid } = useAuth();
  const { success, error } = useToast();
  const [loading, setLoading] = useState(false);

  const [supplierId, setSupplierId] = useState('');
  const [items, setItems] = useState<PurchaseItem[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [itemQty, setItemQty] = useState(10);
  const [itemCost, setItemCost] = useState(0);

  const [shippingCost, setShippingCost] = useState(0);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (isOpen) {
      setSupplierId(defaultSupplierId || '');
      setItems([]);
      setSelectedProductId(products[0]?.id || '');
      setItemQty(10);
      setItemCost(products[0]?.purchasePrice || 0);
      setShippingCost(0);
      setNotes('');
    }
  }, [isOpen, defaultSupplierId, products]);

  // When selected product changes, pre-fill its purchase price
  useEffect(() => {
    const p = products.find((prod) => prod.id === selectedProductId);
    if (p) {
      setItemCost(p.purchasePrice || 0);
    }
  }, [selectedProductId, products]);

  const handleAddItem = () => {
    const prod = products.find((p) => p.id === selectedProductId);
    if (!prod) return;
    if (itemQty <= 0) {
      error('Quantity must be greater than 0');
      return;
    }
    if (itemCost < 0) {
      error('Cost price cannot be negative');
      return;
    }

    setItems((prev) => [
      ...prev,
      {
        productId: prod.id,
        productName: prod.name,
        quantity: itemQty,
        purchasePrice: itemCost,
        effectiveUnitCost: itemCost,
        totalCost: itemQty * itemCost,
      },
    ]);

    setItemQty(10);
  };

  const handleRemoveItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const totalCost = items.reduce((sum, it) => sum + it.totalCost, 0);
  const totalUnits = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalAmount = totalCost + shippingCost;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveUid) return;

    if (items.length === 0) {
      error('Please add at least one product to the purchase order');
      return;
    }

    const supplierObj = suppliers.find((s) => s.id === supplierId);

    try {
      setLoading(true);
      await purchasesService.recordPurchase(effectiveUid, {
        supplierId,
        supplierName: supplierObj?.company || supplierObj?.name || 'Vendor',
        items,
        shippingCost,
        totalCost: totalAmount,
        notes: notes.trim(),
        date: new Date().toISOString(),
      });

      success('Inventory purchase recorded. No finance transaction or supplier balance was changed.');
      onSaved();
      onClose();
    } catch (err: any) {
      error(err.message || 'Failed to record purchase');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Record Stock Purchase / Inbound"
      subtitle="Records inventory quantity, purchase cost, and supplier reference only"
      maxWidth="3xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        {/* Supplier Selector */}
        <div>
          <label className="block text-[#4a4741] font-medium mb-1">Supplier / Vendor (optional)</label>
          <select
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg text-[#1c1b18] focus:outline-none focus:border-[#23424d]"
          >
            <option value="">Unassigned Supplier</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.company} ({s.name})
              </option>
            ))}
          </select>
        </div>

        {/* Add Items Section */}
        <div className="p-3.5 bg-[#faf8f5] border border-[#e9e4dc] rounded-2xl space-y-2.5">
          <h4 className="font-bold text-[#1c1b18]">Add Products to Purchase Invoice</h4>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
            <div className="sm:col-span-2">
              <label className="block text-[#706c64] text-[11px] mb-1">Product</label>
              <select
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
                className="w-full px-3 py-1.5 bg-white border border-[#d8d3c9] rounded-lg text-[#1c1b18] focus:outline-none focus:border-[#23424d]"
              >
                {products
                  .filter((p) => p.status !== 'archived')
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.sku})
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="block text-[#706c64] text-[11px] mb-1">Quantity</label>
              <input
                type="number"
                min="1"
                value={itemQty}
                onChange={(e) => setItemQty(parseInt(e.target.value) || 1)}
                className="w-full px-3 py-1.5 bg-white border border-[#d8d3c9] rounded-lg text-[#1c1b18] font-mono focus:outline-none focus:border-[#23424d]"
              />
            </div>

            <div>
              <label className="block text-[#706c64] text-[11px] mb-1">
                Cost Price ({currencySymbol})
              </label>
              <input
                type="number"
                step="any"
                min="0"
                value={itemCost}
                onChange={(e) => setItemCost(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-1.5 bg-white border border-[#d8d3c9] rounded-lg text-[#1c1b18] font-mono focus:outline-none focus:border-[#23424d]"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={handleAddItem}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#23424d] hover:bg-[#1a323b] rounded-lg transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Item</span>
          </button>

          {/* Items table */}
          {items.length > 0 && (
            <div className="border border-[#e9e4dc] rounded-xl overflow-hidden mt-2 bg-white">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#faf8f5] text-[#706c64] font-medium border-b border-[#e9e4dc]">
                  <tr>
                    <th className="py-2 px-3">Product</th>
                    <th className="py-2 px-3 text-right">Cost Price</th>
                    <th className="py-2 px-3 text-center">Quantity</th>
                    <th className="py-2 px-3 text-right">Total</th>
                    <th className="py-2 px-3 w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e9e4dc]">
                  {items.map((it, idx) => (
                    <tr key={idx}>
                      <td className="py-2 px-3 font-medium text-[#1c1b18]">{it.productName}</td>
                      <td className="py-2 px-3 text-right font-mono text-[#706c64]">
                        {formatCurrency(it.purchasePrice, currencySymbol)}
                      </td>
                      <td className="py-2 px-3 text-center font-mono font-bold text-[#1c1b18]">
                        +{it.quantity}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-[#1c1b18]">
                        {formatCurrency(it.totalCost, currencySymbol)}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          className="text-[#8a857b] hover:text-[#be123c] cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Inventory cost details only; payment is recorded separately in Finance. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div>
              <label className="block text-[#4a4741] font-medium mb-1">Freight / Shipping / Customs Fee ({currencySymbol})</label>
              <input
                type="number"
                min="0"
                step="any"
                value={shippingCost || ''}
                onChange={(e) => setShippingCost(Math.max(0, Number(e.target.value) || 0))}
                className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg text-[#1c1b18] font-mono focus:outline-none focus:border-[#23424d]"
              />
            </div>

            <div>
              <label className="block text-[#4a4741] font-medium mb-1">Notes</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Invoice number, batch remarks..."
                className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg text-[#1c1b18] focus:outline-none focus:border-[#23424d]"
              />
            </div>
          </div>

          <div className="p-4 bg-[#faf8f5] border border-[#e9e4dc] rounded-2xl space-y-2 font-mono flex flex-col justify-center">
            <div className="flex justify-between text-[#706c64]">
              <span>Items Subtotal:</span>
              <span className="text-[#1c1b18] font-bold">{formatCurrency(totalCost, currencySymbol)}</span>
            </div>
            <div className="flex justify-between text-[#706c64]">
              <span>Freight / Customs:</span>
              <span>{formatCurrency(shippingCost, currencySymbol)}</span>
            </div>
            <div className="flex justify-between text-[#1c1b18] font-bold">
              <span>Total Purchase Bill:</span>
              <span>{formatCurrency(totalAmount, currencySymbol)}</span>
            </div>
            <div className="flex justify-between text-[#706c64]">
              <span>Average Landed Cost / Unit:</span>
              <span>{formatCurrency(totalUnits > 0 ? totalAmount / totalUnits : 0, currencySymbol)}</span>
            </div>
            <p className="border-t border-[#e9e4dc] pt-2 text-xs font-sans text-[#706c64]">
              This records inventory only. Record any actual payment separately in Finance.
            </p>
          </div>
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
            {loading ? 'Recording...' : 'Confirm Stock Purchase'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
