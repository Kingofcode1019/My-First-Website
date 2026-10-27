import { Purchase, PurchaseItem } from '../types';
import { normalizeSupplierAssignment } from './supplierUtils';
import { getPurchasePaymentSummary } from './purchasePayment';

export interface PurchaseEditInput {
  supplierId?: string;
  supplierName?: string;
  items: Array<Pick<PurchaseItem, 'productId' | 'productName' | 'quantity' | 'purchasePrice'>>;
  shippingCost: number;
  notes?: string;
  date: string;
}

export function buildEditedPurchase(purchase: Purchase, update: PurchaseEditInput): Purchase {
  if (!update.date || !Number.isFinite(new Date(update.date).getTime())) {
    throw new Error('Enter a valid purchase date');
  }
  if (!Number.isFinite(update.shippingCost) || update.shippingCost < 0) {
    throw new Error('Shipping cost cannot be negative');
  }
  if (update.items.length !== purchase.items.length) {
    throw new Error('The products on an existing purchase cannot be added or removed while editing');
  }

  const originalProductIds = purchase.items.map((item) => item.productId).sort();
  const updatedProductIds = update.items.map((item) => item.productId).sort();
  if (originalProductIds.some((productId, index) => productId !== updatedProductIds[index])) {
    throw new Error('The products on an existing purchase cannot be changed while editing');
  }
  for (const item of update.items) {
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw new Error('Purchase quantities must be positive whole numbers');
    }
    if (!Number.isFinite(item.purchasePrice) || item.purchasePrice < 0) {
      throw new Error('Unit purchase costs cannot be negative');
    }
  }

  const subtotal = update.items.reduce((sum, item) => sum + item.quantity * item.purchasePrice, 0);
  const totalAmount = subtotal + update.shippingCost;
  if (!Number.isFinite(totalAmount)) throw new Error('Purchase total must be a valid amount');
  const paidAmount = getPurchasePaymentSummary(
    Number(purchase.totalAmount ?? purchase.totalCost),
    purchase.amountPaid,
    purchase.paymentStatus
  ).amountPaid;
  if (totalAmount < paidAmount) {
    throw new Error('Purchase total cannot be lower than the amount already paid');
  }

  const totalUnits = update.items.reduce((sum, item) => sum + item.quantity, 0);
  const items: PurchaseItem[] = update.items.map((item) => {
    const effectiveUnitCost = item.purchasePrice + update.shippingCost / totalUnits;
    return {
      ...purchase.items.find((original) => original.productId === item.productId)!,
      ...item,
      effectiveUnitCost,
      totalCost: item.quantity * effectiveUnitCost,
    };
  });
  const supplier = normalizeSupplierAssignment(update.supplierId, update.supplierName);
  const paymentSummary = getPurchasePaymentSummary(totalAmount, paidAmount);

  return {
    ...purchase,
    ...supplier,
    items,
    subtotal,
    shippingCost: update.shippingCost,
    totalAmount,
    totalCost: totalAmount,
    amountPaid: paymentSummary.amountPaid,
    paymentStatus: paymentSummary.paymentStatus,
    notes: update.notes?.trim() || '',
    date: update.date,
  };
}

export function purchaseInventoryCostChanged(before: Purchase, after: Purchase): boolean {
  return (
    before.shippingCost !== after.shippingCost ||
    before.items.some((item) => {
      const updated = after.items.find((candidate) => candidate.productId === item.productId);
      return !updated ||
        updated.quantity !== item.quantity ||
        updated.purchasePrice !== item.purchasePrice ||
        updated.effectiveUnitCost !== item.effectiveUnitCost;
    })
  );
}

export function updateProductForPurchaseEdit(
  currentStock: number,
  currentUnitCost: number,
  reservedStock: number,
  oldItem: PurchaseItem,
  newItem: PurchaseItem
): { currentStock: number; purchasePrice: number } {
  const nextStock = currentStock - oldItem.quantity + newItem.quantity;
  if (nextStock < reservedStock || nextStock < 0) {
    throw new Error(`Cannot reduce purchase quantity below stock already sold or reserved for ${oldItem.productName}`);
  }

  const previousPurchaseValue = oldItem.quantity * oldItem.effectiveUnitCost;
  const updatedPurchaseValue = newItem.quantity * newItem.effectiveUnitCost;
  const nextInventoryValue = currentStock * currentUnitCost - previousPurchaseValue + updatedPurchaseValue;
  const nextUnitCost = nextStock > 0 ? Math.max(0, nextInventoryValue / nextStock) : 0;
  return { currentStock: nextStock, purchasePrice: nextUnitCost };
}
