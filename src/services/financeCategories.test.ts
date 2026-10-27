import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertCustomFinanceCategoryName,
  financeCategoryKey,
  isOperatingExpenseTransaction,
  PREDEFINED_FINANCE_CATEGORIES,
} from '../lib/financeCategories';

test('custom finance category names are trimmed and collapse extra whitespace', () => {
  assert.equal(assertCustomFinanceCategoryName('income', '  Product   Photography  '), 'Product Photography');
  assert.equal(financeCategoryKey('product  photography'), financeCategoryKey(' Product Photography '));
});

test('income and expense predefined categories remain separate and include Other', () => {
  assert.ok(PREDEFINED_FINANCE_CATEGORIES.income.includes('Other'));
  assert.ok(PREDEFINED_FINANCE_CATEGORIES.expense.includes('Other'));
  assert.ok(PREDEFINED_FINANCE_CATEGORIES.income.includes('Owner Investment'));
  assert.ok(!PREDEFINED_FINANCE_CATEGORIES.expense.includes('Owner Investment'));
  assert.ok(!PREDEFINED_FINANCE_CATEGORIES.expense.includes('Product Purchase'));
});

test('custom category validation prevents predefined duplicates regardless of capitalization', () => {
  assert.throws(() => assertCustomFinanceCategoryName('expense', '  pAcKaGiNg  '), /already exists/);
  assert.throws(() => assertCustomFinanceCategoryName('income', ' OTHER '), /already exists/);
  assert.throws(() => assertCustomFinanceCategoryName('income', '   '), /required/);
});

test('product purchases are not included in operating expenses', () => {
  assert.equal(isOperatingExpenseTransaction({ type: 'expense', category: 'Product Purchase' }), false);
  assert.equal(isOperatingExpenseTransaction({ type: 'expense', category: ' inventory   purchase ' }), false);
  assert.equal(isOperatingExpenseTransaction({ type: 'expense', category: 'Packaging' }), true);
  assert.equal(isOperatingExpenseTransaction({ type: 'income', category: 'Packaging' }), false);
});
