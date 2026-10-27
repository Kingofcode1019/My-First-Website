import React from 'react';
import { useBusiness } from '../../context/BusinessContext';
import { formatCurrency, formatDate } from '../../lib/utils';
import { ShoppingCart } from 'lucide-react';
import { ActiveTab } from '../layout/Sidebar';
import { OrderStatus } from '../../types';

interface RecentOrdersProps {
  setActiveTab: (tab: ActiveTab) => void;
  onSelectOrder: (orderId: string) => void;
}

const statusBadgeStyles: Record<OrderStatus, { bg: string; text: string; border: string }> = {
  pending: { bg: 'bg-[#fffbeb]', text: 'text-[#b45309]', border: 'border-[#fef3c7]' },
  confirmed: { bg: 'bg-[#f0f9ff]', text: 'text-[#0369a1]', border: 'border-[#e0f2fe]' },
  processing: { bg: 'bg-[#eff6ff]', text: 'text-[#1d4ed8]', border: 'border-[#dbeafe]' },
  shipped: { bg: 'bg-[#f5f3ff]', text: 'text-[#6d28d9]', border: 'border-[#ede9fe]' },
  delivered: { bg: 'bg-[#ecfdf5]', text: 'text-[#047857]', border: 'border-[#a7f3d0]' },
  returned: { bg: 'bg-[#fdf2f8]', text: 'text-[#be185d]', border: 'border-[#fce7f3]' },
  cancelled: { bg: 'bg-[#fff1f2]', text: 'text-[#be123c]', border: 'border-[#fecdd3]' },
};

export const RecentOrders: React.FC<RecentOrdersProps> = ({ setActiveTab, onSelectOrder }) => {
  const { orders, settings } = useBusiness();
  const recent = orders.slice(0, 5);

  return (
    <div className="p-5 bg-white border border-[#e9e4dc] rounded-2xl shadow-2xs flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-bold text-[#1c1b18]">Recent Orders</h3>
          <p className="text-xs text-[#706c64] mt-0.5">Latest customer transactions</p>
        </div>
        <button
          onClick={() => setActiveTab('orders')}
          className="text-xs font-semibold text-[#23424d] hover:text-[#c85a32] transition-colors cursor-pointer"
        >
          View all
        </button>
      </div>

      {recent.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-6 text-[#8a857b] text-xs">
          <ShoppingCart className="w-8 h-8 mb-2 opacity-50" />
          No orders created yet.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#e9e4dc] text-[#706c64] font-semibold pb-2">
                <th className="pb-2">Order</th>
                <th className="pb-2">Customer</th>
                <th className="pb-2 text-right">Amount</th>
                <th className="pb-2 text-center">Status</th>
                <th className="pb-2 text-right">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0ede6]">
              {recent.map((order) => {
                const badge = statusBadgeStyles[order.orderStatus] || statusBadgeStyles.pending;
                return (
                  <tr
                    key={order.id}
                    onClick={() => {
                      onSelectOrder(order.id);
                      setActiveTab('orders');
                    }}
                    className="hover:bg-[#faf7f2] cursor-pointer transition-colors"
                  >
                    <td className="py-2.5 font-mono font-bold text-[#1c1b18]">
                      #{order.orderNumber}
                    </td>
                    <td className="py-2.5">
                      <p className="font-semibold text-[#1c1b18] truncate max-w-[130px]">
                        {order.customerName}
                      </p>
                      <p className="text-[11px] text-[#706c64]">{order.customerPhone}</p>
                    </td>
                    <td className="py-2.5 text-right font-mono font-bold text-[#1c1b18]">
                      {formatCurrency(order.totalAmount, settings.currencySymbol)}
                    </td>
                    <td className="py-2.5 text-center">
                      <span
                        className={`inline-block px-2.5 py-0.5 text-[10px] font-bold rounded-full border capitalize ${badge.bg} ${badge.text} ${badge.border}`}
                      >
                        {order.orderStatus}
                      </span>
                    </td>
                    <td className="py-2.5 text-right text-[#706c64] text-[11px]">
                      {formatDate(order.orderDate)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
