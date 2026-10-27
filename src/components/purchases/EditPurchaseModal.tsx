import React, { useEffect, useMemo, useState } from 'react';
import { PackageCheck } from 'lucide-react';
import { Product, Purchase, Supplier } from '../../types';
import { PurchaseEditInput } from '../../lib/purchaseEdit';
import { getPurchasePaymentSummary } from '../../lib/purchasePayment';
import { formatCurrency } from '../../lib/utils';
import { purchasesService } from '../../services/purchases.service';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Modal } from '../common/Modal';

interface EditPurchaseModalProps {
  purchase: Purchase | null;
  products: Product[];
  suppliers: Supplier[];
  currencySymbol: string;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}

export const EditPurchaseModal: React.FC<EditPurchaseModalProps> = ({
  purchase,
  products,
  suppliers,
  currencySymbol,
  onClose,
  onSaved,
}) => {
  const { effectiveUid } = useAuth();
  const { success, error } = useToast();
  const [items, setItems] = useState<PurchaseEditInput['items']>([]);
  const [supplierId, setSupplierId] = useState('');
  const [shippingCost, setShippingCost] = useState(0);
  const [date, setDate] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!purchase) return;
    setItems(purchase.items.map((item) => ({
      productId: item.productId,
      productName: item.productName,
      quantity: item.quantity,
      purchasePrice: item.purchasePrice,
    })));
    setSupplierId(purchase.supplierId || '');
    setShippingCost(Number(purchase.shippingCost) || 0);
    const parsedDate = new Date(purchase.date);
    setDate(Number.isNaN(parsedDate.getTime()) ? '' : parsedDate.toISOString().slice(0, 10));
    setNotes(purchase.notes || '');
  }, [purchase]);

  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.purchasePrice, 0);
  const total = subtotal + shippingCost;
  const payment = useMemo(() => purchase
    ? getPurchasePaymentSummary(Number(purchase.totalAmount ?? purchase.totalCost), purchase.amountPaid, purchase.paymentStatus)
    : null, [purchase]);
  const selectedSupplier = suppliers.find((supplier) => supplier.id === supplierId);

  const updateItem = (productId: string, change: Partial<PurchaseEditInput['items'][number]>) => {
    setItems((current) => current.map((item) =>
      item.productId === productId ? { ...item, ...change } : item
    ));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!effectiveUid || !purchase) return;
    if (items.some((item) => !Number.isInteger(item.quantity) || item.quantity <= 0)) {
      error('Quantities must be positive whole numbers');
      return;
    }
    if (items.some((item) => !Number.isFinite(item.purchasePrice) || item.purchasePrice < 0) ||
      !Number.isFinite(shippingCost) || shippingCost < 0) {
      error('Purchase costs cannot be negative');
      return;
    }
    if (!date || !Number.isFinite(new Date(date).getTime())) {
      error('Enter a valid purchase date');
      return;
    }

    try {
      setLoading(true);
      await purchasesService.updatePurchase(effectiveUid, purchase.id, {
        supplierId,
        supplierName: selectedSupplier?.company || selectedSupplier?.name || '',
        items,
        shippingCost,
        notes,
        date: new Date(date).toISOString(),
      });
      success('Purchase record updated. Inventory was adjusted once; no new purchase was created.');
      await onSaved();
      onClose();
    } catch (err) {
      error(err instanceof Error ? err.message : 'Could not safely update this purchase');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={!!purchase}
      onClose={() => !loading && onClose()}
      title="Edit Inventory Purchase"
      subtitle={purchase ? `Existing record ${purchase.id} · Correct this record without creating another purchase` : undefined}
      maxWidth="2xl"
    >
      {purchase && payment && (
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div className="flex items-start gap-2 rounded-xl border border-[#d8e4e7] bg-[#f0f9f8] p-3 leading-5 text-[#4a4741]">
            <PackageCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#23424d]" />
            <p>Changing quantity or cost adjusts the existing stock and purchase-cost record, never adds a second purchase. If later stock movements depend on this purchase, the service will block an unsafe inventory-cost edit.</p>
          </div>

          <div>
            <label className="mb-1 block font-medium text-[#4a4741]">Supplier</label>
            <select value={supplierId} onChange={(event) => setSupplierId(event.target.value)} className="w-full rounded-lg border border-[#d8d3c9] bg-white px-3 py-2">
              <option value="">Unassigned Supplier</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>{supplier.company} · {supplier.code}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            {items.map((item) => {
              const product = products.find((candidate) => candidate.id === item.productId);
              return (
                <div key={item.productId} className="grid grid-cols-1 gap-2 rounded-xl border border-[#e9e4dc] p-3 sm:grid-cols-[minmax(0,1fr)_120px_160px] sm:items-end">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-[#1c1b18]">{item.productName}</p>
                    <p className="text-[10px] text-[#706c64]">{product?.sku || item.productId}</p>
                  </div>
                  <label className="block">
                    <span className="mb-1 block text-[#706c64]">Quantity ({product?.unit || 'units'})</span>
                    <input type="number" min="1" step="1" value={item.quantity} onChange={(event) => updateItem(item.productId, { quantity: Number(event.target.value) || 0 })} className="w-full rounded-lg border border-[#d8d3c9] px-3 py-2 font-mono" />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[#706c64]">Base unit cost ({currencySymbol})</span>
                    <input type="number" min="0" step="any" value={item.purchasePrice} onChange={(event) => updateItem(item.productId, { purchasePrice: Number(event.target.value) || 0 })} className="w-full rounded-lg border border-[#d8d3c9] px-3 py-2 font-mono" />
                  </label>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block font-medium text-[#4a4741]">Freight / shipping ({currencySymbol})</span>
              <input type="number" min="0" step="any" value={shippingCost} onChange={(event) => setShippingCost(Number(event.target.value) || 0)} className="w-full rounded-lg border border-[#d8d3c9] px-3 py-2 font-mono" />
            </label>
            <label className="block">
              <span className="mb-1 block font-medium text-[#4a4741]">Purchase date</span>
              <input type="date" required value={date} onChange={(event) => setDate(event.target.value)} className="w-full rounded-lg border border-[#d8d3c9] px-3 py-2 font-mono" />
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block font-medium text-[#4a4741]">Purchase note</span>
            <textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} className="w-full rounded-lg border border-[#d8d3c9] px-3 py-2" />
          </label>

          <div className="rounded-xl border border-[#e9e4dc] bg-[#faf8f5] p-3">
            <div className="flex justify-between"><span>New purchase total</span><strong className="font-mono">{formatCurrency(total, currencySymbol)}</strong></div>
            <div className="mt-1 flex justify-between text-[#047857]"><span>Already paid</span><strong className="font-mono">{formatCurrency(payment.amountPaid, currencySymbol)}</strong></div>
            <div className="mt-1 flex justify-between font-semibold text-[#be123c]"><span>New remaining due</span><strong className="font-mono">{formatCurrency(Math.max(0, total - payment.amountPaid), currencySymbol)}</strong></div>
          </div>

          <div className="flex justify-end gap-2 border-t border-[#e9e4dc] pt-3">
            <button type="button" onClick={onClose} disabled={loading} className="rounded-lg border border-[#d8d3c9] px-4 py-2 font-semibold text-[#4a4741]">Cancel</button>
            <button type="submit" disabled={loading} className="rounded-lg bg-[#23424d] px-4 py-2 font-semibold text-white disabled:opacity-50">
              {loading ? 'Saving…' : 'Save Purchase Changes'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
};
