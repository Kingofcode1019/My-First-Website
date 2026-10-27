import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  runTransaction,
  where,
} from 'firebase/firestore';
import { auth, db, cleanObject } from '../lib/firebase';
import { inBuildStorage } from '../lib/inBuildStorage';
import { Account, FinanceAuditEntry, InventoryMovement, Product, Purchase, PurchasePayment, Supplier, Transaction } from '../types';
import { normalizeSupplierAssignment } from '../lib/supplierUtils';
import { applyPurchasePayment, getInitialPurchasePayment, getPurchasePaymentSummary } from '../lib/purchasePayment';
import {
  buildEditedPurchase,
  PurchaseEditInput,
  purchaseInventoryCostChanged,
  updateProductForPurchaseEdit,
} from '../lib/purchaseEdit';

type PurchaseInput = {
  supplierId?: string;
  supplierName?: string;
  items: { productId: string; productName: string; quantity: number; purchasePrice: number; totalCost: number }[];
  shippingCost?: number;
  totalCost?: number;
  notes?: string;
  date: string;
};

function assertPurchaseUserScope(userId: string): void {
  if (!userId) throw new Error('Sign in or select a workspace before correcting purchases');
  if (inBuildStorage.getStorageMode() === 'in-build') {
    const activeUid = localStorage.getItem('apex_personal_storage_uid') ||
      'local_merchant';
    if (userId !== activeUid) throw new Error('You are not authorized to change this workspace');
    return;
  }
  if (!auth?.currentUser || auth.currentUser.uid !== userId) {
    throw new Error('You are not authorized to change this workspace');
  }
}

export const purchasesService = {
  async getPurchases(userId: string): Promise<Purchase[]> {
    if (inBuildStorage.getStorageMode() === 'in-build') {
      return inBuildStorage.getPurchases().map((purchase) => ({
        ...purchase,
        ...normalizeSupplierAssignment(purchase.supplierId, purchase.supplierName),
      }));
    }

    const path = `users/${userId}/purchases`;
    try {
      const q = query(collection(db, path), orderBy('date', 'desc'));
      const snapshot = await getDocs(q);
      return snapshot.docs.map((d) => {
        const purchase = d.data() as Partial<Purchase>;
        const supplier = normalizeSupplierAssignment(purchase.supplierId, purchase.supplierName);
        return {
          ...purchase,
          id: d.id,
          ...supplier,
          subtotal: purchase.subtotal ?? purchase.totalCost ?? 0,
          shippingCost: purchase.shippingCost ?? 0,
          totalAmount: purchase.totalAmount ?? purchase.totalCost ?? 0,
          totalCost: purchase.totalCost ?? purchase.totalAmount ?? 0,
          items: (purchase.items || []).map((item) => ({
            ...item,
            effectiveUnitCost: item.effectiveUnitCost ?? item.purchasePrice,
          })),
          payments: purchase.payments || [],
        } as Purchase;
      });
    } catch (err) {
      throw err;
    }
  },

  async recordPurchase(
    userId: string,
    data: PurchaseInput
  ): Promise<Purchase> {
    const supplierAssignment = normalizeSupplierAssignment(data.supplierId, data.supplierName);
    const shippingCost = Math.max(0, Number(data.shippingCost) || 0);
    const itemsByProduct = new Map<string, typeof data.items[number]>();
    for (const item of data.items) {
      if (
        !Number.isInteger(item.quantity) ||
        item.quantity <= 0 ||
        !Number.isFinite(item.purchasePrice) ||
        item.purchasePrice < 0
      ) {
        throw new Error('Purchase quantities must be positive and unit prices cannot be negative');
      }
      const existing = itemsByProduct.get(item.productId);
      if (existing) {
        const nextQuantity = existing.quantity + item.quantity;
        existing.purchasePrice =
          (existing.purchasePrice * existing.quantity + item.purchasePrice * item.quantity) / nextQuantity;
        existing.quantity = nextQuantity;
        existing.totalCost += item.purchasePrice * item.quantity;
      } else {
        itemsByProduct.set(item.productId, {
          ...item,
          totalCost: item.purchasePrice * item.quantity,
        });
      }
    }

    const baseItems = Array.from(itemsByProduct.values());
    const totalUnits = baseItems.reduce((sum, item) => sum + item.quantity, 0);
    if (totalUnits <= 0) throw new Error('Add at least one product to the purchase');
    const subtotal = baseItems.reduce((sum, item) => sum + item.purchasePrice * item.quantity, 0);
    const totalAmount = subtotal + shippingCost;
    if (!Number.isFinite(totalAmount)) throw new Error('Purchase total must be a valid non-negative number');

    const effectiveItems = baseItems.map((item) => {
      const effectiveUnitCost = item.purchasePrice + shippingCost / totalUnits;
      return {
        ...item,
        purchasePrice: item.purchasePrice,
        effectiveUnitCost,
        totalCost: item.quantity * effectiveUnitCost,
      };
    });
    const date = data.date || new Date().toISOString();
    const initialPayment = getInitialPurchasePayment();

    const sanitized = cleanObject({
      ...supplierAssignment,
      items: effectiveItems,
      subtotal,
      shippingCost,
      totalAmount,
      totalCost: totalAmount,
      ...initialPayment,
      payments: [],
      notes: data.notes,
      date,
    });

    if (inBuildStorage.getStorageMode() === 'in-build') {
      return inBuildStorage.createPurchase(sanitized);
    }

    const purchaseRef = doc(collection(db, `users/${userId}/purchases`));
    const supplierRef = supplierAssignment.supplierId
      ? doc(db, `users/${userId}/suppliers/${supplierAssignment.supplierId}`)
      : null;
    const productRefs = baseItems.map((item) => ({
      item,
      ref: doc(db, `users/${userId}/products/${item.productId}`),
    }));
    const now = new Date().toISOString();

    return runTransaction(db, async (transaction) => {
      let supplier: Supplier | null = null;
      if (supplierRef) {
        const supplierSnapshot = await transaction.get(supplierRef);
        if (!supplierSnapshot.exists()) throw new Error('Selected supplier does not exist');
        supplier = supplierSnapshot.data() as Supplier;
      }

      const products = [] as Array<{ item: typeof baseItems[number]; ref: typeof productRefs[number]['ref']; product: Product }>;
      for (const productRef of productRefs) {
        const productSnapshot = await transaction.get(productRef.ref);
        if (!productSnapshot.exists()) {
          throw new Error(`Product ${productRef.item.productName} no longer exists`);
        }
        products.push({
          item: productRef.item,
          ref: productRef.ref,
          product: productSnapshot.data() as Product,
        });
      }

      const purchase: Purchase = cleanObject({
        id: purchaseRef.id,
        supplierId: supplier?.id || supplierAssignment.supplierId,
        supplierName: supplier?.company || supplierAssignment.supplierName,
        items: effectiveItems,
        subtotal,
        shippingCost,
        totalAmount,
        totalCost: totalAmount,
        ...initialPayment,
        payments: [],
        notes: data.notes,
        date,
        createdAt: now,
      });

      for (const { item, ref, product } of products) {
        const newStock = (product.currentStock || 0) + item.quantity;
        const oldValue = (product.currentStock || 0) * (product.purchasePrice || 0);
        const incomingValue = item.quantity * (item.purchasePrice + shippingCost / totalUnits);
        const weightedUnitCost = newStock > 0 ? (oldValue + incomingValue) / newStock : 0;
        transaction.update(ref, {
          currentStock: newStock,
          purchasePrice: weightedUnitCost,
          updatedAt: now,
        });

        const movementRef = doc(collection(db, `users/${userId}/inventoryMovements`));
        transaction.set(movementRef, {
          id: movementRef.id,
          productId: item.productId,
          productName: item.productName,
          sku: product.sku,
          quantity: item.quantity,
          prevStock: product.currentStock || 0,
          newStock,
          type: 'purchase',
          supplierName: supplier?.company || supplierAssignment.supplierName,
          reason: `Stock Purchase from ${supplier?.company || supplierAssignment.supplierName}`,
          referenceId: purchaseRef.id,
          date,
        });
      }

      if (supplierRef && supplier) {
        transaction.update(supplierRef, {
          totalPurchases: (supplier.totalPurchases || 0) + totalAmount,
          updatedAt: now,
        });
      }

      transaction.set(purchaseRef, purchase);
      return purchase;
    });
  },

  async recordPurchasePayment(
    userId: string,
    data: { purchaseId: string; amount: number; accountId: string; date: string; note?: string }
  ): Promise<Purchase> {
    if (!data.purchaseId) throw new Error('Select an inventory purchase');
    if (!data.accountId) throw new Error('Select the account used for this payment');
    if (!Number.isFinite(data.amount) || data.amount <= 0) throw new Error('Payment amount must be greater than zero');
    if (!data.date || !Number.isFinite(new Date(data.date).getTime())) throw new Error('Enter a valid payment date');

    if (inBuildStorage.getStorageMode() === 'in-build') {
      return inBuildStorage.recordPurchasePayment(data);
    }

    const purchaseRef = doc(db, `users/${userId}/purchases/${data.purchaseId}`);
    const accountRef = doc(db, `users/${userId}/accounts/${data.accountId}`);
    const transactionRef = doc(collection(db, `users/${userId}/transactions`));
    const now = new Date().toISOString();

    return runTransaction(db, async (transaction) => {
      const [purchaseSnapshot, accountSnapshot] = await Promise.all([
        transaction.get(purchaseRef),
        transaction.get(accountRef),
      ]);
      if (!purchaseSnapshot.exists()) throw new Error('Inventory purchase not found');
      if (!accountSnapshot.exists()) throw new Error('Selected payment account does not exist');

      const purchase = { id: purchaseSnapshot.id, ...purchaseSnapshot.data() } as Purchase;
      const account = accountSnapshot.data() as Account;
      const totalAmount = Number(purchase.totalAmount ?? purchase.totalCost);
      const existingPayment = getPurchasePaymentSummary(
        totalAmount,
        purchase.amountPaid,
        purchase.paymentStatus
      );
      const paymentUpdate = applyPurchasePayment(totalAmount, existingPayment.amountPaid, data.amount);
      const payment: PurchasePayment = {
        id: transactionRef.id,
        amount: data.amount,
        accountId: accountSnapshot.id,
        accountName: account.name,
        date: data.date,
        ...(data.note?.trim() ? { note: data.note.trim() } : {}),
      };
      const updatedPurchase: Purchase = {
        ...purchase,
        amountPaid: paymentUpdate.amountPaid,
        paymentStatus: paymentUpdate.paymentStatus,
        payments: [...(purchase.payments || []), payment],
      };

      transaction.update(purchaseRef, {
        amountPaid: updatedPurchase.amountPaid,
        paymentStatus: updatedPurchase.paymentStatus,
        payments: updatedPurchase.payments,
        updatedAt: now,
      });
      transaction.update(accountRef, {
        currentBalance: (Number(account.currentBalance) || 0) - data.amount,
        updatedAt: now,
      });
      const financeTransaction: Transaction = {
        id: transactionRef.id,
        type: 'expense',
        amount: data.amount,
        accountId: accountSnapshot.id,
        accountName: account.name,
        category: 'Product Purchase',
        referenceId: purchase.id,
        date: data.date,
        note: data.note?.trim() || `Payment for inventory purchase ${purchase.id}`,
        createdAt: now,
      };
      transaction.set(transactionRef, financeTransaction);
      return updatedPurchase;
    });
  },

  async updatePurchase(userId: string, purchaseId: string, data: PurchaseEditInput): Promise<Purchase> {
    assertPurchaseUserScope(userId);
    if (inBuildStorage.getStorageMode() === 'in-build') {
      return inBuildStorage.updatePurchase(purchaseId, data);
    }

    const purchaseRef = doc(db, `users/${userId}/purchases/${purchaseId}`);
    const auditRef = doc(collection(db, `users/${userId}/financeAuditLogs`));
    const initialPurchaseSnapshot = await getDoc(purchaseRef);
    if (!initialPurchaseSnapshot.exists()) throw new Error('Inventory purchase not found');
    const initialPurchase = initialPurchaseSnapshot.data() as Purchase;
    const movementRefsByProduct = new Map<string, Array<ReturnType<typeof doc>>>();
    for (const item of initialPurchase.items) {
      const movementSnapshot = await getDocs(query(
        collection(db, `users/${userId}/inventoryMovements`),
        where('productId', '==', item.productId)
      ));
      movementRefsByProduct.set(item.productId, movementSnapshot.docs.map((movement) => movement.ref));
    }
    const now = new Date().toISOString();
    return runTransaction(db, async (transaction) => {
      const purchaseSnapshot = await transaction.get(purchaseRef);
      if (!purchaseSnapshot.exists()) throw new Error('Inventory purchase not found');
      const original = { id: purchaseSnapshot.id, ...purchaseSnapshot.data() } as Purchase;
      const updated = buildEditedPurchase(original, data);
      const inventoryChanged = purchaseInventoryCostChanged(original, updated);
      const movementNeedsCorrection = inventoryChanged || original.date !== updated.date;

      const supplierIds = Array.from(new Set(
        [original.supplierId, updated.supplierId].filter((id): id is string => Boolean(id))
      ));
      const supplierRefs = new Map(supplierIds.map((id) => [
        id,
        doc(db, `users/${userId}/suppliers/${id}`),
      ]));
      const supplierSnapshots = new Map<string, Awaited<ReturnType<typeof transaction.get>>>();
      for (const [id, ref] of supplierRefs) {
        supplierSnapshots.set(id, await transaction.get(ref));
      }
      if (updated.supplierId && !supplierSnapshots.get(updated.supplierId)?.exists()) {
        throw new Error('Selected supplier does not exist');
      }

      const productRefs = original.items.map((item) => ({
        item,
        ref: doc(db, `users/${userId}/products/${item.productId}`),
      }));
      const productSnapshots = new Map<string, Awaited<ReturnType<typeof transaction.get>>>();
      for (const { item, ref } of productRefs) {
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists()) throw new Error(`Product ${item.productName} no longer exists`);
        productSnapshots.set(item.productId, snapshot);
      }
      const movementSnapshots = new Map<string, Array<{ ref: ReturnType<typeof doc>; movement: InventoryMovement }>>();
      for (const { item } of productRefs) {
        const refs = movementRefsByProduct.get(item.productId) || [];
        const snapshots = await Promise.all(refs.map((ref) => transaction.get(ref)));
        movementSnapshots.set(item.productId, snapshots
          .filter((snapshot) => snapshot.exists())
          .map((snapshot) => ({
            ref: snapshot.ref,
            movement: { id: snapshot.id, ...snapshot.data() } as InventoryMovement,
          })));
      }

      const originalDateMs = new Date(original.date).getTime();
      const updatedDateMs = new Date(updated.date).getTime();
      const movementCutoff = Math.min(originalDateMs, updatedDateMs);
      if (movementNeedsCorrection && !Number.isFinite(movementCutoff)) {
        throw new Error('Existing purchase date is invalid; its inventory history cannot be safely edited');
      }
      const updatedItems = new Map(updated.items.map((item) => [item.productId, item]));
      const purchaseMovements = new Map<string, InventoryMovement>();
      for (let index = 0; index < productRefs.length; index += 1) {
        const { item, ref } = productRefs[index];
        const rows = movementSnapshots.get(item.productId) || [];
        const ownMovement = rows.find(({ movement }) =>
          movement.type === 'purchase' && movement.referenceId === purchaseId
        );
        if (ownMovement) purchaseMovements.set(item.productId, ownMovement.movement);
        if (!movementNeedsCorrection) {
          if (ownMovement && updated.supplierName !== original.supplierName) {
            transaction.update(ownMovement.ref, {
              supplierName: updated.supplierName,
              reason: `Stock Purchase from ${updated.supplierName}`,
            });
          }
          continue;
        }
        if (!ownMovement) {
          throw new Error('Purchase inventory history is missing; quantity, cost, or date cannot be safely edited');
        }
        if (rows.some(({ movement }) =>
          movement.id !== ownMovement.movement.id &&
          new Date(movement.date).getTime() >= movementCutoff
        )) {
          throw new Error(`Stock for ${item.productName} has later inventory movements. Quantity, cost, or date cannot be safely edited from this purchase.`);
        }
        if (!inventoryChanged) {
          transaction.update(ownMovement.ref, {
            supplierName: updated.supplierName,
            reason: `Stock Purchase from ${updated.supplierName}`,
            date: updated.date,
          });
          continue;
        }
        const product = productSnapshots.get(item.productId)!.data() as Product;
        const newItem = updatedItems.get(item.productId)!;
        const oldItem = {
          ...item,
          effectiveUnitCost: item.effectiveUnitCost ??
            item.purchasePrice + (Number(original.shippingCost) || 0) /
              original.items.reduce((sum, purchaseItem) => sum + purchaseItem.quantity, 0),
        };
        const newItemWithCost = {
          ...newItem,
          effectiveUnitCost: newItem.effectiveUnitCost,
        };
        const productUpdate = updateProductForPurchaseEdit(
          Number(product.currentStock) || 0,
          Number(product.purchasePrice) || 0,
          Number(product.reservedStock) || 0,
          oldItem,
          newItemWithCost
        );
        transaction.update(productRefs[index].ref, {
          ...productUpdate,
          updatedAt: now,
        });
        transaction.update(ownMovement.ref, {
          quantity: newItem.quantity,
          newStock: ownMovement.movement.prevStock + newItem.quantity,
          supplierName: updated.supplierName,
          reason: `Stock Purchase from ${updated.supplierName}`,
          date: updated.date,
        });
      }

      for (const id of supplierIds) {
        const supplierSnapshot = supplierSnapshots.get(id);
        if (!supplierSnapshot?.exists()) continue;
        const supplier = supplierSnapshot.data() as Supplier;
        const delta = (updated.supplierId === id ? updated.totalAmount : 0) -
          (original.supplierId === id ? Number(original.totalAmount ?? original.totalCost) : 0);
        if (delta !== 0) {
          transaction.update(supplierRefs.get(id)!, {
            totalPurchases: Math.max(0, (Number(supplier.totalPurchases) || 0) + delta),
            updatedAt: now,
          });
        }
      }

      const persistedPurchase = cleanObject({ ...updated, updatedAt: now });
      const audit: FinanceAuditEntry = {
        id: auditRef.id,
        action: 'purchase_edited',
        recordType: 'purchase',
        recordId: purchaseId,
        previousValues: cleanObject({
          supplierId: original.supplierId,
          supplierName: original.supplierName,
          items: original.items,
          shippingCost: original.shippingCost,
          totalAmount: original.totalAmount ?? original.totalCost,
          amountPaid: original.amountPaid,
          date: original.date,
          notes: original.notes,
        }),
        newValues: cleanObject({
          supplierId: updated.supplierId,
          supplierName: updated.supplierName,
          items: updated.items,
          shippingCost: updated.shippingCost,
          totalAmount: updated.totalAmount,
          amountPaid: updated.amountPaid,
          date: updated.date,
          notes: updated.notes,
        }),
        reason: 'Inventory purchase corrected',
        responsibleUserId: userId,
        timestamp: now,
      };
      transaction.update(purchaseRef, persistedPurchase);
      transaction.set(auditRef, cleanObject(audit));
      return persistedPurchase;
    });
  },

  async createPurchase(
    userId: string,
    data: PurchaseInput
  ): Promise<Purchase> {
    return purchasesService.recordPurchase(userId, data);
  },
};
