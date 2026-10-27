import React, { useEffect, useMemo, useState } from 'react';
import { Product, Supplier } from '../../types';
import { Modal } from '../common/Modal';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { purchasesService } from '../../services/purchases.service';
import { formatCurrency, localDateTimeInputToISOString, toLocalDateTimeInput } from '../../lib/utils';

interface ProductPurchaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  suppliers: Supplier[];
  currencySymbol: string;
  onSaved: () => void;
}

export const ProductPurchaseModal: React.FC<ProductPurchaseModalProps> = ({
  isOpen,
  onClose,
  products,
  suppliers,
  currencySymbol,
  onSaved,
}) => {
  const { effectiveUid } = useAuth();
  const { success, error } = useToast();
  const [productId, setProductId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [unitCost, setUnitCost] = useState(0);
  const [shippingCost, setShippingCost] = useState(0);
  const [date, setDate] = useState(toLocalDateTimeInput);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  const product = products.find((item) => item.id === productId);
  const supplier = suppliers.find((item) => item.id === supplierId);
  const subtotal = quantity * unitCost;
  const totalAmount = subtotal + shippingCost;
  const landedUnitCost = quantity > 0 ? totalAmount / quantity : 0;
  const activeProducts = useMemo(() => products.filter((item) => item.status !== 'archived'), [products]);

  useEffect(() => {
    if (!isOpen) return;
    const initialProduct = products.find((item) => item.status !== 'archived');
    setProductId(initialProduct?.id || '');
    setSupplierId('');
    setQuantity(1);
    setUnitCost(initialProduct?.purchasePrice || 0);
    setShippingCost(0);
    setDate(toLocalDateTimeInput());
    setNotes('');
  }, [isOpen, products]);

  useEffect(() => {
    if (product) setUnitCost(product.purchasePrice || 0);
  }, [productId]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!effectiveUid) return;
    if (!product) {
      error('Select a product to add to inventory');
      return;
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      error('Purchase quantity must be a positive whole number');
      return;
    }
    if (!Number.isFinite(unitCost) || unitCost < 0 || !Number.isFinite(shippingCost) || shippingCost < 0) {
      error('Unit cost and freight cannot be negative');
      return;
    }
    if (!date || !Number.isFinite(new Date(date).getTime())) {
      error('Enter a valid purchase date');
      return;
    }

    try {
      setLoading(true);
      const purchase = await purchasesService.recordPurchase(effectiveUid, {
        supplierId: supplier?.id || '',
        supplierName: supplier?.company || supplier?.name || 'Unassigned',
        items: [{
          productId: product.id,
          productName: product.name,
          quantity,
          purchasePrice: unitCost,
          totalCost: subtotal,
        }],
        shippingCost,
        totalCost: totalAmount,
        notes: notes.trim(),
        date: localDateTimeInputToISOString(date),
      });
      success('Inventory purchase recorded as unpaid. Use Finance → Due Balance to record a payment.');
      onSaved();
      onClose();
      return purchase;
    } catch (err) {
      error(err instanceof Error ? err.message : 'Failed to record product purchase');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Record Product Purchase"
      subtitle={product ? `${product.name} · ${product.sku}` : 'Inventory purchase bill'}
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        <div className="flex justify-between border-b border-[#e9e4dc] pb-3">
          <span className="text-[#706c64]">Current inventory</span>
          <strong className="font-mono text-[#1c1b18]">
            {product ? `${product.currentStock} ${product.unit}` : 'Select product'}
          </strong>
        </div>

        <div>
          <label className="block text-[#4a4741] font-medium mb-1">Product *</label>
          <select required value={productId} onChange={(event) => setProductId(event.target.value)} className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg">
            <option value="">Select product</option>
            {activeProducts.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.sku}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-[#4a4741] font-medium mb-1">Supplier (optional)</label>
          <select value={supplierId} onChange={(event) => setSupplierId(event.target.value)} className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg">
            <option value="">Unassigned Supplier</option>
            {suppliers.map((item) => <option key={item.id} value={item.id}>{item.company} · {item.code}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[#4a4741] font-medium mb-1">Quantity ({product?.unit || 'units'}) *</label>
            <input type="number" required min="1" step="1" value={quantity} onChange={(event) => setQuantity(Number(event.target.value) || 0)} className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg font-mono" />
          </div>
          <div>
            <label className="block text-[#4a4741] font-medium mb-1">Base Unit Purchase Price ({currencySymbol}) *</label>
            <input type="number" required min="0" step="any" value={unitCost} onChange={(event) => setUnitCost(Number(event.target.value) || 0)} className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg font-mono" />
          </div>
        </div>

        <div>
          <label className="block text-[#4a4741] font-medium mb-1">Freight / Shipping / Customs ({currencySymbol})</label>
          <input type="number" min="0" step="any" value={shippingCost || ''} onChange={(event) => setShippingCost(Number(event.target.value) || 0)} className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg font-mono" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[#4a4741] font-medium mb-1">Purchase Date *</label>
            <input type="datetime-local" required value={date} onChange={(event) => setDate(event.target.value)} className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg font-mono" />
          </div>
          <div>
            <label className="block text-[#4a4741] font-medium mb-1">Purchase Note</label>
            <input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Invoice / batch reference" className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg" />
          </div>
        </div>

        <dl className="space-y-1.5 border-t border-[#e9e4dc] pt-3 font-mono">
          <div className="flex justify-between"><dt>Subtotal</dt><dd>{formatCurrency(subtotal, currencySymbol)}</dd></div>
          <div className="flex justify-between"><dt>Freight / Customs</dt><dd>{formatCurrency(shippingCost, currencySymbol)}</dd></div>
          <div className="flex justify-between font-bold"><dt>Total Purchase Bill</dt><dd>{formatCurrency(totalAmount, currencySymbol)}</dd></div>
          <div className="flex justify-between text-[#047857]"><dt>Landed Cost / Unit</dt><dd>{formatCurrency(landedUnitCost, currencySymbol)}</dd></div>
          <div className="flex justify-between"><dt>Payment Status</dt><dd className="text-[#be123c]">Unpaid</dd></div>
          <div className="flex justify-between"><dt>Due Balance</dt><dd>{formatCurrency(totalAmount, currencySymbol)}</dd></div>
          <p className="border-t border-[#e9e4dc] pt-2 font-sans text-[#706c64]">
            Recording a purchase only updates inventory. Use Finance → Due Balance to record a payment.
          </p>
        </dl>

        <div className="flex justify-end gap-3 border-t border-[#e9e4dc] pt-3">
          <button type="button" onClick={onClose} disabled={loading} className="px-4 py-2 border border-[#d8d3c9] rounded-lg">Cancel</button>
          <button type="submit" disabled={loading || !product} className="px-4 py-2 font-semibold text-white bg-[#23424d] rounded-lg disabled:opacity-50">
            {loading ? 'Recording...' : 'Record Purchase'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
