import React, { useState, useMemo } from 'react';
import { Purchase, Supplier } from '../../types';
import { useBusiness } from '../../context/BusinessContext';
import { formatCurrency, formatDate } from '../../lib/utils';
import { Truck, Plus, Search, Edit2, Eye, Trash2, CheckCircle2, Clock3 } from 'lucide-react';
import { EmptyState } from '../common/EmptyState';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { Modal } from '../common/Modal';
import { SupplierModal } from './SupplierModal';
import { LinkedShippingExpenseModal } from './LinkedShippingExpenseModal';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { suppliersService } from '../../services/suppliers.service';
import { getPurchasePaymentSummary } from '../../lib/purchasePayment';
import { UNASSIGNED_SUPPLIER_NAME } from '../../lib/supplierUtils';
import { EditPurchaseModal } from '../purchases/EditPurchaseModal';

const UNASSIGNED_SUPPLIER_ID = '__unassigned_supplier__';

export const SupplierList: React.FC = () => {
  const { suppliers, products, purchases, settings, refreshAll } = useBusiness();
  const { effectiveUid } = useAuth();
  const { success, error } = useToast();

  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [viewingSupplier, setViewingSupplier] = useState<Supplier | null>(null);
  const [deletingSupplier, setDeletingSupplier] = useState<Supplier | null>(null);
  const [shippingSupplier, setShippingSupplier] = useState<Supplier | null>(null);
  const [purchaseForShipping, setPurchaseForShipping] = useState<Purchase | null>(null);
  const [editingPurchase, setEditingPurchase] = useState<Purchase | null>(null);
  const [selectedSupplierIds, setSelectedSupplierIds] = useState<string[]>([]);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const supplierRows = useMemo<Supplier[]>(() => {
    const unassignedPurchases = purchases.filter((purchase) => !purchase.supplierId);
    const unassignedTotal = unassignedPurchases.reduce(
      (sum, purchase) => sum + Number(purchase.totalAmount || purchase.totalCost || 0),
      0
    );
    return [
      ...suppliers,
      {
        id: UNASSIGNED_SUPPLIER_ID,
        code: 'DEFAULT',
        name: UNASSIGNED_SUPPLIER_NAME,
        company: UNASSIGNED_SUPPLIER_NAME,
        phone: '',
        totalPurchases: unassignedTotal,
        createdAt: '',
        updatedAt: '',
      },
    ];
  }, [suppliers, purchases]);

  const filteredSuppliers = useMemo(() => {
    return supplierRows.filter((s) => {
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchComp = s.company.toLowerCase().includes(q);
        const matchName = s.name.toLowerCase().includes(q);
        const matchPhone = s.phone.includes(q);
        const matchCode = s.code.toLowerCase().includes(q);
        if (!matchComp && !matchName && !matchPhone && !matchCode) return false;
      }
      return true;
    });
  }, [supplierRows, search]);

  const handleDeleteSupplier = async () => {
    if (!effectiveUid || !deletingSupplier) return;
    try {
      setDeleteLoading(true);
      await suppliersService.deleteSupplier(effectiveUid, deletingSupplier.id);
      success('Supplier removed. Product links were cleared and purchase history was preserved.');
      setDeletingSupplier(null);
      await refreshAll();
    } catch (err: any) {
      error(err.message || 'Failed to delete supplier');
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleDeleteSelectedSuppliers = async () => {
    if (!effectiveUid || selectedSupplierIds.length === 0) return;
    try {
      setDeleteLoading(true);
      await Promise.all(selectedSupplierIds.map((id) => suppliersService.deleteSupplier(effectiveUid, id)));
      if (viewingSupplier && selectedSupplierIds.includes(viewingSupplier.id)) setViewingSupplier(null);
      setSelectedSupplierIds([]);
      setConfirmBulkDelete(false);
      success('Selected suppliers deleted. Purchase history was preserved.');
      await refreshAll();
    } catch (err: any) {
      error(err.message || 'Failed to delete selected suppliers');
    } finally {
      setDeleteLoading(false);
    }
  };

  const toggleSupplierSelection = (supplierId: string) => {
    setSelectedSupplierIds((selected) =>
      selected.includes(supplierId)
        ? selected.filter((id) => id !== supplierId)
        : [...selected, supplierId]
    );
  };

  const toggleVisibleSuppliers = () => {
    const visibleIds = filteredSuppliers.filter((supplier) => supplier.id !== UNASSIGNED_SUPPLIER_ID).map((supplier) => supplier.id);
    const allVisibleSelected = visibleIds.every((id) => selectedSupplierIds.includes(id));
    setSelectedSupplierIds((selected) =>
      allVisibleSelected
        ? selected.filter((id) => !visibleIds.includes(id))
        : Array.from(new Set([...selected, ...visibleIds]))
    );
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[#1c1b18] tracking-tight">Suppliers</h2>
          <p className="text-xs text-[#706c64] mt-0.5">
            Manage supplier information and review inventory purchase and payment history
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={() => {
              setEditingSupplier(null);
              setIsModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#23424d] hover:bg-[#1a323b] rounded-lg shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Supplier</span>
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="p-3 bg-white border border-[#e9e4dc] rounded-2xl shadow-2xs">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8a857b]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search suppliers by company name, contact person, or phone..."
            className="w-full pl-9 pr-3 py-2 bg-white border border-[#d8d3c9] rounded-lg text-xs text-[#1c1b18] placeholder-[#8a857b] focus:outline-none focus:border-[#23424d]"
          />
        </div>
      </div>

      {selectedSupplierIds.length > 0 && (
        <div className="flex items-center justify-between gap-3 px-3 py-2 bg-[#fff1f2] border border-[#fecdd3] rounded-lg">
          <span className="text-xs font-semibold text-[#881337]">{selectedSupplierIds.length} supplier(s) selected</span>
          <button
            type="button"
            onClick={() => setConfirmBulkDelete(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#be123c] hover:bg-[#9f1239] rounded-lg cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete selected
          </button>
        </div>
      )}

      {/* Suppliers Table */}
      {filteredSuppliers.length === 0 ? (
        <EmptyState
          icon={Truck}
          title={suppliers.length === 0 ? 'No suppliers yet' : 'No matching suppliers found'}
          description={
            suppliers.length === 0
              ? 'Add supplier contact information and link suppliers to inventory purchases.'
              : 'Try a different search query.'
          }
          actionLabel={suppliers.length === 0 ? 'Add First Supplier' : undefined}
          onAction={
            suppliers.length === 0
              ? () => {
                  setEditingSupplier(null);
                  setIsModalOpen(true);
                }
              : undefined
          }
        />
      ) : (
        <div className="bg-white border border-[#e9e4dc] rounded-2xl overflow-hidden shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#faf8f5] border-b border-[#e9e4dc] text-[#706c64] font-medium">
                <tr>
                  <th className="py-3 px-3 text-center">
                    <input
                      type="checkbox"
                      aria-label="Select all visible suppliers"
                      checked={filteredSuppliers.filter((supplier) => supplier.id !== UNASSIGNED_SUPPLIER_ID).length > 0 && filteredSuppliers.filter((supplier) => supplier.id !== UNASSIGNED_SUPPLIER_ID).every((supplier) => selectedSupplierIds.includes(supplier.id))}
                      onChange={toggleVisibleSuppliers}
                    />
                  </th>
                  <th className="py-3 px-4">Company / Supplier Code</th>
                  <th className="py-3 px-4">Contact Person</th>
                  <th className="py-3 px-4">Contact Info</th>
                  <th className="py-3 px-4 text-right">Total Purchases</th>
                  <th className="py-3 px-4 text-right">Paid</th>
                  <th className="py-3 px-4 text-right">Unpaid</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e9e4dc]">
                {filteredSuppliers.map((s) => {
                    const isUnassigned = s.id === UNASSIGNED_SUPPLIER_ID;
                    const supplierPurchases = purchases.filter((purchase) =>
                      isUnassigned ? !purchase.supplierId : purchase.supplierId === s.id
                    );
                    const purchaseSummary = supplierPurchases
                      .reduce(
                      (summary, purchase) => {
                        const payment = getPurchasePaymentSummary(
                          purchase.totalAmount || purchase.totalCost,
                          purchase.amountPaid,
                          purchase.paymentStatus
                        );
                        return {
                          paid: summary.paid + payment.amountPaid,
                          unpaid: summary.unpaid + payment.amountDue,
                        };
                      },
                      { paid: 0, unpaid: 0 }
                    );
                    return (
                  <tr key={s.id} className="hover:bg-[#fcfaf7] transition-colors">
                    <td className="py-3 px-3 text-center">
                      <input
                        type="checkbox"
                        aria-label={`Select ${s.company}`}
                        disabled={s.id === UNASSIGNED_SUPPLIER_ID}
                        checked={selectedSupplierIds.includes(s.id)}
                        onChange={() => toggleSupplierSelection(s.id)}
                      />
                    </td>
                    <td className="py-3 px-4 font-semibold text-[#1c1b18]">
                      {s.company}
                      <span className="text-[10px] text-[#23424d] block font-mono">{s.code}</span>
                      {s.notes && (
                        <span className="text-[10px] text-[#706c64] block truncate max-w-[180px]">
                          {s.notes}
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-4 text-[#1c1b18] font-medium">{isUnassigned ? 'Default purchase group' : s.name}</td>

                    <td className="py-3 px-4 text-[#4a4741] font-mono">
                      <span>{s.phone || (isUnassigned ? 'No registered seller' : '')}</span>
                      {s.email && <span className="block text-[10px] text-[#706c64] font-sans">{s.email}</span>}
                    </td>

                    <td className="py-3 px-4 text-right font-mono font-bold text-[#1c1b18]">
                      {formatCurrency(s.totalPurchases, settings.currencySymbol)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-[#047857]">
                      {formatCurrency(purchaseSummary.paid, settings.currencySymbol)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-[#be123c]">
                      {formatCurrency(purchaseSummary.unpaid, settings.currencySymbol)}
                    </td>

                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setViewingSupplier(s)}
                          title="View supplied products and purchase history"
                          className="p-1.5 rounded-md text-[#706c64] hover:text-[#23424d] hover:bg-[#eae5dc] transition-colors cursor-pointer"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {!isUnassigned && (
                          <button
                            onClick={() => {
                              setEditingSupplier(s);
                              setIsModalOpen(true);
                            }}
                            title="Edit supplier"
                            className="p-1.5 rounded-md text-[#706c64] hover:text-[#23424d] hover:bg-[#eae5dc] transition-colors cursor-pointer"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                    );
                })}
              </tbody>
            </table>
          </div>

          <div className="px-4 py-2.5 bg-[#faf8f5] border-t border-[#e9e4dc] text-[11px] text-[#706c64] flex items-center justify-between">
            <span>Showing {Math.max(0, filteredSuppliers.length - 1)} registered suppliers plus Unassigned Supplier</span>
            <span className="font-mono font-semibold text-[#1c1b18]">
              Historical Purchase Value:{' '}
              {formatCurrency(
                filteredSuppliers.reduce((sum, supplier) => sum + (supplier.totalPurchases || 0), 0),
                settings.currencySymbol
              )}
            </span>
          </div>
        </div>
      )}

      {/* Supplier Create/Edit Modal */}
      <Modal
        isOpen={!!viewingSupplier}
        onClose={() => setViewingSupplier(null)}
        title={viewingSupplier?.company || 'Supplier History'}
        subtitle={viewingSupplier ? `${viewingSupplier.code} · ${viewingSupplier.name}` : undefined}
        maxWidth="3xl"
      >
        {viewingSupplier && (
          <div className="space-y-5 text-xs">
            <section>
              <h4 className="font-bold text-[#1c1b18] mb-2">Products Assigned to Supplier</h4>
              {viewingSupplier.id === UNASSIGNED_SUPPLIER_ID ? (
                <p className="text-[#706c64]">Products purchased without a registered seller are listed in the purchase history below.</p>
              ) : products.filter((product) => product.supplierId === viewingSupplier.id).length === 0 ? (
                <p className="text-[#706c64]">No current products are assigned to this supplier.</p>
              ) : (
                <div className="overflow-x-auto border border-[#e9e4dc] rounded-lg">
                  <table className="w-full text-left">
                    <thead className="bg-[#faf8f5] text-[#706c64]">
                      <tr>
                        <th className="p-2.5">Product</th>
                        <th className="p-2.5">SKU</th>
                        <th className="p-2.5 text-right">Stock</th>
                        <th className="p-2.5 text-right">Cost</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#e9e4dc]">
                      {products.filter((product) => product.supplierId === viewingSupplier.id).map((product) => (
                        <tr key={product.id}>
                          <td className="p-2.5 font-semibold">{product.name}</td>
                          <td className="p-2.5 font-mono">{product.sku}</td>
                          <td className="p-2.5 text-right">{product.currentStock} {product.unit}</td>
                          <td className="p-2.5 text-right">{formatCurrency(product.purchasePrice, settings.currencySymbol)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="border-t border-[#e9e4dc] pt-4">
              <h4 className="font-bold text-[#1c1b18] mb-2">Purchase History</h4>
              <p className="mb-3 text-[#706c64]">
                Purchases are created through Inventory restocking. Payment status and amounts are shown here for reference; account balances change only when an actual payment is recorded in Finance → Due Balance.
              </p>
              {purchases.filter((purchase) =>
                viewingSupplier.id === UNASSIGNED_SUPPLIER_ID
                  ? !purchase.supplierId
                  : purchase.supplierId === viewingSupplier.id
              ).length === 0 ? (
                <p className="text-[#706c64]">No purchases recorded for this supplier.</p>
              ) : (
                <div className="space-y-2">
                  {purchases.filter((purchase) =>
                    viewingSupplier.id === UNASSIGNED_SUPPLIER_ID
                      ? !purchase.supplierId
                      : purchase.supplierId === viewingSupplier.id
                  ).map((purchase) => {
                    const totalAmount = purchase.totalAmount || purchase.totalCost;
                    const payment = getPurchasePaymentSummary(totalAmount, purchase.amountPaid, purchase.paymentStatus);
                    const isPaid = payment.paymentStatus === 'paid';
                    const paymentLabel = isPaid ? 'Paid' : payment.paymentStatus === 'partial' ? 'Partially paid' : 'Unpaid';
                    return (
                    <div key={purchase.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#f0ede6] pb-2">
                      <div className="min-w-0">
                        <p className="font-semibold">{formatDate(purchase.date)} · Record {purchase.id}</p>
                        <p className="text-[#706c64]">
                          {purchase.items.map((item) =>
                            `${item.productName}: ${item.quantity} × ${formatCurrency(item.purchasePrice, settings.currencySymbol)} = ${formatCurrency(item.quantity * item.purchasePrice, settings.currencySymbol)}`
                          ).join(' · ')}
                          {` · Freight ${formatCurrency(purchase.shippingCost || 0, settings.currencySymbol)}`}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 shrink-0">
                        <span className="font-mono font-bold">{formatCurrency(totalAmount, settings.currencySymbol)}</span>
                        <span className={`inline-flex items-center gap-1 font-semibold ${isPaid ? 'text-[#047857]' : payment.paymentStatus === 'partial' ? 'text-[#b45309]' : 'text-[#be123c]'}`}>
                          {isPaid ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Clock3 className="w-3.5 h-3.5" />}
                          {paymentLabel}
                        </span>
                        <span className="text-[#047857]">Paid {formatCurrency(payment.amountPaid, settings.currencySymbol)}</span>
                        <span className="text-[#be123c]">Due {formatCurrency(payment.amountDue, settings.currencySymbol)}</span>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingPurchase(purchase);
                            setViewingSupplier(null);
                          }}
                          title="Edit this inventory purchase record"
                          className="flex items-center gap-1 rounded-lg border border-[#d8d3c9] px-2 py-1 text-[11px] font-semibold text-[#23424d] hover:bg-[#f7f4ee]"
                        >
                          <Edit2 className="h-3.5 w-3.5" /> Edit
                        </button>
                        {purchase.supplierId && (
                          <button
                            type="button"
                            onClick={() => {
                              setShippingSupplier(viewingSupplier);
                              setPurchaseForShipping(purchase);
                              setViewingSupplier(null);
                            }}
                            title="Add a late freight bill linked to this purchase"
                            className="flex items-center gap-1 px-2 py-1.5 text-[11px] font-semibold text-[#23424d] border border-[#d8d3c9] hover:bg-[#f7f4ee] rounded-lg cursor-pointer"
                          >
                            <Plus className="w-3 h-3" /> Freight
                          </button>
                        )}
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}
            </section>

            {viewingSupplier.id !== UNASSIGNED_SUPPLIER_ID && (
              <div className="flex justify-end border-t border-[#e9e4dc] pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setDeletingSupplier(viewingSupplier);
                    setViewingSupplier(null);
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#be123c] border border-[#fecdd3] hover:bg-[#fff1f2] rounded-lg cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete supplier
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>

      <SupplierModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        supplier={editingSupplier}
        onSaved={refreshAll}
      />

      <LinkedShippingExpenseModal
        isOpen={!!purchaseForShipping}
        onClose={() => {
          setPurchaseForShipping(null);
          setShippingSupplier(null);
        }}
        purchase={purchaseForShipping}
        supplier={shippingSupplier}
        currencySymbol={settings.currencySymbol}
        onSaved={refreshAll}
      />

      <EditPurchaseModal
        purchase={editingPurchase}
        products={products}
        suppliers={suppliers}
        currencySymbol={settings.currencySymbol}
        onClose={() => setEditingPurchase(null)}
        onSaved={refreshAll}
      />

      <ConfirmDialog
        isOpen={!!deletingSupplier}
        onClose={() => setDeletingSupplier(null)}
        onConfirm={handleDeleteSupplier}
        loading={deleteLoading}
        title="Delete Supplier"
        message={`Remove ${deletingSupplier?.company}? Products will be unassigned from this supplier. Existing purchase history and financial records will remain.`}
        confirmLabel="Delete Supplier"
        isDestructive
      />

      <ConfirmDialog
        isOpen={confirmBulkDelete}
        onClose={() => setConfirmBulkDelete(false)}
        onConfirm={handleDeleteSelectedSuppliers}
        loading={deleteLoading}
        title="Delete Selected Suppliers"
        message={`Delete ${selectedSupplierIds.length} selected suppliers? Their current products will be unassigned. Historical purchases and financial records will remain.`}
        confirmLabel="Delete Suppliers"
        isDestructive
      />
    </div>
  );
};
