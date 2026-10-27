import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import { db, cleanObject } from '../lib/firebase';
import { inBuildStorage } from '../lib/inBuildStorage';
import { InventoryMovement } from '../types';
import { Purchase } from '../types';
import { purchasesService } from './purchases.service';
import { getSupplierDisplayName, normalizeSupplierAssignment } from '../lib/supplierUtils';

export const inventoryService = {
  async restockProduct(
    userId: string,
    data: {
      productId: string;
      productName: string;
      supplierId?: string;
      supplierName?: string;
      quantity: number;
      purchasePrice: number;
      shippingCost: number;
      notes?: string;
      date: string;
    }
  ): Promise<Purchase> {
    if (!Number.isInteger(data.quantity) || data.quantity <= 0) {
      throw new Error('Restock quantity must be a positive whole number');
    }
    if (
      !Number.isFinite(data.purchasePrice) ||
      !Number.isFinite(data.shippingCost) ||
      data.purchasePrice < 0 ||
      data.shippingCost < 0
    ) {
      throw new Error('Purchase price and shipping cannot be negative');
    }

    const subtotal = data.quantity * data.purchasePrice;

    const supplier = normalizeSupplierAssignment(data.supplierId, data.supplierName);
    return purchasesService.recordPurchase(userId, {
      ...supplier,
      items: [{
        productId: data.productId,
        productName: data.productName,
        quantity: data.quantity,
        purchasePrice: data.purchasePrice,
        totalCost: subtotal,
      }],
      shippingCost: data.shippingCost,
      totalCost: subtotal + data.shippingCost,
      notes: data.notes,
      date: data.date,
    });
  },

  async getMovements(userId: string, maxCount: number = 100): Promise<InventoryMovement[]> {
    if (inBuildStorage.getStorageMode() === 'in-build') {
      return inBuildStorage.getMovements().slice(0, maxCount).map((movement) => ({
        ...movement,
        ...(movement.type === 'purchase' || movement.type === 'stock_in'
          ? { supplierName: getSupplierDisplayName(movement.supplierName) }
          : {}),
      }));
    }

    const path = `users/${userId}/inventoryMovements`;
    try {
      const q = query(collection(db, path), orderBy('date', 'desc'), limit(maxCount));
      const snapshot = await getDocs(q);
      return snapshot.docs.map((d) => {
        const movement = { id: d.id, ...d.data() } as InventoryMovement;
        return movement.type === 'purchase' || movement.type === 'stock_in'
          ? { ...movement, supplierName: getSupplierDisplayName(movement.supplierName) }
          : movement;
      });
    } catch (err) {
      throw err;
    }
  },

  async getMovementsByProduct(userId: string, productId: string): Promise<InventoryMovement[]> {
    if (inBuildStorage.getStorageMode() === 'in-build') {
      return inBuildStorage
        .getMovements()
        .filter((m) => m.productId === productId)
        .slice(0, 50)
        .map((movement) => ({
          ...movement,
          ...(movement.type === 'purchase' || movement.type === 'stock_in'
            ? { supplierName: getSupplierDisplayName(movement.supplierName) }
            : {}),
        }));
    }

    const path = `users/${userId}/inventoryMovements`;
    try {
      const q = query(collection(db, path), where('productId', '==', productId), orderBy('date', 'desc'), limit(50));
      const snapshot = await getDocs(q);
      return snapshot.docs.map((d) => {
        const movement = { id: d.id, ...d.data() } as InventoryMovement;
        return movement.type === 'purchase' || movement.type === 'stock_in'
          ? { ...movement, supplierName: getSupplierDisplayName(movement.supplierName) }
          : movement;
      });
    } catch (err) {
      throw err;
    }
  },

  async recordMovement(userId: string, movement: Omit<InventoryMovement, 'id'>, customId?: string): Promise<InventoryMovement> {
    const sanitized = cleanObject(movement);
    if (inBuildStorage.getStorageMode() === 'in-build') {
      return inBuildStorage.recordMovement(sanitized);
    }

    const path = `users/${userId}/inventoryMovements`;
    try {
      const movementId = customId || doc(collection(db, path)).id;
      const fullMovement: InventoryMovement = {
        id: movementId,
        ...sanitized,
      };
      await setDoc(doc(db, path, movementId), fullMovement);
      return fullMovement;
    } catch (err) {
      throw err;
    }
  },
};
