import React, { useEffect, useState } from 'react';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { Account, BusinessSettings, Order, OrderStatus, ReturnCondition } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { ordersService } from '../../services/orders.service';
import { formatCurrency, formatDate, formatDateTime } from '../../lib/utils';
import { Modal } from '../common/Modal';
import {
  CheckCircle2,
  Clock,
  Truck,
  RotateCcw,
  XCircle,
  AlertTriangle,
  User,
  MapPin,
  Phone,
  Package,
  FileText,
} from 'lucide-react';
import { InvoiceModal } from './InvoiceModal';
import { getInvoiceNumber } from '../../lib/invoice';

interface OrderDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: Order | null;
  accounts: Account[];
  currencySymbol: string;
  settings: BusinessSettings;
  initiallyShowInvoice?: boolean;
  onOrderUpdated: () => void;
}

export const OrderDetailModal: React.FC<OrderDetailModalProps> = ({
  isOpen,
  onClose,
  order,
  accounts,
  currencySymbol,
  settings,
  initiallyShowInvoice = false,
  onOrderUpdated,
}) => {
  const { effectiveUid } = useAuth();
  const { success, error } = useToast();
  const [loading, setLoading] = useState(false);

  // Return modal state
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnCondition, setReturnCondition] = useState<ReturnCondition>('sellable');
  const [returnBusinessCourierFee, setReturnBusinessCourierFee] = useState('0');
  const [returnAccountId, setReturnAccountId] = useState(accounts[0]?.id || '');

  // Deliver modal state
  const [showDeliverModal, setShowDeliverModal] = useState(false);

  // Cancel modal state
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelBusinessCourierFee, setCancelBusinessCourierFee] = useState('0');
  const [cancelAccountId, setCancelAccountId] = useState(accounts[0]?.id || '');
  const [cancelReason, setCancelReason] = useState('');
  const [showDeleteOrderModal, setShowDeleteOrderModal] = useState(false);
  const [showInvoice, setShowInvoice] = useState(initiallyShowInvoice);

  useEffect(() => {
    if (!returnAccountId && accounts[0]) setReturnAccountId(accounts[0].id);
    if (!cancelAccountId && accounts[0]) setCancelAccountId(accounts[0].id);
  }, [accounts, cancelAccountId, returnAccountId]);

  if (!order) return null;

  const handleUpdateStatus = async (
    newStatus: OrderStatus,
    options?: {
      returnCondition?: ReturnCondition;
      businessCourierFee?: number;
      businessCourierAccountId?: string;
    }
  ) => {
    if (!effectiveUid) return;
    try {
      setLoading(true);
      if (newStatus === 'returned') {
        await ordersService.processReturn(
          effectiveUid,
          order.id,
          options?.returnCondition || returnCondition,
          true,
          undefined,
          options?.businessCourierFee,
          options?.businessCourierAccountId
        );
      } else {
        await ordersService.updateOrderStatus(effectiveUid, order.id, newStatus);
      }
      success(`Order #${order.orderNumber} updated to ${newStatus}`);
      onOrderUpdated();
      setShowDeliverModal(false);
      setShowReturnModal(false);
      setShowCancelModal(false);
      onClose();
    } catch (err: any) {
      error(err.message || 'Failed to update order status');
    } finally {
      setLoading(false);
    }
  };

  const steps: { status: OrderStatus; label: string }[] = [
    { status: 'pending', label: 'Pending' },
    { status: 'confirmed', label: 'Confirmed' },
    { status: 'processing', label: 'Processing' },
    { status: 'shipped', label: 'Shipped' },
    { status: 'delivered', label: 'Delivered' },
  ];

  const currentStepIdx = steps.findIndex((s) => s.status === order.orderStatus);

  const handleCancelOrder = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!effectiveUid) return;
    const amount = ['shipped', 'delivered'].includes(order.orderStatus)
      ? Number(cancelBusinessCourierFee)
      : 0;
    if (!Number.isFinite(amount) || amount < 0) {
      error('Enter a valid non-negative courier fee paid by the business');
      return;
    }
    if (amount > 0 && !cancelAccountId) {
      error('Select the account used to pay the courier');
      return;
    }

    try {
      setLoading(true);
      await ordersService.cancelOrder(
        effectiveUid,
        order.id,
        cancelReason.trim(),
        amount,
        amount > 0 ? cancelAccountId : undefined
      );
      success(`Order #${order.orderNumber} cancelled`);
      onOrderUpdated();
      setShowCancelModal(false);
      onClose();
    } catch (err: any) {
      error(err.message || 'Failed to cancel order');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteOrder = async () => {
    if (!effectiveUid) return;
    try {
      setLoading(true);
      await ordersService.deleteOrder(effectiveUid, order.id);
      success(`Order #${order.orderNumber} deleted`);
      setShowDeleteOrderModal(false);
      onOrderUpdated();
      onClose();
    } catch (err: any) {
      error(err.message || 'Failed to delete order');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={`Order #${order.orderNumber}`}
        subtitle={`Placed on ${formatDateTime(order.orderDate)}`}
        maxWidth="3xl"
      >
        <div className="space-y-6 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#d8e4e7] bg-[#f4f8f9] px-4 py-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#706c64]">Sales invoice</p>
              <p className="mt-0.5 font-mono font-bold text-[#183b46]">{getInvoiceNumber(order)}</p>
            </div>
            <button
              type="button"
              onClick={() => setShowInvoice(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#183b46] px-3 py-2 text-xs font-semibold text-white hover:bg-[#102c35]"
            >
              <FileText className="h-3.5 w-3.5" /> View / Print Invoice
            </button>
          </div>

          {/* Status Progression Stepper */}
          {order.orderStatus !== 'cancelled' && order.orderStatus !== 'returned' ? (
            <div className="p-4 rounded-2xl bg-[#faf8f5] border border-[#e9e4dc]">
              <div className="flex items-center justify-between relative">
                {/* Horizontal Progress Bar */}
                <div className="absolute top-1/2 left-0 right-0 -translate-y-1/2 h-0.5 bg-[#e9e4dc] -z-0" />
                <div
                  className="absolute top-1/2 left-0 -translate-y-1/2 h-0.5 bg-[#23424d] transition-all duration-300 -z-0"
                  style={{
                    width: `${Math.max(0, (currentStepIdx / (steps.length - 1)) * 100)}%`,
                  }}
                />

                {steps.map((s, idx) => {
                  const isDone = idx <= currentStepIdx;
                  const isCurrent = idx === currentStepIdx;
                  return (
                    <div key={s.status} className="flex flex-col items-center relative z-10">
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-[11px] transition-colors ${
                          isDone
                            ? 'bg-[#23424d] text-white shadow-xs'
                            : 'bg-white border border-[#d8d3c9] text-[#8a857b]'
                        }`}
                      >
                        {isDone ? '✓' : idx + 1}
                      </div>
                      <span
                        className={`text-[10px] mt-1 font-semibold capitalize ${
                          isCurrent ? 'text-[#23424d]' : isDone ? 'text-[#1c1b18]' : 'text-[#8a857b]'
                        }`}
                      >
                        {s.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div
              className={`p-3 rounded-2xl border flex items-center gap-2.5 ${
                order.orderStatus === 'cancelled'
                  ? 'bg-[#fff1f2] border-[#fecdd3] text-[#be123c]'
                  : 'bg-[#fdf2f8] border-[#fce7f3] text-[#be185d]'
              }`}
            >
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <div className="flex-1">
                <span className="font-bold uppercase tracking-wider text-[11px]">
                  Order {order.orderStatus}
                </span>
                <p className="text-[11px] text-[#706c64] mt-0.5">
                  {order.orderStatus === 'cancelled'
                    ? 'Items were automatically restored to inventory.'
                    : `Processed return condition: ${order.returnCondition || 'sellable'}.`}
                </p>
              </div>
            </div>
          )}

          {/* Customer & Shipping Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl bg-[#faf8f5] border border-[#e9e4dc] space-y-2">
              <h5 className="font-bold text-[#1c1b18] flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-[#23424d]" /> Customer Information
              </h5>
              <div className="space-y-1 text-[#1c1b18]">
                <p className="font-semibold text-[#1c1b18]">{order.customerName}</p>
                <p className="flex items-center gap-1.5 text-[#706c64] font-mono">
                  <Phone className="w-3 h-3" /> {order.customerPhone}
                </p>
                <p className="flex items-start gap-1.5 text-[#706c64]">
                  <MapPin className="w-3 h-3 shrink-0 mt-0.5 text-[#8a857b]" />
                  <span>
                    {order.customerAddress}
                    {order.customerCity ? `, ${order.customerCity}` : ''}
                  </span>
                </p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-[#faf8f5] border border-[#e9e4dc] space-y-2">
              <h5 className="font-bold text-[#1c1b18] flex items-center gap-1.5">
                <Truck className="w-3.5 h-3.5 text-[#047857]" /> Payment & Fulfillment
              </h5>
              <div className="space-y-1 text-[#1c1b18]">
                <div className="flex justify-between">
                  <span className="text-[#706c64]">Payment Method:</span>
                  <span className="font-semibold">{order.paymentMethod}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#706c64]">Payment Status:</span>
                  <span className="font-semibold capitalize text-[#047857]">
                    {order.paymentStatus}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#706c64]">Courier fee paid in advance:</span>
                  <span className="font-semibold">{order.deliveryCollectionMethod === 'advance' ? 'Yes' : 'No'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#706c64]">Inventory Status:</span>
                  <span className="font-semibold text-[#1c1b18]">
                    {order.stockDeducted ? 'Stock Deducted' : 'Restored / Non-deducted'}
                  </span>
                </div>
                {order.notes && (
                  <div className="pt-2 border-t border-[#e9e4dc] text-[#706c64]">
                    <span className="text-[#8a857b] block text-[10px]">Notes:</span>
                    {order.notes}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Line Items Table */}
          <div className="border border-[#e9e4dc] rounded-2xl overflow-hidden bg-white shadow-2xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#faf8f5] text-[#706c64] font-medium border-b border-[#e9e4dc]">
                <tr>
                  <th className="py-2.5 px-4">Item & SKU</th>
                  <th className="py-2.5 px-4 text-right">Unit Price</th>
                  <th className="py-2.5 px-4 text-center">Qty</th>
                  <th className="py-2.5 px-4 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e9e4dc]">
                {order.items.map((item, idx) => (
                  <tr key={idx}>
                    <td className="py-2.5 px-4">
                      <span className="font-semibold text-[#1c1b18] block">{item.productName}</span>
                      <span className="font-mono text-[10px] text-[#8a857b]">{item.sku}</span>
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-[#706c64]">
                      {formatCurrency(item.sellingPrice, currencySymbol)}
                    </td>
                    <td className="py-2.5 px-4 text-center font-mono font-bold text-[#1c1b18]">
                      {item.quantity}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono font-bold text-[#1c1b18]">
                      {formatCurrency(item.total, currencySymbol)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Financial Summary */}
            <div className="p-4 bg-[#faf8f5] border-t border-[#e9e4dc] flex justify-end">
              <div className="w-64 space-y-1.5 font-mono text-xs">
                <div className="flex justify-between text-[#706c64]">
                  <span>Subtotal:</span>
                  <span>{formatCurrency(order.subtotal, currencySymbol)}</span>
                </div>
                {order.discount > 0 && (
                  <div className="flex justify-between text-[#706c64]">
                    <span>Discount:</span>
                    <span>-{formatCurrency(order.discount, currencySymbol)}</span>
                  </div>
                )}
                <div className="flex justify-between text-[#706c64]">
                  <span>Delivery Charge:</span>
                  <span>+{formatCurrency(order.deliveryCharge, currencySymbol)}</span>
                </div>
                <div className="border-t border-[#e9e4dc] pt-1.5 flex justify-between font-bold text-sm text-[#1c1b18]">
                  <span>Total Amount:</span>
                  <span className="text-[#047857]">
                    {formatCurrency(order.totalAmount, currencySymbol)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Controlled Workflow Action Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-[#e9e4dc]">
            <div className="flex items-center gap-2">
              {order.orderStatus !== 'cancelled' && order.orderStatus !== 'delivered' && (
                <button
                  type="button"
                  onClick={() => {
                    setCancelBusinessCourierFee('0');
                    setCancelAccountId(accounts[0]?.id || '');
                    setShowCancelModal(true);
                  }}
                  disabled={loading}
                  className="px-3 py-1.5 text-xs font-semibold text-[#be123c] hover:bg-[#fff1f2] border border-[#fecdd3] rounded-lg transition-colors cursor-pointer"
                >
                  Cancel Order
                </button>
              )}

              {order.orderStatus === 'delivered' && (
                <button
                  type="button"
                  onClick={() => {
                    setReturnBusinessCourierFee('0');
                    setReturnAccountId(accounts[0]?.id || '');
                    setShowReturnModal(true);
                  }}
                  disabled={loading}
                  className="px-3 py-1.5 text-xs font-semibold text-[#be185d] hover:bg-[#fdf2f8] border border-[#fce7f3] rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Process Return</span>
                </button>
              )}
            </div>

            {order.orderStatus === 'cancelled' && (
              <button
                type="button"
                onClick={() => setShowDeleteOrderModal(true)}
                disabled={loading}
                className="px-3 py-1.5 text-xs font-semibold text-[#be123c] hover:bg-[#fff1f2] border border-[#fecdd3] rounded-lg transition-colors cursor-pointer"
              >
                Delete Cancelled Order
              </button>
            )}

            <div className="flex items-center gap-2">
              {order.orderStatus === 'pending' && (
                <button
                  type="button"
                  onClick={() => handleUpdateStatus('confirmed')}
                  disabled={loading}
                  className="px-4 py-2 font-semibold text-white bg-[#0369a1] hover:bg-[#0284c7] rounded-lg transition-colors cursor-pointer shadow-xs"
                >
                  Confirm Order
                </button>
              )}

              {order.orderStatus === 'confirmed' && (
                <button
                  type="button"
                  onClick={() => handleUpdateStatus('processing')}
                  disabled={loading}
                  className="px-4 py-2 font-semibold text-white bg-[#1d4ed8] hover:bg-[#2563eb] rounded-lg transition-colors cursor-pointer shadow-xs"
                >
                  Start Processing / Packing
                </button>
              )}

              {order.orderStatus === 'processing' && (
                <button
                  type="button"
                  onClick={() => handleUpdateStatus('shipped')}
                  disabled={loading}
                  className="px-4 py-2 font-semibold text-white bg-[#6d28d9] hover:bg-[#7c3aed] rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
                >
                  <Truck className="w-4 h-4" />
                  <span>Mark as Shipped</span>
                </button>
              )}

              {order.orderStatus === 'shipped' && (
                <button
                  type="button"
                  onClick={() => {
                    setShowDeliverModal(true);
                  }}
                  disabled={loading}
                  className="px-4 py-2 font-semibold text-white bg-[#047857] hover:bg-[#065f46] rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Mark as Delivered</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </Modal>

      {/* Delivery status alone never records a courier payment. */}
      <Modal
        isOpen={showDeliverModal}
        onClose={() => setShowDeliverModal(false)}
        title="Confirm Successful Delivery"
        maxWidth="md"
      >
        <div className="space-y-4 text-xs">
          <p className="text-[#1c1b18]">
            Marking delivered records the order status only. Record courier costs only when the business actually pays them during a return or cancellation.
          </p>
          <div className="flex justify-end gap-3 pt-3 border-t border-[#e9e4dc]">
            <button
              onClick={() => setShowDeliverModal(false)}
              className="px-4 py-2 font-semibold text-[#4a4741] hover:text-[#1c1b18] bg-white border border-[#d8d3c9] hover:bg-[#f7f4ee] rounded-lg transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={() => handleUpdateStatus('delivered')}
              disabled={loading}
              className="px-4 py-2 font-semibold text-white bg-[#047857] hover:bg-[#065f46] rounded-lg transition-colors cursor-pointer shadow-xs"
            >
              {loading ? 'Processing...' : 'Confirm Delivery'}
            </button>
          </div>
        </div>
      </Modal>

      <InvoiceModal
        isOpen={showInvoice}
        onClose={() => setShowInvoice(false)}
        order={order}
        settings={settings}
      />

      <ConfirmDialog
        isOpen={showDeleteOrderModal}
        onClose={() => setShowDeleteOrderModal(false)}
        onConfirm={handleDeleteOrder}
        loading={loading}
        title="Permanently Delete Order"
        message={`Delete cancelled Order #${order.orderNumber}? Restored stock and any delivery-loss expense will remain recorded.`}
        confirmLabel="Delete Order"
        isDestructive
      />

      {/* RETURN MODAL: Condition and any courier fee actually paid by the business */}
      <Modal
        isOpen={showReturnModal}
        onClose={() => setShowReturnModal(false)}
        title="Process Customer Return"
        subtitle={`Order #${order.orderNumber}`}
        maxWidth="md"
      >
        <div className="space-y-4 text-xs">
          <div>
            <label className="block text-[#4a4741] font-medium mb-1">
              Returned Items Condition *
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setReturnCondition('sellable')}
                className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                  returnCondition === 'sellable'
                    ? 'bg-[#ecfdf5] border-[#a7f3d0] text-[#065f46]'
                    : 'bg-white border-[#d8d3c9] text-[#706c64] hover:text-[#1c1b18]'
                }`}
              >
                <p className="font-bold">Sellable Condition</p>
                <p className="text-[11px] text-[#065f46] mt-1">
                  Returns items back to active, available product inventory.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setReturnCondition('damaged')}
                className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                  returnCondition === 'damaged'
                    ? 'bg-[#fff1f2] border-[#fecdd3] text-[#be123c]'
                    : 'bg-white border-[#d8d3c9] text-[#706c64] hover:text-[#1c1b18]'
                }`}
              >
                <p className="font-bold">Damaged / Expired</p>
                <p className="text-[11px] text-[#be123c] mt-1">
                  Logs damaged stock movement without increasing available inventory.
                </p>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-[#4a4741] font-medium mb-1">Courier fee actually paid by the business ({currencySymbol})</label>
            <input type="number" min="0" step="any" value={returnBusinessCourierFee} onChange={(event) => setReturnBusinessCourierFee(event.target.value)} placeholder="0 if the customer paid or no fee was paid" className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg" />
            {Number(returnBusinessCourierFee) > 0 && (
              <label className="block mt-3 text-[#4a4741] font-medium">
                Paid from
                <select value={returnAccountId} onChange={(event) => setReturnAccountId(event.target.value)} className="mt-1 w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg">
                  <option value="">Select account</option>
                  {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                </select>
              </label>
            )}
            <p className="mt-1 text-[10px] text-[#706c64]">Enter only the amount the business pays. 0 causes no account deduction or expense.</p>
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-[#e9e4dc]">
            <button
              onClick={() => setShowReturnModal(false)}
              className="px-4 py-2 font-semibold text-[#4a4741] hover:text-[#1c1b18] bg-white border border-[#d8d3c9] hover:bg-[#f7f4ee] rounded-lg transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                const amount = Number(returnBusinessCourierFee);
                if (returnBusinessCourierFee === '' || !Number.isFinite(amount) || amount < 0) {
                  error('Enter a valid amount paid by the business');
                  return;
                }
                if (amount > 0 && !returnAccountId) {
                  error('Select the account used to pay the courier');
                  return;
                }
                handleUpdateStatus('returned', {
                  returnCondition,
                  businessCourierFee: amount,
                  businessCourierAccountId: amount > 0 ? returnAccountId : undefined,
                });
              }}
              disabled={loading}
              className="px-4 py-2 font-semibold text-white bg-[#be185d] hover:bg-[#9d174d] rounded-lg transition-colors cursor-pointer shadow-xs"
            >
              {loading ? 'Processing...' : 'Confirm Return'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showCancelModal}
        onClose={() => setShowCancelModal(false)}
        title="Cancel Order"
        subtitle={`Order #${order.orderNumber}`}
        maxWidth="md"
      >
        <form onSubmit={handleCancelOrder} className="space-y-4 text-xs">
          <p className="text-[#4a4741]">
            {['shipped', 'delivered'].includes(order.orderStatus)
              ? 'Enter only the courier fee the business actually pays. If the customer pays the courier, enter 0.'
              : 'This order has not shipped. Cancelling it will not create a courier expense or change any account balance.'}
          </p>
          {['shipped', 'delivered'].includes(order.orderStatus) && (
            <div>
              <label className="block text-[#4a4741] font-medium mb-1">Courier fee paid by the business ({currencySymbol})</label>
              <input type="number" min="0" step="any" value={cancelBusinessCourierFee} onChange={(event) => setCancelBusinessCourierFee(event.target.value)} className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg text-[#1c1b18] font-mono" placeholder="0 if customer paid or no fee was paid" />
              {Number(cancelBusinessCourierFee) > 0 && (
                <select value={cancelAccountId} onChange={(event) => setCancelAccountId(event.target.value)} className="mt-2 w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg">
                  <option value="">Select account</option>
                  {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                </select>
              )}
            </div>
          )}

          <div>
            <label className="block text-[#4a4741] font-medium mb-1">Cancellation Note</label>
            <input
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
              placeholder="Optional reason"
              className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg text-[#1c1b18] focus:outline-none focus:border-[#23424d]"
            />
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-[#e9e4dc]">
            <button
              type="button"
              onClick={() => setShowCancelModal(false)}
              disabled={loading}
              className="px-4 py-2 font-semibold text-[#4a4741] bg-white border border-[#d8d3c9] rounded-lg cursor-pointer"
            >
              Keep Order
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 font-semibold text-white bg-[#be123c] hover:bg-[#9f1239] rounded-lg cursor-pointer"
            >
              {loading ? 'Cancelling...' : 'Cancel Order'}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
};
