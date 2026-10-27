import React, { useState, useMemo } from 'react';
import { Customer } from '../../types';
import { useBusiness } from '../../context/BusinessContext';
import { formatCurrency, formatDate } from '../../lib/utils';
import { Users, Plus, Search, Eye, Edit2, Trash2 } from 'lucide-react';
import { EmptyState } from '../common/EmptyState';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { CustomerModal } from './CustomerModal';
import { CustomerDetailModal } from './CustomerDetailModal';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { customersService } from '../../services/customers.service';

interface CustomerListProps {
  onSelectOrder: (orderId: string) => void;
}

export const CustomerList: React.FC<CustomerListProps> = ({ onSelectOrder }) => {
  const { customers, orders, settings, refreshAll } = useBusiness();
  const { effectiveUid } = useAuth();
  const { success, error } = useToast();

  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [viewingCustomer, setViewingCustomer] = useState<Customer | null>(null);
  const [deletingCustomer, setDeletingCustomer] = useState<Customer | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const handleDeleteCustomer = async () => {
    if (!effectiveUid || !deletingCustomer) return;
    try {
      setDeleteLoading(true);
      await customersService.deleteCustomer(effectiveUid, deletingCustomer.id);
      success('Customer removed. Existing order history was preserved.');
      setDeletingCustomer(null);
      await refreshAll();
    } catch (err: any) {
      error(err.message || 'Failed to delete customer');
    } finally {
      setDeleteLoading(false);
    }
  };

  const filteredCustomers = useMemo(() => {
    return customers.filter((c) => {
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchName = c.name.toLowerCase().includes(q);
        const matchPhone = c.phone.includes(q);
        const matchEmail = c.email?.toLowerCase().includes(q) || false;
        const matchCity = c.city?.toLowerCase().includes(q) || false;
        if (!matchName && !matchPhone && !matchEmail && !matchCity) return false;
      }
      return true;
    });
  }, [customers, search]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[#1c1b18] tracking-tight">Customer Directory</h2>
          <p className="text-xs text-[#706c64] mt-0.5">
            Profiles automatically indexed by phone number with lifetime order count and spending history
          </p>
        </div>
        <button
          onClick={() => {
            setEditingCustomer(null);
            setIsModalOpen(true);
          }}
          className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#23424d] hover:bg-[#1a323b] rounded-lg shadow-xs transition-colors cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Add Customer</span>
        </button>
      </div>

      {/* Search Bar */}
      <div className="p-3 bg-white border border-[#e9e4dc] rounded-2xl shadow-2xs">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8a857b]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customers by name, phone number, email, or city..."
            className="w-full pl-9 pr-3 py-2 bg-white border border-[#d8d3c9] rounded-lg text-xs text-[#1c1b18] placeholder-[#8a857b] focus:outline-none focus:border-[#23424d]"
          />
        </div>
      </div>

      {/* Customers Table */}
      {filteredCustomers.length === 0 ? (
        <EmptyState
          icon={Users}
          title={customers.length === 0 ? 'No customers yet' : 'No matching customers found'}
          description={
            customers.length === 0
              ? 'Customers are created automatically when orders are placed or manually added here.'
              : 'Try searching with a different name or phone number.'
          }
          actionLabel={customers.length === 0 ? 'Add Customer' : undefined}
          onAction={
            customers.length === 0
              ? () => {
                  setEditingCustomer(null);
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
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Phone Number</th>
                  <th className="py-3 px-4">Location</th>
                  <th className="py-3 px-4 text-center">Orders</th>
                  <th className="py-3 px-4 text-right">Lifetime Spend</th>
                  <th className="py-3 px-4 text-right">Last Order</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e9e4dc]">
                {filteredCustomers.map((cust) => (
                  <tr
                    key={cust.id}
                    onClick={() => setViewingCustomer(cust)}
                    className="hover:bg-[#fcfaf7] transition-colors cursor-pointer"
                  >
                    <td className="py-3 px-4 font-semibold text-[#1c1b18]">
                      {cust.name}
                      {cust.email && (
                        <span className="text-[11px] text-[#706c64] block font-normal">
                          {cust.email}
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-4 font-mono text-[#4a4741]">
                      {cust.phone}
                    </td>

                    <td className="py-3 px-4 text-[#706c64]">
                      {cust.city || cust.address ? (
                        <span>{cust.city || cust.address}</span>
                      ) : (
                        <span className="text-[#8a857b]">—</span>
                      )}
                    </td>

                    <td className="py-3 px-4 text-center">
                      <span className="font-mono font-bold text-[#1c1b18]">
                        {cust.totalOrders}
                      </span>
                      <span className="text-[10px] text-[#706c64] block">
                        {cust.deliveredOrders} delivered
                      </span>
                    </td>

                    <td className="py-3 px-4 text-right font-mono font-bold text-[#047857]">
                      {formatCurrency(cust.ltv || cust.totalSpent, settings.currencySymbol)}
                    </td>

                    <td className="py-3 px-4 text-right text-[#706c64] text-[11px]">
                      {formatDate(cust.lastOrderDate)}
                    </td>

                    <td
                      className="py-3 px-4 text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setViewingCustomer(cust)}
                          title="View customer profile"
                          className="p-1.5 rounded-md text-[#706c64] hover:text-[#1c1b18] hover:bg-[#eae5dc] transition-colors cursor-pointer"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            setEditingCustomer(cust);
                            setIsModalOpen(true);
                          }}
                          title="Edit profile"
                          className="p-1.5 rounded-md text-[#706c64] hover:text-[#23424d] hover:bg-[#eae5dc] transition-colors cursor-pointer"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeletingCustomer(cust)}
                          title="Delete customer; keep order snapshots"
                          className="p-1.5 rounded-md text-[#be123c] hover:bg-[#fff1f2] transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="px-4 py-2.5 bg-[#faf8f5] border-t border-[#e9e4dc] text-[11px] text-[#706c64] flex items-center justify-between">
            <span>Showing {filteredCustomers.length} customers</span>
            <span className="font-mono font-semibold text-[#1c1b18]">
              Total LTV:{' '}
              {formatCurrency(
                filteredCustomers.reduce((s, c) => s + (c.ltv || c.totalSpent || 0), 0),
                settings.currencySymbol
              )}
            </span>
          </div>
        </div>
      )}

      {/* Customer Create/Edit Modal */}
      <CustomerModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        customer={editingCustomer}
        onSaved={refreshAll}
      />

      {/* Customer Detail Drawer Modal */}
      {viewingCustomer && (
        <CustomerDetailModal
          isOpen={!!viewingCustomer}
          onClose={() => setViewingCustomer(null)}
          customer={viewingCustomer}
          orders={orders}
          currencySymbol={settings.currencySymbol}
          onSelectOrder={onSelectOrder}
          onEditCustomer={(c) => {
            setViewingCustomer(null);
            setEditingCustomer(c);
            setIsModalOpen(true);
          }}
        />
      )}

      <ConfirmDialog
        isOpen={!!deletingCustomer}
        onClose={() => setDeletingCustomer(null)}
        onConfirm={handleDeleteCustomer}
        loading={deleteLoading}
        title="Delete Customer"
        message={`Remove ${deletingCustomer?.name} from the customer directory? Existing orders and their customer details will remain in history.`}
        confirmLabel="Delete Customer"
        isDestructive
      />
    </div>
  );
};
