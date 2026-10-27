import React from 'react';
import { Printer } from 'lucide-react';
import { BusinessSettings, Order } from '../../types';
import { formatCurrency, formatDateTime } from '../../lib/utils';
import { getInvoiceNumber } from '../../lib/invoice';
import { Modal } from '../common/Modal';

interface InvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: Order;
  settings: BusinessSettings;
}

export const InvoiceModal: React.FC<InvoiceModalProps> = ({ isOpen, onClose, order, settings }) => {
  const invoiceNumber = getInvoiceNumber(order);
  const amountPaid = order.paymentStatus === 'paid'
    ? Number(order.amountPaid ?? order.totalAmount)
    : Number(order.amountPaid) || 0;
  const amountDue = Math.max(0, Number(order.amountDue ?? order.totalAmount - amountPaid));

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Sales Invoice"
      subtitle={invoiceNumber}
      maxWidth="3xl"
    >
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .invoice-print-area, .invoice-print-area * { visibility: visible !important; }
          .invoice-print-area {
            position: fixed !important;
            inset: 0 !important;
            width: 100% !important;
            min-height: 100vh !important;
            margin: 0 !important;
            padding: 12mm !important;
            background: #fff !important;
            color: #17252b !important;
            box-shadow: none !important;
            overflow: visible !important;
            border: 0 !important;
          }
          .invoice-no-print { display: none !important; }
          @page { size: A4; margin: 0; }
        }
      `}</style>

      <article className="invoice-print-area mx-auto max-w-3xl overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white text-[#17252b] shadow-sm">
        <div className="bg-[#183b46] px-7 py-7 text-white sm:px-9">
          <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-start">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#a8c4ca]">Sales invoice</p>
              <h1 className="mt-2 text-2xl font-bold tracking-tight">{settings.businessName || 'Business'}</h1>
              <div className="mt-2 space-y-0.5 text-xs text-[#d9e5e7]">
                {settings.address && <p>{settings.address}</p>}
                {settings.phone && <p>{settings.phone}</p>}
                {settings.email && <p>{settings.email}</p>}
              </div>
            </div>
            <div className="sm:text-right">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#a8c4ca]">Invoice number</p>
              <p className="mt-1 font-mono text-sm font-bold tracking-wide">{invoiceNumber}</p>
              <p className="mt-3 text-xs text-[#d9e5e7]">Issued {formatDateTime(order.orderDate)}</p>
              <span className="mt-3 inline-flex rounded-full border border-white/25 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide">
                {order.paymentStatus.replace('_', ' ')}
              </span>
            </div>
          </div>
        </div>

        <div className="grid gap-5 px-7 py-6 sm:grid-cols-2 sm:px-9">
          <section>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#748087]">Invoice to</p>
            <h2 className="mt-2 font-bold">{order.customerName}</h2>
            <p className="mt-1 text-xs text-[#59676d]">{order.customerPhone}</p>
            <p className="mt-1 whitespace-pre-line text-xs text-[#59676d]">
              {[order.customerAddress, order.customerCity].filter(Boolean).join(', ')}
            </p>
          </section>
          <section className="sm:text-right">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#748087]">Order details</p>
            <p className="mt-2 text-xs"><span className="text-[#748087]">Order reference: </span><span className="font-mono font-semibold">{order.orderNumber}</span></p>
            <p className="mt-1 text-xs"><span className="text-[#748087]">Payment method: </span><span className="font-semibold">{order.paymentMethod}</span></p>
            <p className="mt-1 text-xs"><span className="text-[#748087]">Fulfillment: </span><span className="font-semibold capitalize">{order.orderStatus}</span></p>
          </section>
        </div>

        <div className="px-7 pb-2 sm:px-9">
          <div className="overflow-hidden rounded-xl border border-[#e5e7eb]">
            <table className="w-full border-collapse text-left text-xs">
              <thead className="bg-[#f3f6f7] text-[10px] uppercase tracking-wide text-[#59676d]">
                <tr>
                  <th className="px-3 py-3 sm:px-4">Product / SKU</th>
                  <th className="px-3 py-3 text-right">Unit price</th>
                  <th className="px-3 py-3 text-center">Qty</th>
                  <th className="px-3 py-3 text-right sm:px-4">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e8ecee]">
                {order.items.map((item, index) => (
                  <tr key={`${item.productId}-${index}`}>
                    <td className="px-3 py-3 sm:px-4">
                      <p className="font-semibold">{item.productName}</p>
                      <p className="mt-0.5 font-mono text-[10px] text-[#748087]">{item.sku}</p>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right font-mono">{formatCurrency(item.sellingPrice, settings.currencySymbol)}</td>
                    <td className="px-3 py-3 text-center font-mono">{item.quantity}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right font-mono font-semibold sm:px-4">{formatCurrency(item.total, settings.currencySymbol)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex justify-end px-7 py-5 sm:px-9">
          <dl className="w-full max-w-xs space-y-2 text-xs">
            <div className="flex justify-between gap-4"><dt className="text-[#59676d]">Subtotal</dt><dd className="font-mono">{formatCurrency(order.subtotal, settings.currencySymbol)}</dd></div>
            {order.discount > 0 && <div className="flex justify-between gap-4"><dt className="text-[#59676d]">Discount</dt><dd className="font-mono">−{formatCurrency(order.discount, settings.currencySymbol)}</dd></div>}
            <div className="flex justify-between gap-4"><dt className="text-[#59676d]">Delivery</dt><dd className="font-mono">{formatCurrency(order.deliveryCharge, settings.currencySymbol)}</dd></div>
            <div className="flex justify-between gap-4 border-t border-[#dfe5e7] pt-3 text-sm font-bold"><dt>Total</dt><dd className="font-mono">{formatCurrency(order.totalAmount, settings.currencySymbol)}</dd></div>
            <div className="flex justify-between gap-4 text-[#047857]"><dt>Paid</dt><dd className="font-mono font-semibold">{formatCurrency(amountPaid, settings.currencySymbol)}</dd></div>
            <div className="flex justify-between gap-4 font-bold text-[#be123c]"><dt>Balance due</dt><dd className="font-mono">{formatCurrency(amountDue, settings.currencySymbol)}</dd></div>
          </dl>
        </div>

        {order.notes && (
          <div className="mx-7 border-t border-[#e8ecee] py-4 text-xs sm:mx-9">
            <p className="font-bold uppercase tracking-wide text-[10px] text-[#748087]">Notes</p>
            <p className="mt-1 whitespace-pre-line text-[#59676d]">{order.notes}</p>
          </div>
        )}

        <footer className="border-t border-[#e8ecee] bg-[#f7f9fa] px-7 py-4 text-center text-[10px] text-[#748087] sm:px-9">
          Thank you for your business. Please retain this invoice for your records.
        </footer>
        <div className="invoice-no-print flex justify-end border-t border-[#e8ecee] px-7 py-4 sm:px-9">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-lg bg-[#183b46] px-4 py-2 text-xs font-semibold text-white hover:bg-[#102c35]"
          >
            <Printer className="h-4 w-4" /> Print / Save PDF
          </button>
        </div>
      </article>
    </Modal>
  );
};
