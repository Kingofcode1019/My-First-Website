import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db, cleanObject } from '../lib/firebase';
import { inBuildStorage } from '../lib/inBuildStorage';
import { Customer } from '../types';

export const customersService = {
  async getCustomers(userId: string): Promise<Customer[]> {
    if (inBuildStorage.getStorageMode() === 'in-build') {
      return inBuildStorage.getCustomers();
    }

    const path = `users/${userId}/customers`;
    try {
      const q = query(collection(db, path), orderBy('name', 'asc'));
      const snapshot = await getDocs(q);
      return snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Customer));
    } catch (err) {
      throw err;
    }
  },

  async getCustomerById(userId: string, customerId: string): Promise<Customer | null> {
    if (inBuildStorage.getStorageMode() === 'in-build') {
      return inBuildStorage.getCustomerById(customerId);
    }

    const path = `users/${userId}/customers/${customerId}`;
    try {
      const snap = await getDoc(doc(db, path));
      if (!snap.exists()) return null;
      return { id: snap.id, ...snap.data() } as Customer;
    } catch (err) {
      throw err;
    }
  },

  async findCustomerByPhone(userId: string, phone: string): Promise<Customer | null> {
    const cleanPhone = phone.trim();
    if (inBuildStorage.getStorageMode() === 'in-build') {
      return inBuildStorage.getCustomers().find((c) => c.phone === cleanPhone) || null;
    }

    const path = `users/${userId}/customers`;
    try {
      const q = query(collection(db, path), where('phone', '==', cleanPhone));
      const snapshot = await getDocs(q);
      if (snapshot.empty) return null;
      const first = snapshot.docs[0];
      return { id: first.id, ...first.data() } as Customer;
    } catch (err) {
      throw err;
    }
  },

  async getCustomerByPhone(userId: string, phone: string): Promise<Customer | null> {
    return this.findCustomerByPhone(userId, phone);
  },

  async createCustomer(
    userId: string,
    data: { name: string; phone: string; address?: string; email?: string; city?: string }
  ): Promise<Customer> {
    const cleanPhone = data.phone.trim();
    const sanitized = cleanObject({
      name: data.name.trim(),
      phone: cleanPhone,
      address: data.address?.trim() || '',
      email: data.email?.trim() || '',
      city: data.city?.trim() || '',
    });

    if (inBuildStorage.getStorageMode() === 'in-build') {
      return inBuildStorage.createCustomer(sanitized);
    }

    const path = `users/${userId}/customers`;
    try {
      const custRef = doc(collection(db, path));
      const now = new Date().toISOString();
      const newCustomer: Customer = {
        id: custRef.id,
        ...sanitized,
        totalOrders: 0,
        deliveredOrders: 0,
        pendingOrders: 0,
        cancelledOrders: 0,
        returnedOrders: 0,
        totalSpent: 0,
        ltv: 0,
        createdAt: now,
        updatedAt: now,
      };
      await setDoc(custRef, newCustomer);
      return newCustomer;
    } catch (err) {
      throw err;
    }
  },

  async getOrCreateCustomer(
    userId: string,
    data: { name: string; phone: string; address?: string; email?: string; city?: string }
  ): Promise<Customer> {
    const existing = await this.findCustomerByPhone(userId, data.phone);
    if (existing) return existing;
    return this.createCustomer(userId, data);
  },

  async updateCustomer(userId: string, customerId: string, updates: Partial<Customer>): Promise<void> {
    const sanitized = cleanObject(updates);
    if (inBuildStorage.getStorageMode() === 'in-build') {
      inBuildStorage.updateCustomer(customerId, sanitized);
      return;
    }

    const path = `users/${userId}/customers/${customerId}`;
    try {
      await updateDoc(doc(db, path), {
        ...sanitized,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      throw err;
    }
  },

  async deleteCustomer(userId: string, customerId: string): Promise<void> {
    if (inBuildStorage.getStorageMode() === 'in-build') {
      inBuildStorage.deleteCustomer(customerId);
      return;
    }

    const customerRef = doc(db, `users/${userId}/customers/${customerId}`);
    const snapshot = await getDoc(customerRef);
    if (!snapshot.exists()) throw new Error('Customer not found');
    await deleteDoc(customerRef);
  },
};
