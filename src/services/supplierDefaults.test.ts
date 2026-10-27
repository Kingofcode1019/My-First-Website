import assert from 'node:assert/strict';
import test from 'node:test';
import { getSupplierDisplayName, normalizeSupplierAssignment, UNASSIGNED_SUPPLIER_NAME } from '../lib/supplierUtils';

test('unassigned supplier has no supplier ID and a stable display name', () => {
  assert.equal(UNASSIGNED_SUPPLIER_NAME, 'Unassigned Supplier');
  assert.deepEqual(normalizeSupplierAssignment(), {
    supplierId: '',
    supplierName: UNASSIGNED_SUPPLIER_NAME,
  });
  assert.deepEqual(normalizeSupplierAssignment('  ', 'Vendor'), {
    supplierId: '',
    supplierName: UNASSIGNED_SUPPLIER_NAME,
  });
  assert.equal(getSupplierDisplayName(''), UNASSIGNED_SUPPLIER_NAME);
});

test('selected suppliers retain their ID and display name', () => {
  assert.deepEqual(normalizeSupplierAssignment('supplier-1', '  Acme Ltd  '), {
    supplierId: 'supplier-1',
    supplierName: 'Acme Ltd',
  });
});
