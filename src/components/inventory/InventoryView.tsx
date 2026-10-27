import React, { useState, useMemo } from 'react';
import { useBusiness } from '../../context/BusinessContext';
import { InventoryMovementType, Product } from '../../types';
import { formatCurrency, formatDateTime, exportToCSV } from '../../lib/utils';
import { getSupplierDisplayName } from '../../lib/supplierUtils';
import {
  Layers,
  AlertTriangle,
  Download,
  Search,
  Package,
  Pencil,
} from 'lucide-react';
import { StockAdjustModal } from '../products/StockAdjustModal';
import { RestockModal } from './RestockModal';

const movementBadgeColors: Record<InventoryMovementType, { bg: string; text: string; border: string }> = {
  stock_in: { bg: 'bg-[#ecfdf5]', text: 'text-[#047857]', border: 'border-[#a7f3d0]' },
  purchase: { bg: 'bg-[#f5f3ff]', text: 'text-[#6d28d9]', border: 'border-[#ede9fe]' },
  sale: { bg: 'bg-[#eff6ff]', text: 'text-[#1d4ed8]', border: 'border-[#dbeafe]' },
  return: { bg: 'bg-[#fdf2f8]', text: 'text-[#be185d]', border: 'border-[#fce7f3]' },
  damage: { bg: 'bg-[#fff1f2]', text: 'text-[#be123c]', border: 'border-[#fecdd3]' },
  adjustment: { bg: 'bg-[#fffbeb]', text: 'text-[#b45309]', border: 'border-[#fef3c7]' },
  stock_out: { bg: 'bg-[#f4efe6]', text: 'text-[#4a4741]', border: 'border-[#e2dcd0]' },
  reservation: { bg: 'bg-[#f0f9ff]', text: 'text-[#0369a1]', border: 'border-[#bae6fd]' },
  reservation_release: { bg: 'bg-[#f4efe6]', text: 'text-[#4a4741]', border: 'border-[#e2dcd0]' },
};

export const InventoryView: React.FC = () => {
  const { movements, products, lowStockProducts, suppliers, settings, refreshAll } = useBusiness();
  const [activeTab, setActiveTab] = useState<'stock' | 'movements' | 'lowStock'>('stock');

  const [search, setSearch] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedProduct, setSelectedProduct] = useState<string>('all');
  const [adjustingProduct, setAdjustingProduct] = useState<Product | null>(null);
  const [restockingProduct, setRestockingProduct] = useState<Product | null>(null);

  const filteredMovements = useMemo(() => {
    return movements.filter((m) => {
      if (selectedType !== 'all' && m.type !== selectedType) return false;
      if (selectedProduct !== 'all' && m.productId !== selectedProduct) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchProd = m.productName.toLowerCase().includes(q);
        const matchSku = m.sku?.toLowerCase().includes(q) || false;
        const matchReason = m.reason?.toLowerCase().includes(q) || false;
        const matchRef = m.referenceId?.toLowerCase().includes(q) || false;
        if (!matchProd && !matchSku && !matchReason && !matchRef) return false;
      }
      return true;
    });
  }, [movements, selectedType, selectedProduct, search]);

  const stockProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return products
      .filter((product) => product.status !== 'archived')
      .filter((product) => {
        if (!query) return true;
        return [product.name, product.sku, product.category, getSupplierDisplayName(product.supplierName)]
          .some((value) => value.toLowerCase().includes(query));
      })
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [products, search]);

  const handleExportCSV = () => {
    const headers = ['Date', 'Product', 'SKU', 'Movement Type', 'Quantity', 'Previous Stock', 'New Stock', 'Reason', 'Reference ID'];
    const rows = filteredMovements.map((m) => [
      formatDateTime(m.date),
      m.productName,
      m.sku || '',
      m.type,
      m.quantity,
      m.prevStock,
      m.newStock,
      m.reason || '',
      m.referenceId || '',
    ]);
    exportToCSV(`inventory_movements_${new Date().toISOString().slice(0, 10)}`, headers, rows);
  };

  const valuation = useMemo(() => {
    const active = products.filter((p) => p.status !== 'archived');
    const totalUnits = active.reduce((sum, p) => sum + Math.max(0, p.currentStock), 0);
    const totalCostValue = active.reduce(
      (sum, p) => sum + Math.max(0, p.currentStock) * (p.purchasePrice || 0),
      0
    );
    const totalRetailValue = active.reduce(
      (sum, p) => sum + Math.max(0, p.currentStock) * (p.sellingPrice || 0),
      0
    );
    const potentialProfit = Math.max(0, totalRetailValue - totalCostValue);

    return { totalUnits, totalCostValue, totalRetailValue, potentialProfit };
  }, [products]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[#1c1b18] tracking-tight">Inventory & Stock Auditing</h2>
          <p className="text-xs text-[#706c64] mt-0.5">
            Real-time stock ledger, historical movement tracking, and low stock alarms
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {activeTab === 'movements' && (
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#1c1b18] bg-white hover:bg-[#f7f4ee] border border-[#d8d3c9] rounded-lg transition-colors cursor-pointer shadow-2xs"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 bg-white border border-[#e9e4dc] rounded-2xl shadow-2xs">
          <span className="text-xs text-[#706c64] font-medium">Total Physical Units</span>
          <p className="text-2xl font-bold font-mono text-[#1c1b18] mt-1">
            {valuation.totalUnits}
          </p>
          <span className="text-[11px] text-[#8a857b]">Across active catalog</span>
        </div>

        <div className="p-4 bg-white border border-[#e9e4dc] rounded-2xl shadow-2xs">
          <span className="text-xs text-[#706c64] font-medium">Total Cost Valuation</span>
          <p className="text-2xl font-bold font-mono text-[#23424d] mt-1">
            {formatCurrency(valuation.totalCostValue, settings.currencySymbol)}
          </p>
          <span className="text-[11px] text-[#8a857b]">Capital tied in inventory</span>
        </div>

        <div className="p-4 bg-white border border-[#e9e4dc] rounded-2xl shadow-2xs">
          <span className="text-xs text-[#706c64] font-medium">Retail Selling Value</span>
          <p className="text-2xl font-bold font-mono text-[#059669] mt-1">
            {formatCurrency(valuation.totalRetailValue, settings.currencySymbol)}
          </p>
          <span className="text-[11px] text-[#8a857b]">Gross revenue potential</span>
        </div>

        <div className="p-4 bg-white border border-[#e9e4dc] rounded-2xl shadow-2xs">
          <span className="text-xs text-[#706c64] font-medium">Potential Gross Margin</span>
          <p className="text-2xl font-bold font-mono text-[#0e7490] mt-1">
            {formatCurrency(valuation.potentialProfit, settings.currencySymbol)}
          </p>
          <span className="text-[11px] text-[#8a857b]">
            {valuation.totalRetailValue > 0
              ? `${((valuation.potentialProfit / valuation.totalRetailValue) * 100).toFixed(1)}% expected margin`
              : '0%'}
          </span>
        </div>
      </div>

      {/* View Switcher Tabs */}
      <div className="flex items-center gap-1 p-1 bg-[#f4efe6] border border-[#e2dcd0] rounded-xl w-fit text-xs font-semibold">
        <button
          onClick={() => setActiveTab('stock')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
            activeTab === 'stock'
              ? 'bg-white text-[#1c1b18] shadow-2xs'
              : 'text-[#706c64] hover:text-[#1c1b18]'
          }`}
        >
          <Package className="w-3.5 h-3.5 text-[#23424d]" />
          <span>Stock Overview ({products.filter((product) => product.status !== 'archived').length})</span>
        </button>
        <button
          onClick={() => setActiveTab('movements')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
            activeTab === 'movements'
              ? 'bg-white text-[#1c1b18] shadow-2xs'
              : 'text-[#706c64] hover:text-[#1c1b18]'
          }`}
        >
          <Layers className="w-3.5 h-3.5 text-[#23424d]" />
          <span>Movements Ledger ({movements.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('lowStock')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
            activeTab === 'lowStock'
              ? 'bg-white text-[#1c1b18] shadow-2xs'
              : 'text-[#706c64] hover:text-[#1c1b18]'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5 text-[#b45309]" />
          <span>Low Stock Alerts ({lowStockProducts.length})</span>
        </button>
      </div>

      {/* TAB 0: OPERATIONAL STOCK OVERVIEW */}
      {activeTab === 'stock' && (
        <div className="space-y-3">
          <div className="p-3.5 bg-white border border-[#e9e4dc] rounded-2xl shadow-2xs">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8a857b]" />
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search stock by product, SKU, category, or supplier..."
                className="w-full pl-9 pr-3 py-2 bg-white border border-[#d8d3c9] rounded-lg text-xs text-[#1c1b18] placeholder-[#8a857b] focus:outline-none focus:border-[#23424d]"
              />
            </div>
          </div>

          {stockProducts.length === 0 ? (
            <div className="p-10 text-center bg-white border border-dashed border-[#d8d3c9] rounded-2xl text-[#8a857b] text-xs">
              No active products found. Add a product to start managing stock here.
            </div>
          ) : (
            <div className="bg-white border border-[#e9e4dc] rounded-2xl overflow-hidden shadow-2xs">
              <div className="px-4 py-3 bg-[#f8f5ee] border-b border-[#e9e4dc] flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-[#1c1b18]">Operational Stock</h3>
                  <p className="text-[11px] text-[#706c64]">Restock or correct inventory directly from this screen.</p>
                </div>
                <span className="text-[11px] font-mono text-[#706c64]">{stockProducts.length} products</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#faf8f5] border-b border-[#e9e4dc] text-[#706c64] font-semibold">
                    <tr>
                      <th className="py-3 px-4">Product</th>
                      <th className="py-3 px-4">Supplier</th>
                      <th className="py-3 px-4 text-right">Stock</th>
                      <th className="py-3 px-4 text-right">Reorder At</th>
                      <th className="py-3 px-4 text-right">Unit Cost</th>
                      <th className="py-3 px-4 text-right">Stock Value</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f0ede6]">
                    {stockProducts.map((product) => {
                      const needsRestock = product.currentStock <= product.minStockLevel;
                      return (
                        <tr key={product.id} className="hover:bg-[#faf7f2] transition-colors">
                          <td className="py-3 px-4">
                            <span className="font-bold text-[#1c1b18] block">{product.name}</span>
                            <span className="font-mono text-[10px] text-[#706c64]">{product.sku} · {product.category}</span>
                          </td>
                          <td className="py-3 px-4 text-[#706c64]">{getSupplierDisplayName(product.supplierName)}</td>
                          <td className="py-3 px-4 text-right">
                            <span className={`font-mono font-bold text-sm ${needsRestock ? 'text-[#b45309]' : 'text-[#047857]'}`}>
                              {product.currentStock} {product.unit}
                            </span>
                            {needsRestock && <span className="block text-[10px] text-[#b45309]">Needs restock</span>}
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-[#706c64]">{product.minStockLevel} {product.unit}</td>
                          <td className="py-3 px-4 text-right font-mono text-[#706c64]">{formatCurrency(product.purchasePrice, settings.currencySymbol)}</td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-[#23424d]">{formatCurrency(product.currentStock * product.purchasePrice, settings.currencySymbol)}</td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => setRestockingProduct(product)}
                                className="px-2.5 py-1.5 text-[11px] font-semibold text-white bg-[#23424d] hover:bg-[#1a323b] rounded-lg cursor-pointer"
                              >
                                Restock
                              </button>
                              <button
                                type="button"
                                onClick={() => setAdjustingProduct(product)}
                                title="Correct stock count"
                                className="p-1.5 text-[#706c64] hover:text-[#23424d] hover:bg-[#f4efe6] rounded-lg cursor-pointer"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 1: MOVEMENTS LEDGER */}
      {activeTab === 'movements' && (
        <div className="space-y-3">
          {/* Filters */}
          <div className="p-3.5 bg-white border border-[#e9e4dc] rounded-2xl shadow-2xs grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8a857b]" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search reason, SKU, product, reference..."
                className="w-full pl-9 pr-3 py-2 bg-white border border-[#d8d3c9] rounded-lg text-[#1c1b18] placeholder-[#8a857b] focus:outline-none focus:border-[#23424d]"
              />
            </div>

            <div>
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg text-[#1c1b18] focus:outline-none focus:border-[#23424d]"
              >
                <option value="all">All Movement Types</option>
                <option value="stock_in">Stock In</option>
                <option value="purchase">Purchase</option>
                <option value="sale">Sale (Order Fulfillment)</option>
                <option value="return">Customer Return</option>
                <option value="damage">Damaged Stock</option>
                <option value="adjustment">Manual Adjustment</option>
                <option value="stock_out">Stock Out</option>
              </select>
            </div>

            <div>
              <select
                value={selectedProduct}
                onChange={(e) => setSelectedProduct(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg text-[#1c1b18] focus:outline-none focus:border-[#23424d]"
              >
                <option value="all">Filter by Product (All)</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Movements Table */}
          {filteredMovements.length === 0 ? (
            <div className="p-8 text-center bg-white border border-dashed border-[#d8d3c9] rounded-2xl text-[#8a857b] text-xs">
              No inventory movements recorded matching your criteria.
            </div>
          ) : (
            <div className="bg-white border border-[#e9e4dc] rounded-2xl overflow-hidden shadow-2xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#f8f5ee] border-b border-[#e9e4dc] text-[#706c64] font-semibold">
                    <tr>
                      <th className="py-3 px-4">Date & Time</th>
                      <th className="py-3 px-4">Product</th>
                      <th className="py-3 px-4">Type</th>
                      <th className="py-3 px-4 text-right">Change</th>
                      <th className="py-3 px-4 text-right">Balance</th>
                      <th className="py-3 px-4">Reason & Reference</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f0ede6]">
                    {filteredMovements.map((m) => {
                      const badge =
                        movementBadgeColors[m.type] || movementBadgeColors.adjustment;
                      return (
                        <tr key={m.id} className="hover:bg-[#faf7f2] transition-colors">
                          <td className="py-3 px-4 text-[#706c64] text-[11px] whitespace-nowrap">
                            {formatDateTime(m.date)}
                          </td>
                          <td className="py-3 px-4">
                            <span className="font-bold text-[#1c1b18] block truncate max-w-[180px]">
                              {m.productName}
                            </span>
                            {m.sku && <span className="font-mono text-[10px] text-[#706c64]">{m.sku}</span>}
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`inline-block px-2.5 py-0.5 text-[10px] font-bold rounded-full border capitalize ${badge.bg} ${badge.text} ${badge.border}`}
                            >
                              {m.type.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold">
                            <span
                              className={m.quantity > 0 ? 'text-[#059669]' : 'text-[#be123c]'}
                            >
                              {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-[#1c1b18]">
                            <span className="text-[#8a857b] text-[10px]">{m.prevStock} → </span>
                            <span className="font-bold">{m.newStock}</span>
                          </td>
                          <td className="py-3 px-4 text-[#4a4741]">
                            <p className="truncate max-w-[240px]">{m.reason || '—'}</p>
                            {m.referenceId && (
                              <span className="text-[10px] font-mono text-[#8a857b] block truncate">
                                Ref: {m.referenceId}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: LOW STOCK ALERTS */}
      {activeTab === 'lowStock' && (
        <div className="space-y-4">
          {lowStockProducts.length === 0 ? (
            <div className="p-12 text-center bg-white border border-[#e9e4dc] rounded-2xl shadow-2xs">
              <div className="w-10 h-10 rounded-full bg-[#ecfdf5] text-[#059669] flex items-center justify-center mx-auto mb-2 font-bold">
                ✓
              </div>
              <h3 className="text-sm font-bold text-[#1c1b18]">All Stock Levels Optimal</h3>
              <p className="text-xs text-[#706c64] mt-1 max-w-sm mx-auto">
                No products are currently under their configured minimum stock thresholds.
              </p>
            </div>
          ) : (
            <div className="bg-white border border-[#e9e4dc] rounded-2xl overflow-hidden shadow-2xs">
              <div className="p-3 bg-[#fffbeb] border-b border-[#fde68a] flex items-center justify-between text-xs">
                <span className="text-[#92400e] font-semibold">
                  {lowStockProducts.length} items require replenishment attention
                </span>
              </div>
              <table className="w-full text-left text-xs">
                <thead className="bg-[#f8f5ee] border-b border-[#e9e4dc] text-[#706c64] font-semibold">
                  <tr>
                    <th className="py-3 px-4">Product Name</th>
                    <th className="py-3 px-4">SKU</th>
                    <th className="py-3 px-4 text-right">Available Stock</th>
                    <th className="py-3 px-4 text-right">Minimum Threshold</th>
                    <th className="py-3 px-4">Supplier</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f0ede6]">
                  {lowStockProducts.map((p) => (
                    <tr key={p.id} className="hover:bg-[#faf7f2]">
                      <td className="py-3 px-4 font-bold text-[#1c1b18]">{p.name}</td>
                      <td className="py-3 px-4 font-mono text-[#706c64]">{p.sku}</td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-[#b45309] text-sm">
                        {p.currentStock} {p.unit}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-[#706c64]">
                        {p.minStockLevel} {p.unit}
                      </td>
                      <td className="py-3 px-4 text-[#706c64]">{getSupplierDisplayName(p.supplierName)}</td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => setRestockingProduct(p)}
                          className="px-3 py-1.5 text-xs font-semibold text-white bg-[#23424d] hover:bg-[#1a323b] rounded-lg transition-colors cursor-pointer shadow-xs"
                        >
                          Restock
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Restock Adjustment Modal */}
      {adjustingProduct && (
        <StockAdjustModal
          isOpen={!!adjustingProduct}
          onClose={() => setAdjustingProduct(null)}
          product={adjustingProduct}
          onSaved={refreshAll}
        />
      )}

      <RestockModal
        isOpen={!!restockingProduct}
        onClose={() => setRestockingProduct(null)}
        product={restockingProduct}
        suppliers={suppliers}
        currencySymbol={settings.currencySymbol}
        onSaved={refreshAll}
      />
    </div>
  );
};
