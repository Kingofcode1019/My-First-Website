import React, { useState, useMemo } from 'react';
import { Modal } from '../common/Modal';
import { Search, Package, ShoppingCart, Users, Truck, ArrowRight } from 'lucide-react';
import { useBusiness } from '../../context/BusinessContext';
import { ActiveTab } from './Sidebar';
import { formatCurrency } from '../../lib/utils';

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  setActiveTab: (tab: ActiveTab) => void;
  onSelectOrder?: (orderId: string) => void;
  onSelectProduct?: (productId: string) => void;
}

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({
  isOpen,
  onClose,
  setActiveTab,
  onSelectOrder,
  onSelectProduct,
}) => {
  const { products, orders, customers, suppliers, settings } = useBusiness();
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;

    const matchedProducts = products
      .filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || p.category.toLowerCase().includes(q))
      .slice(0, 4);

    const matchedOrders = orders
      .filter(
        (o) =>
          o.orderNumber.toLowerCase().includes(q) ||
          o.customerName.toLowerCase().includes(q) ||
          o.customerPhone.includes(q)
      )
      .slice(0, 4);

    const matchedCustomers = customers
      .filter((c) => c.name.toLowerCase().includes(q) || c.phone.includes(q) || (c.email && c.email.toLowerCase().includes(q)))
      .slice(0, 4);

    const matchedSuppliers = suppliers
      .filter((s) => s.name.toLowerCase().includes(q) || s.company.toLowerCase().includes(q) || s.phone.includes(q))
      .slice(0, 3);

    return {
      products: matchedProducts,
      orders: matchedOrders,
      customers: matchedCustomers,
      suppliers: matchedSuppliers,
      hasAny:
        matchedProducts.length > 0 ||
        matchedOrders.length > 0 ||
        matchedCustomers.length > 0 ||
        matchedSuppliers.length > 0,
    };
  }, [query, products, orders, customers, suppliers]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Global Business Search" maxWidth="xl">
      <div className="space-y-4 text-xs">
        {/* Search Input */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8a857b]" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by Order ID, Phone, Customer, SKU, Product name, Supplier..."
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-[#d8d3c9] rounded-xl text-sm text-[#1c1b18] placeholder-[#8a857b] focus:outline-none focus:border-[#23424d] shadow-2xs"
            autoFocus
          />
        </div>

        {/* Results */}
        <div className="max-h-96 overflow-y-auto space-y-4 divide-y divide-[#e9e4dc] pt-2">
          {!results && (
            <p className="text-xs text-[#706c64] text-center py-6">
              Type a customer phone, order #, product name, or SKU to jump immediately.
            </p>
          )}

          {results && !results.hasAny && (
            <p className="text-xs text-[#706c64] text-center py-6">
              No matching records found for "{query}".
            </p>
          )}

          {results && results.products.length > 0 && (
            <div className="pt-3 first:pt-0">
              <div className="flex items-center gap-2 text-[11px] font-bold text-[#706c64] uppercase tracking-wider mb-2">
                <Package className="w-3.5 h-3.5 text-[#23424d]" /> Products
              </div>
              <div className="space-y-1">
                {results.products.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setActiveTab('products');
                      onSelectProduct?.(p.id);
                      onClose();
                    }}
                    className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-[#f6f3eb] text-left transition-colors cursor-pointer group"
                  >
                    <div>
                      <p className="text-xs font-semibold text-[#1c1b18]">
                        {p.name}
                      </p>
                      <p className="text-[11px] text-[#706c64]">
                        SKU: {p.sku} · Stock: {p.currentStock} {p.unit} · {formatCurrency(p.sellingPrice, settings.currencySymbol)}
                      </p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-[#8a857b] group-hover:text-[#23424d] transition-colors" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {results && results.orders.length > 0 && (
            <div className="pt-3">
              <div className="flex items-center gap-2 text-[11px] font-bold text-[#706c64] uppercase tracking-wider mb-2">
                <ShoppingCart className="w-3.5 h-3.5 text-[#047857]" /> Orders
              </div>
              <div className="space-y-1">
                {results.orders.map((o) => (
                  <button
                    key={o.id}
                    onClick={() => {
                      setActiveTab('orders');
                      onSelectOrder?.(o.id);
                      onClose();
                    }}
                    className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-[#f6f3eb] text-left transition-colors cursor-pointer group"
                  >
                    <div>
                      <p className="text-xs font-semibold text-[#1c1b18]">
                        #{o.orderNumber} · {o.customerName} ({o.customerPhone})
                      </p>
                      <p className="text-[11px] text-[#706c64]">
                        Status: <span className="capitalize">{o.orderStatus}</span> · Total: {formatCurrency(o.totalAmount, settings.currencySymbol)}
                      </p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-[#8a857b] group-hover:text-[#047857] transition-colors" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {results && results.customers.length > 0 && (
            <div className="pt-3">
              <div className="flex items-center gap-2 text-[11px] font-bold text-[#706c64] uppercase tracking-wider mb-2">
                <Users className="w-3.5 h-3.5 text-[#0e7490]" /> Customers
              </div>
              <div className="space-y-1">
                {results.customers.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      setActiveTab('customers');
                      onClose();
                    }}
                    className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-[#f6f3eb] text-left transition-colors cursor-pointer group"
                  >
                    <div>
                      <p className="text-xs font-semibold text-[#1c1b18]">{c.name}</p>
                      <p className="text-[11px] text-[#706c64]">
                        Phone: {c.phone} · Orders: {c.totalOrders} · Spent: {formatCurrency(c.ltv || c.totalSpent, settings.currencySymbol)}
                      </p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-[#8a857b] group-hover:text-[#0e7490] transition-colors" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {results && results.suppliers.length > 0 && (
            <div className="pt-3">
              <div className="flex items-center gap-2 text-[11px] font-bold text-[#706c64] uppercase tracking-wider mb-2">
                <Truck className="w-3.5 h-3.5 text-[#c85a32]" /> Suppliers
              </div>
              <div className="space-y-1">
                {results.suppliers.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      setActiveTab('suppliers');
                      onClose();
                    }}
                    className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-[#f6f3eb] text-left transition-colors cursor-pointer group"
                  >
                    <div>
                      <p className="text-xs font-semibold text-[#1c1b18]">{s.company}</p>
                      <p className="text-[11px] text-[#706c64]">
                        Contact: {s.name} · Phone: {s.phone}
                      </p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-[#8a857b] group-hover:text-[#c85a32] transition-colors" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};
