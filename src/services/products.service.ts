import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType, cleanObject } from '../lib/firebase';
import { inBuildStorage } from '../lib/inBuildStorage';
import { InventoryMovementType, Product } from '../types';
import { normalizeSupplierAssignment } from '../lib/supplierUtils';

export const productsService = {
  async getProducts(userId: string): Promise<Product[]> {
    if (inBuildStorage.getStorageMode() === 'in-build') {
      return inBuildStorage.getProducts().map((product) => ({
        ...product,
        ...normalizeSupplierAssignment(product.supplierId, product.supplierName),
      }));
    }

    const path = `users/${userId}/products`;
    try {
      const q = query(collection(db, path), orderBy('name', 'asc'));
      const snapshot = await getDocs(q);
      return snapshot.docs.map((d) => {
        const product = d.data() as Product;
        return {
          ...product,
          ...normalizeSupplierAssignment(product.supplierId, product.supplierName),
          id: d.id,
        };
      });
    } catch (err) {
      throw err;
    }
  },

  async getProductById(userId: string, productId: string): Promise<Product | null> {
    if (inBuildStorage.getStorageMode() === 'in-build') {
      const product = inBuildStorage.getProductById(productId);
      return product
        ? { ...product, ...normalizeSupplierAssignment(product.supplierId, product.supplierName) }
        : null;
    }

    const path = `users/${userId}/products/${productId}`;
    try {
      const snap = await getDoc(doc(db, path));
      if (!snap.exists()) return null;
      const product = snap.data() as Product;
      return {
        ...product,
        ...normalizeSupplierAssignment(product.supplierId, product.supplierName),
        id: snap.id,
      };
    } catch (err) {
      throw err;
    }
  },

  async createProduct(
    userId: string,
    data: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<Product> {
    const supplier = normalizeSupplierAssignment(data.supplierId, data.supplierName);
    // Clean all undefined fields
    const sanitizedData = cleanObject({
      name: data.name,
      sku: data.sku,
      category: data.category || 'General',
      brand: data.brand || '',
      description: data.description || '',
      imageUrl: data.imageUrl || '',
      purchasePrice: Number(data.purchasePrice) || 0,
      sellingPrice: Number(data.sellingPrice) || 0,
      currentStock: Number(data.currentStock) || 0,
      minStockLevel: Number(data.minStockLevel) || 5,
      unit: data.unit || 'pcs',
      ...supplier,
      status: data.status || 'active',
    });

    if (inBuildStorage.getStorageMode() === 'in-build') {
      return inBuildStorage.createProduct(sanitizedData);
    }

    if (!auth?.currentUser || auth.currentUser.uid !== userId) {
      throw new Error('Sign in to the Firebase workspace before adding products.');
    }

    const path = `users/${userId}/products`;
    try {
      const prodRef = doc(collection(db, path));
      const now = new Date().toISOString();
      const newProduct: Product = {
        id: prodRef.id,
        ...sanitizedData,
        createdAt: now,
        updatedAt: now,
      };
      const batch = writeBatch(db);
      batch.set(prodRef, newProduct);

      // Record initial inventory movement if currentStock > 0
      if (newProduct.currentStock > 0) {
        const movPath = `users/${userId}/inventoryMovements`;
        const movRef = doc(collection(db, movPath));
        batch.set(movRef, {
          id: movRef.id,
          productId: newProduct.id,
          productName: newProduct.name,
          sku: newProduct.sku,
          quantity: newProduct.currentStock,
          prevStock: 0,
          newStock: newProduct.currentStock,
          type: 'stock_in',
          supplierName: newProduct.supplierName,
          reason: 'Initial Product Stock Setup',
          date: now,
        });
      }
      await batch.commit();

      return newProduct;
    } catch (err) {
      throw err;
    }
  },

  async updateProduct(userId: string, productId: string, updates: Partial<Product>): Promise<void> {
    const sanitized = cleanObject(updates);
    if (inBuildStorage.getStorageMode() === 'in-build') {
      inBuildStorage.updateProduct(productId, sanitized);
      return;
    }

    const path = `users/${userId}/products/${productId}`;
    try {
      const docRef = doc(db, path);
      await updateDoc(docRef, {
        ...sanitized,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      throw err;
    }
  },

  async deleteProduct(userId: string, productId: string): Promise<void> {
    if (inBuildStorage.getStorageMode() === 'in-build') {
      inBuildStorage.deleteProduct(productId);
      return;
    }

    const productRef = doc(db, `users/${userId}/products/${productId}`);
    const snapshot = await getDoc(productRef);
    if (!snapshot.exists()) throw new Error('Product not found');

    const movementSnapshot = await getDocs(
      query(
        collection(db, `users/${userId}/inventoryMovements`),
        where('productId', '==', productId)
      )
    );
    const hasOtherMovements = movementSnapshot.docs.some((movementDoc) => {
      const movement = movementDoc.data();
      return !(
        movement.type === 'stock_in' &&
        movement.prevStock === 0 &&
        movement.reason === 'Initial Product Stock Setup'
      );
    });

    const batch = writeBatch(db);
    batch.delete(productRef);
    if (!hasOtherMovements) {
      movementSnapshot.docs.forEach((movementDoc) => {
        const movement = movementDoc.data();
        if (
          movement.type === 'stock_in' &&
          movement.prevStock === 0 &&
          movement.reason === 'Initial Product Stock Setup'
        ) {
          batch.delete(movementDoc.ref);
        }
      });
    }
    await batch.commit();
  },

  async adjustStock(
    userId: string,
    productId: string,
    delta: number,
    type: InventoryMovementType,
    reason: string,
    referenceId?: string
  ): Promise<number> {
    if (inBuildStorage.getStorageMode() === 'in-build') {
      return inBuildStorage.adjustStock(productId, delta, type, reason, referenceId);
    }

    const prodRef = doc(db, `users/${userId}/products/${productId}`);
    const movRef = doc(collection(db, `users/${userId}/inventoryMovements`));
    const now = new Date().toISOString();

    try {
      const newStock = await runTransaction(db, async (transaction) => {
        const prodSnap = await transaction.get(prodRef);
        if (!prodSnap.exists()) {
          throw new Error('Product does not exist');
        }
        const prod = prodSnap.data() as Product;
        const prevStock = prod.currentStock || 0;
        const calculated = prevStock + delta;

        if (calculated < 0) {
          throw new Error(`Insufficient stock. Available: ${prevStock}, Attempted change: ${delta}`);
        }

        transaction.update(prodRef, {
          currentStock: calculated,
          updatedAt: now,
        });

        transaction.set(movRef, {
          id: movRef.id,
          productId: prod.id,
          productName: prod.name,
          sku: prod.sku,
          quantity: Math.abs(delta),
          prevStock,
          newStock: calculated,
          type,
          reason,
          referenceId: referenceId || '',
          date: now,
        });

        return calculated;
      });

      return newStock;
    } catch (err) {
      throw err;
    }
  },
};
