import React from 'react';
import { Modal } from '../common/Modal';
import { Customer, Order } from '../../types';
import { formatCurrency, formatDate } from '../../lib/utils';
import { User, Phone, MapPin, Mail, ShoppingCart } from 'lucide-react';

interface CustomerDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: Customer | null;
  orders: Order[];
  currencySymbol: string;
  onSelectOrder: (orderId: string) => void;
  onEditCustomer: (customer: Customer) => void;
}

export const CustomerDetailModal: React.FC<CustomerDetailModalProps> = ({
  isOpen,
  onClose,
  customer,
  orders,
  currencySymbol,
  onSelectOrder,
  onEditCustomer,
}) => {
  if (!customer) return null;

  const customerOrders = orders.filter((o) => o.customerId === customer.id || o.customerPhone === customer.phone);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={customer.name}
      subtitle={`Customer Phone: ${customer.phone}`}
      maxWidth="3xl"
    >
      <div className="space-y-5 text-xs">
        {/* Top Info Banner */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-2xl bg-[#faf8f5] border border-[#e9e4dc]">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-[#23424d] flex items-center justify-center text-base font-bold text-white shadow-xs">
              {customer.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h4 className="text-sm font-bold text-[#1c1b18]">{customer.name}</h4>
              <p className="flex items-center gap-1.5 text-[#4a4741] mt-0.5 font-mono">
                <Phone className="w-3.5 h-3.5 text-[#706c64]" /> {customer.phone}
              </p>
              {customer.email && (
                <p className="flex items-center gap-1.5 text-[#706c64] text-[11px] mt-0.5">
                  <Mail className="w-3.5 h-3.5 text-[#706c64]" /> {customer.email}
                </p>
              )}
            </div>
          </div>

          <button
            onClick={() => onEditCustomer(customer)}
            className="px-3.5 py-1.5 text-xs font-semibold text-[#1c1b18] bg-white border border-[#d8d3c9] hover:bg-[#f7f4ee] rounded-lg transition-colors cursor-pointer"
          >
            Edit Profile
          </button>
        </div>

        {/* Address and Notes */}
        {(customer.address || customer.notes) && (
          <div className="p-3.5 rounded-xl bg-white border border-[#e9e4dc] space-y-1.5">
            {customer.address && (
              <p className="text-[#1c1b18] flex items-start gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-[#706c64] shrink-0 mt-0.5" />
                <span>
                  {customer.address}
                  {customer.city ? `, ${customer.city}` : ''}
                </span>
              </p>
            )}
            {customer.notes && (
              <p className="text-[#706c64] text-[11px]">
                <strong className="text-[#1c1b18]">Notes:</strong> {customer.notes}
              </p>
            )}
          </div>
        )}

        {/* Lifetime Statistics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-xl bg-white border border-[#e9e4dc] shadow-2xs">
            <span className="text-[#706c64] text-[11px]">Lifetime Value (LTV)</span>
            <p className="text-base font-bold font-mono text-[#047857] mt-0.5">
              {formatCurrency(customer.ltv || customer.totalSpent, currencySymbol)}
            </p>
            <span className="text-[10px] text-[#8a857b]">Delivered revenue</span>
          </div>

          <div className="p-3.5 rounded-xl bg-white border border-[#e9e4dc] shadow-2xs">
            <span className="text-[#706c64] text-[11px]">Total Placed Orders</span>
            <p className="text-base font-bold font-mono text-[#1c1b18] mt-0.5">
              {customer.totalOrders}
            </p>
            <span className="text-[10px] text-[#8a857b]">
              {customer.deliveredOrders} delivered
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-white border border-[#e9e4dc] shadow-2xs">
            <span className="text-[#706c64] text-[11px]">Pending Fulfillment</span>
            <p className="text-base font-bold font-mono text-[#b45309] mt-0.5">
              {customer.pendingOrders}
            </p>
            <span className="text-[10px] text-[#8a857b]">Active pipeline</span>
          </div>

          <div className="p-3.5 rounded-xl bg-white border border-[#e9e4dc] shadow-2xs">
            <span className="text-[#706c64] text-[11px]">Returns / Cancelled</span>
            <p className="text-base font-bold font-mono text-[#be123c] mt-0.5">
              {customer.returnedOrders} / {customer.cancelledOrders}
            </p>
            <span className="text-[10px] text-[#8a857b]">Return rate history</span>
          </div>
        </div>

        {/* Order History */}
        <div className="p-4 rounded-2xl bg-white border border-[#e9e4dc] shadow-2xs">
          <h5 className="font-bold text-[#1c1b18] mb-3 flex items-center gap-1.5">
            <ShoppingCart className="w-3.5 h-3.5 text-[#23424d]" /> Complete Order History
          </h5>

          {customerOrders.length === 0 ? (
            <p className="text-[#706c64] text-xs py-4 text-center">No orders recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#faf8f5] text-[#706c64] font-medium border-b border-[#e9e4dc]">
                  <tr>
                    <th className="py-2.5 px-3">Order #</th>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Items</th>
                    <th className="py-2.5 px-3 text-right">Amount</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                    <th className="py-2.5 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e9e4dc]">
                  {customerOrders.map((o) => (
                    <tr key={o.id} className="hover:bg-[#fcfaf7]">
                      <td className="py-2 px-3 font-mono font-medium text-[#1c1b18]">
                        #{o.orderNumber}
                      </td>
                      <td className="py-2 px-3 text-[#706c64]">{formatDate(o.orderDate)}</td>
                      <td className="py-2 px-3 text-[#706c64] truncate max-w-[150px]">
                        {o.items.map((i) => `${i.productName} (${i.quantity})`).join(', ')}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-[#1c1b18]">
                        {formatCurrency(o.totalAmount, currencySymbol)}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-[#f6f3eb] text-[#1c1b18] border border-[#e5dfd2]">
                          {o.orderStatus}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right">
                        <button
                          onClick={() => {
                            onClose();
                            onSelectOrder(o.id);
                          }}
                          className="text-[11px] font-semibold text-[#23424d] hover:underline cursor-pointer"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};
