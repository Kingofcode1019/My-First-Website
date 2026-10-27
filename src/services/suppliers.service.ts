import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  runTransaction,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db, cleanObject } from '../lib/firebase';
import { inBuildStorage } from '../lib/inBuildStorage';
import { Supplier } from '../types';
import { UNASSIGNED_SUPPLIER_NAME } from '../lib/supplierUtils';

export const suppliersService = {
  async getSuppliers(userId: string): Promise<Supplier[]> {
    if (inBuildStorage.getStorageMode() === 'in-build') {
      return inBuildStorage.getSuppliers();
    }

    const path = `users/${userId}/suppliers`;
    try {
      const q = query(collection(db, path), orderBy('name', 'asc'));
      const snapshot = await getDocs(q);
      const suppliers = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
        code: (d.data().code as string | undefined) || `SUP-${d.id}`,
      } as Supplier));
      await Promise.all(
        snapshot.docs
          .filter((d) => !d.data().code)
          .map((d) => updateDoc(d.ref, { code: `SUP-${d.id}` }))
      );
      return suppliers;
    } catch (err) {
      throw err;
    }
  },

  async getSupplierById(userId: string, supplierId: string): Promise<Supplier | null> {
    if (inBuildStorage.getStorageMode() === 'in-build') {
      return inBuildStorage.getSupplierById(supplierId);
    }

    const path = `users/${userId}/suppliers/${supplierId}`;
    try {
      const snap = await getDoc(doc(db, path));
      if (!snap.exists()) return null;
      return { id: snap.id, ...snap.data() } as Supplier;
    } catch (err) {
      throw err;
    }
  },

  async createSupplier(
    userId: string,
    data: Omit<Supplier, 'id' | 'code' | 'createdAt' | 'updatedAt' | 'totalPurchases' | 'amountPaid' | 'amountDue'>
  ): Promise<Supplier> {
    const sanitized = cleanObject(data);
    if (inBuildStorage.getStorageMode() === 'in-build') {
      return inBuildStorage.createSupplier(sanitized);
    }

    const path = `users/${userId}/suppliers`;
    try {
      const suppRef = doc(collection(db, path));
      const counterRef = doc(db, `users/${userId}/settings/supplierCodeCounter`);
      const now = new Date().toISOString();
      return await runTransaction(db, async (transaction) => {
        const counterSnapshot = await transaction.get(counterRef);
        const sequence = Math.max(1, Number(counterSnapshot.data()?.nextSequence) || 1);
        const newSupplier: Supplier = {
          id: suppRef.id,
          code: `SUP-${String(sequence).padStart(4, '0')}`,
          ...sanitized,
          totalPurchases: 0,
          createdAt: now,
          updatedAt: now,
        };
        transaction.set(suppRef, newSupplier);
        transaction.set(counterRef, { nextSequence: sequence + 1 }, { merge: true });
        return newSupplier;
      });
    } catch (err) {
      throw err;
    }
  },

  async deleteSupplier(userId: string, supplierId: string): Promise<void> {
    if (inBuildStorage.getStorageMode() === 'in-build') {
      inBuildStorage.deleteSupplier(supplierId);
      return;
    }

    const supplierRef = doc(db, `users/${userId}/suppliers/${supplierId}`);
    const supplierSnapshot = await getDoc(supplierRef);
    if (!supplierSnapshot.exists()) throw new Error('Supplier not found');

    const productQuery = query(
      collection(db, `users/${userId}/products`),
      where('supplierId', '==', supplierId)
    );
    const products = await getDocs(productQuery);
    await Promise.all(
      products.docs.map((product) => updateDoc(product.ref, {
        supplierId: '',
        supplierName: UNASSIGNED_SUPPLIER_NAME,
      }))
    );
    await deleteDoc(supplierRef);
  },

  async paySupplierDue(
    _userId: string,
    _data: { supplierId: string; amount: number; accountId: string; date: string; note?: string }
  ): Promise<never> {
    throw new Error('Supplier payments are disabled. Record actual money movements in Finance.');
  },

  async updateSupplier(userId: string, supplierId: string, updates: Partial<Supplier>): Promise<void> {
    const sanitized = cleanObject(updates);
    if (inBuildStorage.getStorageMode() === 'in-build') {
      inBuildStorage.updateSupplier(supplierId, sanitized);
      return;
    }

    const path = `users/${userId}/suppliers/${supplierId}`;
    try {
      await updateDoc(doc(db, path), {
        ...sanitized,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      throw err;
    }
  },
};
