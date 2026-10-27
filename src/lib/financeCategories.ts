import { FinanceCategoryType } from '../types';

export const PREDEFINED_FINANCE_CATEGORIES: Record<FinanceCategoryType, string[]> = {
  income: ['Other', 'Other Income', 'Owner Investment', 'Loan Received', 'Refund Received'],
  expense: [
    'Packaging',
    'Delivery / Courier',
    'Marketing / Ads',
    'Office / Warehouse Rent',
    'Salaries & Staff',
    'Utilities & Software',
    'Damage & Loss',
    'Equipment / Fixed Asset',
    'Other Operating Expense',
    'Other',
  ],
};

export function isInventoryPurchaseCategory(category?: string): boolean {
  const key = financeCategoryKey(category || '');
  return key === 'product purchase' || key === 'inventory purchase';
}

export function isOperatingExpenseTransaction(transaction: { type: string; category?: string }): boolean {
  return transaction.type === 'expense' && !isInventoryPurchaseCategory(transaction.category);
}

export function normalizeFinanceCategoryName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

export function financeCategoryKey(name: string): string {
  return normalizeFinanceCategoryName(name).toLowerCase();
}

export function financeCategoryDocumentId(type: FinanceCategoryType, normalizedName: string): string {
  let first = 2166136261;
  let second = 2246822519;
  for (const character of `${type}:${normalizedName}`) {
    const code = character.codePointAt(0) || 0;
    first = Math.imul(first ^ code, 16777619);
    second = Math.imul(second ^ code, 3266489917);
  }
  return `${type}_${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`;
}

export function assertCustomFinanceCategoryName(type: FinanceCategoryType, name: string): string {
  const normalizedName = normalizeFinanceCategoryName(name);
  if (!normalizedName) throw new Error('Category name is required');
  const key = financeCategoryKey(normalizedName);
  if (PREDEFINED_FINANCE_CATEGORIES[type].some((category) => financeCategoryKey(category) === key)) {
    throw new Error('This category already exists');
  }
  return normalizedName;
}
