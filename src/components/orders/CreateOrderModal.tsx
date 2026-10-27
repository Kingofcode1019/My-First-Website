import React, { useState, useEffect } from 'react';
import { Modal } from '../common/Modal';
import { Account, Customer, Order, OrderItem, Product } from '../../types';
import { DeliveryCollectionMethod } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { ordersService } from '../../services/orders.service';
import { formatCurrency } from '../../lib/utils';
import { Plus, Trash2, UserCheck } from 'lucide-react';

interface CreateOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  customers: Customer[];
  accounts: Account[];
  currencySymbol: string;
  defaultDeliveryCharge: number;
  onOrderCreated: (order: Order) => void;
}

export const CreateOrderModal: React.FC<CreateOrderModalProps> = ({
  isOpen,
  onClose,
  products,
  customers,
  accounts,
  currencySymbol,
  defaultDeliveryCharge,
  onOrderCreated,
}) => {
  const { effectiveUid } = useAuth();
  const { success, error } = useToast();
  const [loading, setLoading] = useState(false);

  const [customerPhone, setCustomerPhone] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerCity, setCustomerCity] = useState('');
  const [recognizedCustomer, setRecognizedCustomer] = useState<Customer | null>(null);

  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [itemQuantity, setItemQuantity] = useState(1);

  const [discount, setDiscount] = useState(0);
  const [deliveryCharge, setDeliveryCharge] = useState(defaultDeliveryCharge);
  const [deliveryCollectionMethod, setDeliveryCollectionMethod] = useState<DeliveryCollectionMethod>('on_delivery');
  const [paymentMethod, setPaymentMethod] = useState('Cash on Delivery');
  const [paymentAccountId, setPaymentAccountId] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (isOpen) {
      setCustomerPhone('');
      setCustomerName('');
      setCustomerAddress('');
      setCustomerCity('');
      setRecognizedCustomer(null);
      setOrderItems([]);
      setSelectedProductId(products[0]?.id || '');
      setItemQuantity(1);
      setDiscount(0);
      setDeliveryCharge(defaultDeliveryCharge);
      setDeliveryCollectionMethod('on_delivery');
      setPaymentMethod('Cash on Delivery');
      setPaymentAccountId(accounts[0]?.id || '');
      setNotes('');
    }
  }, [isOpen, products, accounts, defaultDeliveryCharge]);

  const handlePhoneChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setCustomerPhone(val);

    const clean = val.trim();
    if (clean.length >= 6) {
      const match = customers.find((c) => c.phone.includes(clean));
      if (match) {
        setRecognizedCustomer(match);
        setCustomerName(match.name);
        setCustomerAddress(match.address || '');
        setCustomerCity(match.city || '');
        return;
      }
    }
    setRecognizedCustomer(null);
  };

  const handleAddItem = () => {
    const product = products.find((p) => p.id === selectedProductId);
    if (!product) return;

    if (itemQuantity <= 0) {
      error('Quantity must be at least 1');
      return;
    }

    const existingInCart = orderItems.find((i) => i.productId === product.id)?.quantity || 0;
    const totalNeeded = existingInCart + itemQuantity;

    if (totalNeeded > product.currentStock) {
      error(
        `Insufficient stock for "${product.name}". Available: ${product.currentStock}, In cart + added: ${totalNeeded}`
      );
      return;
    }

    setOrderItems((prev) => {
      const idx = prev.findIndex((i) => i.productId === product.id);
      if (idx >= 0) {
        const updated = [...prev];
        const newQty = updated[idx].quantity + itemQuantity;
        updated[idx] = {
          ...updated[idx],
          quantity: newQty,
          total: newQty * updated[idx].sellingPrice,
        };
        return updated;
      } else {
        return [
          ...prev,
          {
            productId: product.id,
            productName: product.name,
            sku: product.sku,
            quantity: itemQuantity,
            sellingPrice: product.sellingPrice,
            purchasePrice: product.purchasePrice,
            total: itemQuantity * product.sellingPrice,
          },
        ];
      }
    });

    setItemQuantity(1);
  };

  const handleRemoveItem = (index: number) => {
    setOrderItems((prev) => prev.filter((_, i) => i !== index));
  };

  const subtotal = orderItems.reduce((sum, item) => sum + item.total, 0);
  const totalAmount = Math.max(0, subtotal - (discount || 0) + (deliveryCharge || 0));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveUid) return;

    if (!customerPhone.trim() || !customerName.trim()) {
      error('Customer Name and Phone number are required');
      return;
    }
    if (!customerAddress.trim()) {
      error('Delivery address is required');
      return;
    }
    if (orderItems.length === 0) {
      error('Please add at least one product item to the order');
      return;
    }
    if (!Number.isFinite(Number(deliveryCharge)) || Number(deliveryCharge) < 0) {
      error('Delivery charge must be a valid non-negative amount');
      return;
    }

    try {
      setLoading(true);
      const order = await ordersService.createOrder(effectiveUid, {
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        customerAddress: customerAddress.trim(),
        customerCity: customerCity.trim(),
        items: orderItems,
        subtotal,
        discount: Number(discount) || 0,
        deliveryCharge: Number(deliveryCharge) || 0,
        deliveryCollectionMethod,
        totalAmount,
        paymentMethod,
        paymentAccountId: paymentAccountId || '',
        notes: notes.trim(),
      });

      success('Order created successfully and stock reserved!');
      onOrderCreated(order);
      onClose();
    } catch (err: any) {
      error(err.message || 'Failed to create order');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create New Customer Order"
      subtitle="Validates stock availability and links with customer history"
      maxWidth="3xl"
    >
      <form onSubmit={handleSubmit} className="space-y-5 text-xs">
        {/* Customer Information Section */}
        <div className="p-4 rounded-2xl bg-[#faf8f5] border border-[#e9e4dc] space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-[#1c1b18] flex items-center gap-1.5">
              Customer Information
            </h4>
            {recognizedCustomer && (
              <span className="flex items-center gap-1 text-[11px] font-semibold text-[#065f46] bg-[#ecfdf5] px-2.5 py-0.5 rounded-full border border-[#a7f3d0]">
                <UserCheck className="w-3.5 h-3.5" /> Existing Customer recognized ({recognizedCustomer.totalOrders} previous orders)
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-[#4a4741] font-medium mb-1">Phone Number *</label>
              <input
                type="tel"
                required
                value={customerPhone}
                onChange={handlePhoneChange}
                placeholder="+880 1711-..."
                className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg text-[#1c1b18] font-mono focus:outline-none focus:border-[#23424d]"
              />
            </div>

            <div>
              <label className="block text-[#4a4741] font-medium mb-1">Customer Name *</label>
              <input
                type="text"
                required
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Full Name"
                className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg text-[#1c1b18] focus:outline-none focus:border-[#23424d]"
              />
            </div>

            <div>
              <label className="block text-[#4a4741] font-medium mb-1">City / District</label>
              <input
                type="text"
                value={customerCity}
                onChange={(e) => setCustomerCity(e.target.value)}
                placeholder="e.g. Dhaka, Chittagong"
                className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg text-[#1c1b18] focus:outline-none focus:border-[#23424d]"
              />
            </div>

            <div>
              <label className="block text-[#4a4741] font-medium mb-1">Payment Method</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg text-[#1c1b18] focus:outline-none focus:border-[#23424d]"
              >
                <option value="Cash on Delivery">Cash on Delivery (COD)</option>
                <option value="bKash">bKash</option>
                <option value="Nagad">Nagad</option>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Prepaid Card">Prepaid Card</option>
              </select>
            </div>

            <div className="sm:col-span-2 md:col-span-4">
              <label className="block text-[#4a4741] font-medium mb-1">Delivery Address *</label>
              <input
                type="text"
                required
                value={customerAddress}
                onChange={(e) => setCustomerAddress(e.target.value)}
                placeholder="House, Road, Area, Landmark"
                className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg text-[#1c1b18] focus:outline-none focus:border-[#23424d]"
              />
            </div>
          </div>
        </div>

        {/* Product Item Selection */}
        <div className="p-4 rounded-2xl bg-[#faf8f5] border border-[#e9e4dc] space-y-3">
          <h4 className="font-bold text-[#1c1b18]">Add Products to Order</h4>
          <div className="flex flex-col sm:flex-row items-center gap-2">
            <div className="flex-1 w-full">
              <select
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg text-[#1c1b18] focus:outline-none focus:border-[#23424d]"
              >
                {products
                  .filter((p) => p.status !== 'archived')
                  .map((p) => (
                    <option key={p.id} value={p.id} disabled={p.currentStock <= 0}>
                      {p.name} ({p.sku}) — Stock: {p.currentStock} {p.unit} |{' '}
                      {formatCurrency(p.sellingPrice, currencySymbol)}
                      {p.currentStock <= 0 ? ' [OUT OF STOCK]' : ''}
                    </option>
                  ))}
              </select>
            </div>

            <div className="w-24 shrink-0">
              <input
                type="number"
                min="1"
                value={itemQuantity}
                onChange={(e) => setItemQuantity(parseInt(e.target.value) || 1)}
                className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg text-[#1c1b18] font-mono focus:outline-none focus:border-[#23424d]"
              />
            </div>

            <button
              type="button"
              onClick={handleAddItem}
              className="w-full sm:w-auto px-4 py-2 font-semibold text-white bg-[#23424d] hover:bg-[#1a323b] rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5 shrink-0 shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>Add</span>
            </button>
          </div>

          {/* Line Items Table */}
          {orderItems.length > 0 && (
            <div className="border border-[#e9e4dc] rounded-xl overflow-hidden mt-3 bg-white">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#f8f5ee] text-[#706c64] font-semibold border-b border-[#e9e4dc]">
                  <tr>
                    <th className="py-2.5 px-3">Product</th>
                    <th className="py-2.5 px-3 text-right">Price</th>
                    <th className="py-2.5 px-3 text-center">Qty</th>
                    <th className="py-2.5 px-3 text-right">Total</th>
                    <th className="py-2.5 px-3 text-center w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f0ede6]">
                  {orderItems.map((item, idx) => (
                    <tr key={idx} className="hover:bg-[#faf7f2]">
                      <td className="py-2 px-3 font-semibold text-[#1c1b18]">
                        {item.productName} <span className="font-mono text-[#706c64]">({item.sku})</span>
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-[#706c64]">
                        {formatCurrency(item.sellingPrice, currencySymbol)}
                      </td>
                      <td className="py-2 px-3 text-center font-mono font-bold text-[#1c1b18]">
                        {item.quantity}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-[#1c1b18]">
                        {formatCurrency(item.total, currencySymbol)}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          className="p-1 text-[#8a857b] hover:text-[#be123c] transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Delivery Details */}
        <section className="p-4 rounded-2xl bg-[#f4f8f9] border border-[#d8e4e7] space-y-3">
          <div>
            <h4 className="font-bold text-[#183b46]">Delivery Details</h4>
            <p className="mt-0.5 text-[10px] text-[#706c64]">Choose whether the customer pays the courier fee before dispatch.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[#4a4741] font-medium mb-1">Expected Delivery Charge ({currencySymbol})</label>
              <input type="number" min="0" step="any" value={deliveryCharge} onChange={(event) => setDeliveryCharge(Math.max(0, Number(event.target.value) || 0))} className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg font-mono" />
            </div>
            <div>
              <label className="block text-[#4a4741] font-medium mb-1">Courier fee collected in advance?</label>
              <select value={deliveryCollectionMethod === 'advance' ? 'yes' : 'no'} onChange={(event) => setDeliveryCollectionMethod(event.target.value === 'yes' ? 'advance' : 'on_delivery')} className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg">
                <option value="yes">Yes — customer pays before dispatch</option>
                <option value="no">No — collect later</option>
              </select>
            </div>
          </div>
        </section>

        {/* Pricing & Billing Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div>
              <label className="block text-[#4a4741] font-medium mb-1">Assigned Cash/Bank Wallet</label>
              <select
                value={paymentAccountId}
                onChange={(e) => setPaymentAccountId(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg text-[#1c1b18] focus:outline-none focus:border-[#23424d]"
              >
                <option value="">No account (Cash on Delivery pending)</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} (Balance: {formatCurrency(a.currentBalance, currencySymbol)})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[#4a4741] font-medium mb-1">Internal Order Notes</label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Special delivery instructions, packaging notes..."
                className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg text-[#1c1b18] focus:outline-none focus:border-[#23424d]"
              />
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-[#faf8f5] border border-[#e9e4dc] space-y-2 font-mono">
            <div className="flex justify-between text-[#706c64]">
              <span>Subtotal:</span>
              <span className="font-bold text-[#1c1b18]">{formatCurrency(subtotal, currencySymbol)}</span>
            </div>

            <div className="flex items-center justify-between text-[#706c64]">
              <span>Discount ({currencySymbol}):</span>
              <input
                type="number"
                min="0"
                value={discount}
                onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                className="w-24 px-2 py-1 bg-white border border-[#d8d3c9] rounded text-right text-[#1c1b18] font-mono focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-between text-[#706c64]">
              <span>Delivery Charge ({currencySymbol}):</span>
              <input
                type="number"
                min="0"
                value={deliveryCharge}
                onChange={(e) => setDeliveryCharge(parseFloat(e.target.value) || 0)}
                className="w-24 px-2 py-1 bg-white border border-[#d8d3c9] rounded text-right text-[#1c1b18] font-mono focus:outline-none"
              />
            </div>

            <div className="border-t border-[#e9e4dc] pt-2 flex justify-between text-sm font-bold text-[#1c1b18]">
              <span>Total Payable:</span>
              <span className="text-[#059669] font-bold">{formatCurrency(totalAmount, currencySymbol)}</span>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-[#e9e4dc]">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 font-semibold text-[#4a4741] hover:text-[#1c1b18] bg-white border border-[#d8d3c9] hover:bg-[#f7f4ee] rounded-lg transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2 font-semibold text-white bg-[#23424d] hover:bg-[#1a323b] rounded-lg transition-colors cursor-pointer shadow-xs"
          >
            {loading ? 'Creating Order...' : 'Place Order & Deduct Stock'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
