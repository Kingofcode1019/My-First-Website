import React from 'react';
import { Modal } from '../common/Modal';
import { Product, Order, InventoryMovement } from '../../types';
import { formatCurrency, formatDate, formatDateTime } from '../../lib/utils';
import { getSupplierDisplayName } from '../../lib/supplierUtils';
import { Package, Layers, ShoppingCart, Truck, AlertTriangle } from 'lucide-react';

interface ProductDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
  orders: Order[];
  movements: InventoryMovement[];
  currencySymbol: string;
  onEdit: (product: Product) => void;
  onAdjustStock: (product: Product) => void;
}

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({
  isOpen,
  onClose,
  product,
  orders,
  movements,
  currencySymbol,
  onEdit,
  onAdjustStock,
}) => {
  if (!product) return null;

  const productMovements = movements.filter((m) => m.productId === product.id).slice(0, 8);
  const productOrders = orders
    .filter((o) => o.items.some((i) => i.productId === product.id))
    .slice(0, 6);

  const inventoryValue = product.currentStock * product.purchasePrice;
  const unitProfit = Math.max(0, product.sellingPrice - product.purchasePrice);
  const marginPercent =
    product.sellingPrice > 0 ? ((unitProfit / product.sellingPrice) * 100).toFixed(1) : '0';
  const isLowStock = product.currentStock <= product.minStockLevel;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={product.name}
      subtitle={`SKU: ${product.sku} · Category: ${product.category}`}
      maxWidth="3xl"
    >
      <div className="space-y-6 text-xs">
        {/* Top Info Banner */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-2xl bg-[#faf8f5] border border-[#e9e4dc]">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-xl bg-[#ede8de] border border-[#ddd7cc] overflow-hidden shrink-0 flex items-center justify-center text-[#706c64]">
              {product.imageUrl ? (
                <img
                  src={product.imageUrl}
                  alt={product.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Package className="w-7 h-7 text-[#8a857b]" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[#1c1b18] font-bold">{product.sku}</span>
                {isLowStock && (
                  <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#fef3c7] text-[#92400e] border border-[#fde68a]">
                    <AlertTriangle className="w-3 h-3" /> LOW STOCK
                  </span>
                )}
              </div>
              <p className="text-[#706c64] text-xs mt-0.5">
                {product.brand ? `${product.brand} · ` : ''}{product.category}
              </p>
              <p className="text-[11px] text-[#8a857b] mt-0.5 flex items-center gap-1">
                <Truck className="w-3 h-3 text-[#706c64]" /> Supplier: {getSupplierDisplayName(product.supplierName)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-stretch sm:self-auto">
            <button
              onClick={() => onAdjustStock(product)}
              className="flex-1 sm:flex-initial px-3.5 py-2 text-xs font-semibold text-[#1c1b18] bg-white border border-[#d8d3c9] hover:bg-[#f7f4ee] rounded-lg transition-colors cursor-pointer"
            >
              Adjust Stock
            </button>
            <button
              onClick={() => onEdit(product)}
              className="flex-1 sm:flex-initial px-3.5 py-2 text-xs font-semibold text-white bg-[#23424d] hover:bg-[#1a323b] rounded-lg transition-colors cursor-pointer shadow-xs"
            >
              Edit Product
            </button>
          </div>
        </div>

        {/* Financial & Stock Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-xl bg-white border border-[#e9e4dc] shadow-2xs">
            <span className="text-[#706c64] text-[11px] font-medium">Current Stock</span>
            <p className="text-lg font-bold font-mono text-[#1c1b18] mt-0.5">
              {product.currentStock} {product.unit}
            </p>
            <span className="text-[10px] text-[#8a857b]">Min threshold: {product.minStockLevel}</span>
          </div>

          <div className="p-3.5 rounded-xl bg-white border border-[#e9e4dc] shadow-2xs">
            <span className="text-[#706c64] text-[11px] font-medium">Selling Price</span>
            <p className="text-lg font-bold font-mono text-[#059669] mt-0.5">
              {formatCurrency(product.sellingPrice, currencySymbol)}
            </p>
            <span className="text-[10px] text-[#8a857b]">Cost: {formatCurrency(product.purchasePrice, currencySymbol)}</span>
          </div>

          <div className="p-3.5 rounded-xl bg-white border border-[#e9e4dc] shadow-2xs">
            <span className="text-[#706c64] text-[11px] font-medium">Gross Unit Profit</span>
            <p className="text-lg font-bold font-mono text-[#23424d] mt-0.5">
              {formatCurrency(unitProfit, currencySymbol)}
            </p>
            <span className="text-[10px] text-[#8a857b]">{marginPercent}% Margin</span>
          </div>

          <div className="p-3.5 rounded-xl bg-white border border-[#e9e4dc] shadow-2xs">
            <span className="text-[#706c64] text-[11px] font-medium">Asset Valuation</span>
            <p className="text-lg font-bold font-mono text-[#0e7490] mt-0.5">
              {formatCurrency(inventoryValue, currencySymbol)}
            </p>
            <span className="text-[10px] text-[#8a857b]">At purchase cost</span>
          </div>
        </div>

        {product.description && (
          <div className="p-3.5 rounded-xl bg-[#faf8f5] border border-[#e9e4dc]">
            <h5 className="font-bold text-[#1c1b18] mb-1">Product Description</h5>
            <p className="text-[#4a4741] leading-relaxed">{product.description}</p>
          </div>
        )}

        {/* Two Columns: Recent Movements & Recent Orders */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 rounded-2xl bg-white border border-[#e9e4dc] flex flex-col shadow-2xs">
            <h5 className="font-bold text-[#1c1b18] mb-2.5 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-[#23424d]" /> Stock Movement History
            </h5>
            {productMovements.length === 0 ? (
              <p className="text-[#8a857b] text-xs py-4 text-center">No stock changes recorded yet.</p>
            ) : (
              <div className="space-y-2 overflow-y-auto max-h-56">
                {productMovements.map((m) => (
                  <div
                    key={m.id}
                    className="p-2.5 rounded-xl bg-[#faf8f5] border border-[#e9e4dc] flex items-center justify-between"
                  >
                    <div>
                      <p className="font-bold text-[#1c1b18] capitalize">
                        {m.type.replace('_', ' ')}
                      </p>
                      <p className="text-[10px] text-[#706c64]">{m.reason || 'No note'}{m.type === 'purchase' || m.type === 'stock_in' ? ` · Supplier: ${getSupplierDisplayName(m.supplierName)}` : ''} · {formatDateTime(m.date)}</p>
                    </div>
                    <div className="text-right font-mono">
                      <span
                        className={`font-bold ${
                          m.quantity > 0 ? 'text-[#059669]' : 'text-[#be123c]'
                        }`}
                      >
                        {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                      </span>
                      <p className="text-[10px] text-[#8a857b]">
                        {m.prevStock} → {m.newStock}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="p-4 rounded-2xl bg-white border border-[#e9e4dc] flex flex-col shadow-2xs">
            <h5 className="font-bold text-[#1c1b18] mb-2.5 flex items-center gap-1.5">
              <ShoppingCart className="w-3.5 h-3.5 text-[#059669]" /> Recent Associated Orders
            </h5>
            {productOrders.length === 0 ? (
              <p className="text-[#8a857b] text-xs py-4 text-center">No orders placed with this product yet.</p>
            ) : (
              <div className="space-y-2 overflow-y-auto max-h-56">
                {productOrders.map((o) => {
                  const item = o.items.find((i) => i.productId === product.id);
                  return (
                    <div
                      key={o.id}
                      className="p-2.5 rounded-xl bg-[#faf8f5] border border-[#e9e4dc] flex items-center justify-between"
                    >
                      <div>
                        <p className="font-bold text-[#1c1b18]">#{o.orderNumber} · {o.customerName}</p>
                        <p className="text-[10px] text-[#706c64]">
                          {formatDate(o.orderDate)} · Status: <span className="capitalize">{o.orderStatus}</span>
                        </p>
                      </div>
                      <div className="text-right font-mono">
                        <span className="font-bold text-[#1c1b18]">
                          {item?.quantity} {product.unit}
                        </span>
                        <p className="text-[10px] text-[#059669] font-bold">
                          {formatCurrency(item?.total || 0, currencySymbol)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};
