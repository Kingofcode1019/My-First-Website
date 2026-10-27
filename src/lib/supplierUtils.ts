export const UNASSIGNED_SUPPLIER_NAME = 'Unassigned Supplier';

export function getSupplierDisplayName(name?: string | null): string {
  return name?.trim() || UNASSIGNED_SUPPLIER_NAME;
}

export function normalizeSupplierAssignment(supplierId?: string | null, supplierName?: string | null) {
  const normalizedId = supplierId?.trim() || '';
  return {
    supplierId: normalizedId,
    supplierName: normalizedId ? getSupplierDisplayName(supplierName) : UNASSIGNED_SUPPLIER_NAME,
  };
}
