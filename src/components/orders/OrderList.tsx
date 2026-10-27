import React, { useState, useMemo } from 'react';
import { Order, OrderStatus } from '../../types';
import { useBusiness } from '../../context/BusinessContext';
import { formatCurrency, formatDate } from '../../lib/utils';
import { ShoppingCart, Plus, Search } from 'lucide-react';
import { EmptyState } from '../common/EmptyState';
import { CreateOrderModal } from './CreateOrderModal';
import { OrderDetailModal } from './OrderDetailModal';

const statusBadgeStyles: Record<OrderStatus, { bg: string; text: string; border: string }> = {
  pending: { bg: 'bg-[#fffbeb]', text: 'text-[#b45309]', border: 'border-[#fef3c7]' },
  confirmed: { bg: 'bg-[#f0f9ff]', text: 'text-[#0369a1]', border: 'border-[#e0f2fe]' },
  processing: { bg: 'bg-[#eff6ff]', text: 'text-[#1d4ed8]', border: 'border-[#dbeafe]' },
  shipped: { bg: 'bg-[#f5f3ff]', text: 'text-[#6d28d9]', border: 'border-[#ede9fe]' },
  delivered: { bg: 'bg-[#ecfdf5]', text: 'text-[#047857]', border: 'border-[#a7f3d0]' },
  returned: { bg: 'bg-[#fdf2f8]', text: 'text-[#be185d]', border: 'border-[#fce7f3]' },
  cancelled: { bg: 'bg-[#fff1f2]', text: 'text-[#be123c]', border: 'border-[#fecdd3]' },
};

type OrderDateRange = 'all' | 'thisMonth' | 'thisYear' | 'custom';
const ORDERS_PER_PAGE = 20;

interface OrderListProps {
  initialSelectedOrderId?: string | null;
}

export const OrderList: React.FC<OrderListProps> = ({ initialSelectedOrderId }) => {
  const { orders, products, customers, accounts, settings, refreshAll } = useBusiness();

  const [search, setSearch] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [dateRange, setDateRange] = useState<OrderDateRange>('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [showInvoiceOnOpen, setShowInvoiceOnOpen] = useState(false);

  React.useEffect(() => {
    if (initialSelectedOrderId) {
      const match = orders.find((o) => o.id === initialSelectedOrderId);
      if (match) setSelectedOrder(match);
    }
  }, [initialSelectedOrderId, orders]);

  const counts = useMemo(() => {
    const res: Record<string, number> = { all: orders.length };
    orders.forEach((o) => {
      res[o.orderStatus] = (res[o.orderStatus] || 0) + 1;
    });
    return res;
  }, [orders]);

  const filteredOrders = useMemo(() => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
    const startOfYear = new Date(now.getFullYear(), 0, 1).getTime();
    const startOfNextYear = new Date(now.getFullYear() + 1, 0, 1).getTime();
    const customStart = customStartDate ? new Date(`${customStartDate}T00:00:00`).getTime() : null;
    const customEnd = customEndDate ? new Date(`${customEndDate}T00:00:00`).getTime() + 86400000 : null;

    return orders.filter((o) => {
      if (selectedStatus !== 'all' && o.orderStatus !== selectedStatus) return false;
      const orderTimestamp = new Date(o.orderDate).getTime();
      if (dateRange === 'thisMonth' && !(orderTimestamp >= startOfMonth && orderTimestamp < startOfNextMonth)) return false;
      if (dateRange === 'thisYear' && !(orderTimestamp >= startOfYear && orderTimestamp < startOfNextYear)) return false;
      if (dateRange === 'custom') {
        if (customStart !== null && orderTimestamp < customStart) return false;
        if (customEnd !== null && orderTimestamp >= customEnd) return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchNum = o.orderNumber.toLowerCase().includes(q) || (o.invoiceNumber || '').toLowerCase().includes(q);
        const matchCust = o.customerName.toLowerCase().includes(q);
        const matchPhone = o.customerPhone.includes(q);
        if (!matchNum && !matchCust && !matchPhone) return false;
      }
      return true;
    });
  }, [orders, selectedStatus, search, dateRange, customStartDate, customEndDate]);

  React.useEffect(() => {
    setCurrentPage(1);
  }, [search, selectedStatus, dateRange, customStartDate, customEndDate]);

  const pageCount = Math.max(1, Math.ceil(filteredOrders.length / ORDERS_PER_PAGE));
  const paginatedOrders = useMemo(
    () => filteredOrders.slice((currentPage - 1) * ORDERS_PER_PAGE, currentPage * ORDERS_PER_PAGE),
    [filteredOrders, currentPage]
  );

  const tabs: { id: string; label: string }[] = [
    { id: 'all', label: 'All Orders' },
    { id: 'pending', label: 'Pending' },
    { id: 'confirmed', label: 'Confirmed' },
    { id: 'processing', label: 'Processing' },
    { id: 'shipped', label: 'Shipped' },
    { id: 'delivered', label: 'Delivered' },
    { id: 'returned', label: 'Returned' },
    { id: 'cancelled', label: 'Cancelled' },
  ];

  return (
    <div className="space-y-4">
      {/* Header and Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[#1c1b18] tracking-tight">Order Management</h2>
          <p className="text-xs text-[#706c64] mt-0.5">
            Process orders, manage fulfillment pipelines, and track returns
          </p>
        </div>
        <button
          onClick={() => setIsCreateOpen(true)}
          className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#23424d] hover:bg-[#1a323b] rounded-lg shadow-xs transition-colors cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>New Customer Order</span>
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1 text-xs">
        {tabs.map((tab) => {
          const count = counts[tab.id] || 0;
          const isActive = selectedStatus === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setSelectedStatus(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                isActive
                  ? 'bg-white text-[#1c1b18] shadow-2xs border border-[#e9e4dc]'
                  : 'text-[#706c64] hover:text-[#1c1b18] hover:bg-[#f2ece0]'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`text-[10px] font-mono px-1.5 py-0.2 rounded-md ${
                  isActive ? 'bg-[#f4efe6] text-[#1c1b18]' : 'bg-[#eae4d9] text-[#706c64]'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search Input */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3 bg-white border border-[#e9e4dc] rounded-2xl shadow-2xs">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8a857b]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search orders by Order #, Customer Name, or Phone Number..."
            className="w-full pl-9 pr-3 py-2 bg-white border border-[#d8d3c9] rounded-lg text-xs text-[#1c1b18] placeholder-[#8a857b] focus:outline-none focus:border-[#23424d]"
          />
        </div>
        <select
          value={dateRange}
          onChange={(event) => setDateRange(event.target.value as OrderDateRange)}
          className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg text-xs text-[#1c1b18] focus:outline-none focus:border-[#23424d]"
          aria-label="Filter orders by date"
        >
          <option value="all">All dates</option>
          <option value="thisMonth">This month</option>
          <option value="thisYear">This year</option>
          <option value="custom">Custom date range</option>
        </select>
        {dateRange === 'custom' && (
          <>
            <label className="flex items-center gap-2 text-[11px] text-[#706c64]">
              From
              <input
                type="date"
                value={customStartDate}
                max={customEndDate || undefined}
                onChange={(event) => setCustomStartDate(event.target.value)}
                className="min-w-0 flex-1 px-2.5 py-2 bg-white border border-[#d8d3c9] rounded-lg text-xs text-[#1c1b18]"
              />
            </label>
            <label className="flex items-center gap-2 text-[11px] text-[#706c64]">
              To
              <input
                type="date"
                value={customEndDate}
                min={customStartDate || undefined}
                onChange={(event) => setCustomEndDate(event.target.value)}
                className="min-w-0 flex-1 px-2.5 py-2 bg-white border border-[#d8d3c9] rounded-lg text-xs text-[#1c1b18]"
              />
            </label>
          </>
        )}
      </div>

      {/* Orders Table */}
      {filteredOrders.length === 0 ? (
        <EmptyState
          icon={ShoppingCart}
          title={orders.length === 0 ? 'No orders yet' : 'No matching orders found'}
          description={
            orders.length === 0
              ? 'Create your first customer order to track fulfillment and automatically deduct inventory.'
              : 'Try clearing your search query or switching status filters.'
          }
          actionLabel={orders.length === 0 ? 'Create Order' : undefined}
          onAction={orders.length === 0 ? () => setIsCreateOpen(true) : undefined}
        />
      ) : (
        <div className="bg-white border border-[#e9e4dc] rounded-2xl overflow-hidden shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#f8f5ee] border-b border-[#e9e4dc] text-[#706c64] font-semibold">
                <tr>
                  <th className="py-3 px-4">Order #</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Items Summary</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                  <th className="py-3 px-4">Payment</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Date</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0ede6]">
                {paginatedOrders.map((order) => {
                  const badge =
                    statusBadgeStyles[order.orderStatus] || statusBadgeStyles.pending;
                  const totalUnits = order.items.reduce((s, it) => s + it.quantity, 0);

                  return (
                    <tr
                      key={order.id}
                      onClick={() => setSelectedOrder(order)}
                      className="hover:bg-[#faf7f2] transition-colors cursor-pointer"
                    >
                      <td className="py-3 px-4 font-mono font-bold text-[#1c1b18]">
                        #{order.orderNumber}
                      </td>

                      <td className="py-3 px-4">
                        <span className="font-bold text-[#1c1b18] block">
                          {order.customerName}
                        </span>
                        <span className="font-mono text-[11px] text-[#706c64]">
                          {order.customerPhone}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-[#4a4741]">
                        <span>
                          {order.items[0]?.productName}
                          {order.items.length > 1
                            ? ` +${order.items.length - 1} more`
                            : ''}
                        </span>
                        <span className="text-[10px] text-[#8a857b] block">
                          {totalUnits} item{totalUnits > 1 ? 's' : ''}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-right font-mono font-bold text-[#1c1b18]">
                        {formatCurrency(order.totalAmount, settings.currencySymbol)}
                      </td>

                      <td className="py-3 px-4 text-[#706c64]">
                        <span>{order.paymentMethod}</span>
                        <span className="text-[10px] text-[#8a857b] block capitalize">
                          {order.paymentStatus}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-block px-2.5 py-0.5 text-[10px] font-bold rounded-full border capitalize ${badge.bg} ${badge.text} ${badge.border}`}
                        >
                          {order.orderStatus}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-right text-[#706c64] text-[11px]">
                        {formatDate(order.orderDate)}
                      </td>

                      <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => setSelectedOrder(order)}
                          className="px-3 py-1 text-[11px] font-semibold text-[#1c1b18] hover:bg-[#f7f4ee] bg-white border border-[#d8d3c9] rounded-lg transition-colors cursor-pointer"
                        >
                          Details
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="px-4 py-2.5 bg-[#f8f5ee] border-t border-[#e9e4dc] text-[11px] text-[#706c64] flex items-center justify-between">
            <span>
              Showing {filteredOrders.length === 0 ? 0 : (currentPage - 1) * ORDERS_PER_PAGE + 1}–{Math.min(currentPage * ORDERS_PER_PAGE, filteredOrders.length)} of {filteredOrders.length} matching orders
            </span>
            <span className="font-mono font-bold text-[#1c1b18]">
              Customer total (includes delivery):{' '}
              {formatCurrency(
                filteredOrders.reduce((s, o) => s + o.totalAmount, 0),
                settings.currencySymbol
              )}
            </span>
          </div>
          {pageCount > 1 && (
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-[#e9e4dc] bg-white">
              <button
                type="button"
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                disabled={currentPage === 1}
                className="rounded-lg border border-[#d8d3c9] px-3 py-1.5 text-xs font-semibold text-[#4a4741] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-xs text-[#706c64]">Page {currentPage} of {pageCount}</span>
              <button
                type="button"
                onClick={() => setCurrentPage((page) => Math.min(pageCount, page + 1))}
                disabled={currentPage === pageCount}
                className="rounded-lg border border-[#23424d] bg-[#23424d] px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}

      {/* Create Order Modal */}
      <CreateOrderModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        products={products}
        customers={customers}
        accounts={accounts}
        currencySymbol={settings.currencySymbol}
        defaultDeliveryCharge={settings.defaultDeliveryCharge}
        onOrderCreated={(order) => {
          setSelectedOrder(order);
          setShowInvoiceOnOpen(true);
          void refreshAll();
        }}
      />

      {/* Order Detail Modal */}
      {selectedOrder && (
        <OrderDetailModal
          isOpen={!!selectedOrder}
          onClose={() => {
            setSelectedOrder(null);
            setShowInvoiceOnOpen(false);
          }}
          order={selectedOrder}
          accounts={accounts}
          currencySymbol={settings.currencySymbol}
          settings={settings}
          initiallyShowInvoice={showInvoiceOnOpen}
          onOrderUpdated={refreshAll}
        />
      )}
    </div>
  );
};
