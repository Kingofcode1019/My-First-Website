import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, cleanObject } from '../lib/firebase';
import { inBuildStorage } from '../lib/inBuildStorage';
import { BusinessSettings } from '../types';

export const defaultSettings: BusinessSettings = {
  id: 'general',
  businessName: '',
  phone: '',
  email: '',
  address: '',
  currency: 'BDT',
  currencySymbol: '৳',
  defaultDeliveryCharge: 80,
  orderPrefix: 'ORD',
  allowNegativeStock: false,
  defaultMinStockLevel: 5,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export const settingsService = {
  async getSettings(userId: string): Promise<BusinessSettings> {
    if (inBuildStorage.getStorageMode() === 'in-build') {
      return inBuildStorage.getSettings();
    }

    const path = `users/${userId}/settings/general`;
    const snap = await getDoc(doc(db, path));
    if (!snap.exists()) {
      await setDoc(doc(db, path), defaultSettings);
      return defaultSettings;
    }
    return snap.data() as BusinessSettings;
  },

  async updateSettings(userId: string, updates: Partial<BusinessSettings>): Promise<void> {
    const sanitized = cleanObject(updates);
    if (inBuildStorage.getStorageMode() === 'in-build') {
      inBuildStorage.updateSettings(sanitized);
      return;
    }

    const path = `users/${userId}/settings/general`;
    const current = await this.getSettings(userId);
    const updated = {
      ...current,
      ...sanitized,
      updatedAt: new Date().toISOString(),
    };
    await setDoc(doc(db, path), updated);
  },
};
