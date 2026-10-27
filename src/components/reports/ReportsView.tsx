import React, { useState, useMemo } from 'react';
import { useBusiness } from '../../context/BusinessContext';
import { formatCurrency, formatDate, exportToCSV } from '../../lib/utils';
import { isOperatingExpenseTransaction } from '../../lib/financeCategories';
import {
  FileBarChart2,
  Download,
  DollarSign,
  TrendingUp,
  Package,
  Users,
  CreditCard,
} from 'lucide-react';

type ReportType = 'sales' | 'profit' | 'inventory' | 'customer' | 'expenses';
type ReportTimeRange = 'all' | '30d' | 'thisMonth' | 'lastMonth' | 'thisYear' | 'custom';

export const ReportsView: React.FC = () => {
  const { orders, products, customers, transactions, settings } = useBusiness();
  const [activeReport, setActiveReport] = useState<ReportType>('sales');
  const [timeRange, setTimeRange] = useState<ReportTimeRange>('30d');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [timelineCustomerId, setTimelineCustomerId] = useState('');

  // Filter orders and transactions by time range
  const filteredData = useMemo(() => {
    const now = new Date();
    let startTimestamp = 0;
    let endTimestamp = now.getTime() + 1;

    if (timeRange === '30d') {
      const d = new Date(now);
      d.setDate(d.getDate() - 30);
      startTimestamp = d.getTime();
    } else if (timeRange === 'thisMonth') {
      const d = new Date(now.getFullYear(), now.getMonth(), 1);
      startTimestamp = d.getTime();
      endTimestamp = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
    } else if (timeRange === 'lastMonth') {
      const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      startTimestamp = d.getTime();
      endTimestamp = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    } else if (timeRange === 'thisYear') {
      startTimestamp = new Date(now.getFullYear(), 0, 1).getTime();
      endTimestamp = new Date(now.getFullYear() + 1, 0, 1).getTime();
    } else if (timeRange === 'custom') {
      if (customStartDate) {
        startTimestamp = new Date(`${customStartDate}T00:00:00`).getTime();
      }
      if (customEndDate) {
        endTimestamp = new Date(`${customEndDate}T00:00:00`).getTime() + 86400000;
      }
    }

    const filteredOrders = orders.filter((o) => {
      if (timeRange === 'all') return true;
      const recognizedAt = new Date(o.deliveredDate || o.orderDate).getTime();
      return recognizedAt >= startTimestamp && recognizedAt < endTimestamp;
    });

    const filteredTx = transactions.filter((t) => {
      if (timeRange === 'all') return true;
      const transactionDate = new Date(t.date).getTime();
      return transactionDate >= startTimestamp && transactionDate < endTimestamp;
    });

    return { filteredOrders, filteredTx };
  }, [orders, transactions, timeRange, customStartDate, customEndDate]);

  // Sales Report Calculations
  const salesStats = useMemo(() => {
    const delivered = filteredData.filteredOrders.filter((o) => o.orderStatus === 'delivered');
    const totalSales = delivered.reduce(
      (sum, order) => sum + Math.max(0, (order.subtotal || 0) - (order.discount || 0)),
      0
    );
    const orderCount = delivered.length;
    const avgOrderValue = orderCount > 0 ? totalSales / orderCount : 0;

    // By product
    const productMap: Record<string, { name: string; sku: string; units: number; revenue: number }> = {};
    delivered.forEach((o) => {
      o.items.forEach((it) => {
        if (!productMap[it.productId]) {
          productMap[it.productId] = { name: it.productName, sku: it.sku, units: 0, revenue: 0 };
        }
        productMap[it.productId].units += it.quantity;
        productMap[it.productId].revenue += it.total;
      });
    });

    return {
      totalSales,
      orderCount,
      avgOrderValue,
      productSales: Object.values(productMap).sort((a, b) => b.revenue - a.revenue),
    };
  }, [filteredData]);

  // Profit Report Calculations
  const profitStats = useMemo(() => {
    const delivered = filteredData.filteredOrders.filter((o) => o.orderStatus === 'delivered');
    const revenue = delivered.reduce(
      (sum, order) => sum + Math.max(0, (order.subtotal || 0) - (order.discount || 0)),
      0
    );
    const cogs = delivered.reduce((s, o) => {
      return s + o.items.reduce((sum, it) => sum + (it.purchasePrice || 0) * (it.quantity || 0), 0);
    }, 0);
    const grossProfit = revenue - cogs;
    const expenses = filteredData.filteredTx
      .filter(isOperatingExpenseTransaction)
      .reduce((s, t) => s + t.amount, 0);
    const netProfit = grossProfit - expenses;
    const margin = revenue > 0 ? ((netProfit / revenue) * 100).toFixed(1) : '0';

    return { revenue, cogs, grossProfit, expenses, netProfit, margin };
  }, [filteredData]);

  // Inventory Report Calculations
  const inventoryStats = useMemo(() => {
    const active = products.filter((p) => p.status !== 'archived');
    const totalItems = active.length;
    const totalUnits = active.reduce((s, p) => s + p.currentStock, 0);
    const totalCostValue = active.reduce((s, p) => s + p.currentStock * (p.purchasePrice || 0), 0);
    const lowStock = active.filter((p) => p.currentStock <= p.minStockLevel && p.currentStock > 0);
    const outOfStock = active.filter((p) => p.currentStock === 0);

    return { totalItems, totalUnits, totalCostValue, lowStock, outOfStock, items: active };
  }, [products]);

  // Customer Report Calculations
  const customerStats = useMemo(() => {
    const total = customers.length;
    const repeat = customers.filter((c) => c.totalOrders > 1).length;
    const newCust = total - repeat;
    const sortedBySpend = [...customers].sort((a, b) => (b.ltv || b.totalSpent) - (a.ltv || a.totalSpent));

    return { total, repeat, newCust, topCustomers: sortedBySpend.slice(0, 10) };
  }, [customers]);

  const timelineOrders = useMemo(
    () =>
      filteredData.filteredOrders
        .filter((order) => order.customerId === timelineCustomerId)
        .sort((a, b) => new Date(a.orderDate).getTime() - new Date(b.orderDate).getTime()),
    [filteredData.filteredOrders, timelineCustomerId]
  );

  // Expense Report Calculations
  const expenseStats = useMemo(() => {
    const expenses = filteredData.filteredTx.filter((transaction) => transaction.type === 'expense');
    const total = expenses.reduce((s, t) => s + t.amount, 0);
    const byCategoryMap: Record<string, number> = {};
    expenses.forEach((t) => {
      const category = t.category || 'Uncategorized';
      byCategoryMap[category] = (byCategoryMap[category] || 0) + t.amount;
    });

    return { total, byCategory: Object.entries(byCategoryMap).sort((a, b) => b[1] - a[1]) };
  }, [filteredData]);

  // Export handlers
  const handleExport = () => {
    const dateStr = new Date().toISOString().slice(0, 10);
    if (activeReport === 'sales') {
      const headers = ['Product Name', 'SKU', 'Units Sold', 'Total Revenue'];
      const rows = salesStats.productSales.map((p) => [p.name, p.sku, p.units, p.revenue]);
      exportToCSV(`sales_report_${dateStr}`, headers, rows);
    } else if (activeReport === 'profit') {
      const headers = ['Metric', 'Amount'];
      const rows = [
        ['Delivered Product Revenue (Delivery Excluded)', profitStats.revenue],
        ['Cost of Goods Sold (COGS)', profitStats.cogs],
        ['Gross Profit', profitStats.grossProfit],
        ['Operating Expenses', profitStats.expenses],
        ['Net Profit', profitStats.netProfit],
        ['Net Margin (%)', `${profitStats.margin}%`],
      ];
      exportToCSV(`profit_report_${dateStr}`, headers, rows);
    } else if (activeReport === 'inventory') {
      const headers = ['Product', 'SKU', 'Category', 'Stock', 'Min Level', 'Cost Price', 'Total Valuation'];
      const rows = inventoryStats.items.map((p) => [
        p.name,
        p.sku,
        p.category,
        p.currentStock,
        p.minStockLevel,
        p.purchasePrice,
        p.currentStock * p.purchasePrice,
      ]);
      exportToCSV(`inventory_report_${dateStr}`, headers, rows);
    } else if (activeReport === 'customer') {
      const headers = ['Customer Name', 'Phone', 'Total Orders', 'Delivered Orders', 'Lifetime Value'];
      const rows = customerStats.topCustomers.map((c) => [
        c.name,
        c.phone,
        c.totalOrders,
        c.deliveredOrders,
        c.ltv || c.totalSpent,
      ]);
      exportToCSV(`customer_report_${dateStr}`, headers, rows);
    } else if (activeReport === 'expenses') {
      const headers = ['Category', 'Total Outlay'];
      const rows = expenseStats.byCategory.map(([cat, amt]) => [cat, amt]);
      exportToCSV(`expenses_report_${dateStr}`, headers, rows);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[#1c1b18] tracking-tight">Business Reports & Audits</h2>
          <p className="text-xs text-[#706c64] mt-0.5">
            Exportable business intelligence, profit & loss, inventory valuation, and customer retention
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {/* Timeframe Filter */}
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as ReportTimeRange)}
            className="px-2.5 py-1.5 bg-white border border-[#d8d3c9] rounded-lg text-xs text-[#1c1b18] focus:outline-none focus:border-[#23424d]"
            aria-label="Filter reports by date"
          >
            <option value="30d">Last 30 Days</option>
            <option value="thisMonth">This Calendar Month</option>
            <option value="lastMonth">Last Calendar Month</option>
            <option value="thisYear">This Year</option>
            <option value="custom">Custom Date Range</option>
            <option value="all">All-Time History</option>
          </select>

          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#23424d] hover:bg-[#1a323b] rounded-lg shadow-xs transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download CSV</span>
          </button>
        </div>
      </div>
      {timeRange === 'custom' && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <label className="flex items-center gap-2 text-[11px] text-[#706c64]">
            From
            <input
              type="date"
              value={customStartDate}
              max={customEndDate || undefined}
              onChange={(event) => setCustomStartDate(event.target.value)}
              className="px-2 py-1.5 bg-white border border-[#d8d3c9] rounded-lg text-xs text-[#1c1b18]"
            />
          </label>
          <label className="flex items-center gap-2 text-[11px] text-[#706c64]">
            To
            <input
              type="date"
              value={customEndDate}
              min={customStartDate || undefined}
              onChange={(event) => setCustomEndDate(event.target.value)}
              className="px-2 py-1.5 bg-white border border-[#d8d3c9] rounded-lg text-xs text-[#1c1b18]"
            />
          </label>
        </div>
      )}

      {/* Report Type Selector Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
        <button
          onClick={() => setActiveReport('sales')}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg font-semibold transition-colors cursor-pointer ${
            activeReport === 'sales'
              ? 'bg-white text-[#1c1b18] shadow-2xs border border-[#e9e4dc]'
              : 'text-[#706c64] hover:text-[#1c1b18] hover:bg-[#f6f3eb]'
          }`}
        >
          <DollarSign className="w-3.5 h-3.5 text-[#047857]" />
          <span>Sales Report</span>
        </button>

        <button
          onClick={() => setActiveReport('profit')}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg font-semibold transition-colors cursor-pointer ${
            activeReport === 'profit'
              ? 'bg-white text-[#1c1b18] shadow-2xs border border-[#e9e4dc]'
              : 'text-[#706c64] hover:text-[#1c1b18] hover:bg-[#f6f3eb]'
          }`}
        >
          <TrendingUp className="w-3.5 h-3.5 text-[#23424d]" />
          <span>Profit & Loss</span>
        </button>

        <button
          onClick={() => setActiveReport('inventory')}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg font-semibold transition-colors cursor-pointer ${
            activeReport === 'inventory'
              ? 'bg-white text-[#1c1b18] shadow-2xs border border-[#e9e4dc]'
              : 'text-[#706c64] hover:text-[#1c1b18] hover:bg-[#f6f3eb]'
          }`}
        >
          <Package className="w-3.5 h-3.5 text-[#0e7490]" />
          <span>Inventory Valuation</span>
        </button>

        <button
          onClick={() => setActiveReport('customer')}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg font-semibold transition-colors cursor-pointer ${
            activeReport === 'customer'
              ? 'bg-white text-[#1c1b18] shadow-2xs border border-[#e9e4dc]'
              : 'text-[#706c64] hover:text-[#1c1b18] hover:bg-[#f6f3eb]'
          }`}
        >
          <Users className="w-3.5 h-3.5 text-[#0284c7]" />
          <span>Customer Retention</span>
        </button>

        <button
          onClick={() => setActiveReport('expenses')}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg font-semibold transition-colors cursor-pointer ${
            activeReport === 'expenses'
              ? 'bg-white text-[#1c1b18] shadow-2xs border border-[#e9e4dc]'
              : 'text-[#706c64] hover:text-[#1c1b18] hover:bg-[#f6f3eb]'
          }`}
        >
          <CreditCard className="w-3.5 h-3.5 text-[#be123c]" />
          <span>Expense Categorization</span>
        </button>
      </div>

      {/* REPORT CONTENT */}
      {/* 1. SALES REPORT */}
      {activeReport === 'sales' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-4 bg-white border border-[#e9e4dc] rounded-2xl shadow-2xs">
              <span className="text-xs text-[#706c64]">Total Net Sales</span>
              <p className="text-2xl font-bold font-mono text-[#047857] mt-1">
                {formatCurrency(salesStats.totalSales, settings.currencySymbol)}
              </p>
              <span className="text-[11px] text-[#8a857b]">Delivered orders</span>
            </div>

            <div className="p-4 bg-white border border-[#e9e4dc] rounded-2xl shadow-2xs">
              <span className="text-xs text-[#706c64]">Completed Orders</span>
              <p className="text-2xl font-bold font-mono text-[#1c1b18] mt-1">
                {salesStats.orderCount}
              </p>
              <span className="text-[11px] text-[#8a857b]">In selected period</span>
            </div>

            <div className="p-4 bg-white border border-[#e9e4dc] rounded-2xl shadow-2xs">
              <span className="text-xs text-[#706c64]">Average Order Value (AOV)</span>
              <p className="text-2xl font-bold font-mono text-[#23424d] mt-1">
                {formatCurrency(salesStats.avgOrderValue, settings.currencySymbol)}
              </p>
              <span className="text-[11px] text-[#8a857b]">Revenue per delivered order</span>
            </div>
          </div>

          <div className="bg-white border border-[#e9e4dc] rounded-2xl overflow-hidden shadow-2xs">
            <div className="p-3.5 bg-[#faf8f5] border-b border-[#e9e4dc] text-xs font-bold text-[#1c1b18]">
              Product-Level Sales Breakdown
            </div>
            <table className="w-full text-left text-xs">
              <thead className="bg-[#faf8f5] text-[#706c64] border-b border-[#e9e4dc]">
                <tr>
                  <th className="py-2.5 px-4">Product Name</th>
                  <th className="py-2.5 px-4">SKU</th>
                  <th className="py-2.5 px-4 text-center">Units Sold</th>
                  <th className="py-2.5 px-4 text-right">Revenue Generated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e9e4dc]">
                {salesStats.productSales.map((p, idx) => (
                  <tr key={idx} className="hover:bg-[#fcfaf7]">
                    <td className="py-2.5 px-4 font-semibold text-[#1c1b18]">{p.name}</td>
                    <td className="py-2.5 px-4 font-mono text-[#706c64]">{p.sku}</td>
                    <td className="py-2.5 px-4 text-center font-mono font-bold text-[#1c1b18]">
                      {p.units}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono font-bold text-[#047857]">
                      {formatCurrency(p.revenue, settings.currencySymbol)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        </div>
      )}

      {/* 2. PROFIT & LOSS */}
      {activeReport === 'profit' && (
        <div className="p-6 bg-white border border-[#e9e4dc] rounded-2xl shadow-2xs max-w-2xl mx-auto space-y-4">
          <h3 className="text-sm font-bold text-[#1c1b18] border-b border-[#e9e4dc] pb-2">
            Statement of Profit & Loss (P&L)
          </h3>
          <div className="space-y-3 text-xs font-mono">
            <div className="flex justify-between items-center py-1.5 border-b border-[#e9e4dc]">
              <span className="text-[#1c1b18] font-bold font-sans">1. Delivered Sales Revenue</span>
              <span className="text-base font-bold text-[#047857]">
                {formatCurrency(profitStats.revenue, settings.currencySymbol)}
              </span>
            </div>

            <div className="flex justify-between items-center py-1.5 border-b border-[#e9e4dc] pl-4 text-[#706c64]">
              <span>Less: Cost of Goods Sold (COGS)</span>
              <span className="text-[#1c1b18]">
                -{formatCurrency(profitStats.cogs, settings.currencySymbol)}
              </span>
            </div>

            <div className="flex justify-between items-center py-2.5 bg-[#f6f3eb] px-3.5 rounded-xl border border-[#e5dfd2] font-bold">
              <span className="text-[#23424d] font-sans">Gross Profit</span>
              <span className="text-[#23424d]">
                {formatCurrency(profitStats.grossProfit, settings.currencySymbol)}
              </span>
            </div>

            <div className="flex justify-between items-center py-1.5 border-b border-[#e9e4dc] pl-4 text-[#706c64]">
              <span>Less: Operating Expenses (Packaging, Marketing, Rent, Salaries)</span>
              <span className="text-[#be123c]">
                -{formatCurrency(profitStats.expenses, settings.currencySymbol)}
              </span>
            </div>

            <div className="flex justify-between items-center py-3.5 bg-[#faf8f5] px-4 rounded-xl border border-[#d8d3c9] text-sm font-bold">
              <span className="text-[#1c1b18] font-sans">Net Operating Profit</span>
              <span
                className={profitStats.netProfit >= 0 ? 'text-[#047857]' : 'text-[#be123c]'}
              >
                {formatCurrency(profitStats.netProfit, settings.currencySymbol)}
              </span>
            </div>

            <div className="text-right text-[#706c64] text-[11px] pt-1">
              Net Profit Margin: <strong className="text-[#1c1b18]">{profitStats.margin}%</strong>
            </div>
          </div>
        </div>
      )}

      {/* 3. INVENTORY VALUATION */}
      {activeReport === 'inventory' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-4 bg-white border border-[#e9e4dc] rounded-2xl shadow-2xs">
              <span className="text-xs text-[#706c64]">Total Asset Valuation</span>
              <p className="text-2xl font-bold font-mono text-[#0e7490] mt-1">
                {formatCurrency(inventoryStats.totalCostValue, settings.currencySymbol)}
              </p>
              <span className="text-[11px] text-[#8a857b]">At purchase cost</span>
            </div>

            <div className="p-4 bg-white border border-[#e9e4dc] rounded-2xl shadow-2xs">
              <span className="text-xs text-[#706c64]">Physical Units Available</span>
              <p className="text-2xl font-bold font-mono text-[#1c1b18] mt-1">
                {inventoryStats.totalUnits}
              </p>
              <span className="text-[11px] text-[#8a857b]">Across {inventoryStats.totalItems} products</span>
            </div>

            <div className="p-4 bg-white border border-[#e9e4dc] rounded-2xl shadow-2xs">
              <span className="text-xs text-[#706c64]">Out of Stock SKU Count</span>
              <p className="text-2xl font-bold font-mono text-[#be123c] mt-1">
                {inventoryStats.outOfStock.length}
              </p>
              <span className="text-[11px] text-[#8a857b]">
                {inventoryStats.lowStock.length} running low
              </span>
            </div>
          </div>

          <div className="bg-white border border-[#e9e4dc] rounded-2xl overflow-hidden shadow-2xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#faf8f5] border-b border-[#e9e4dc] text-[#706c64] font-medium">
                <tr>
                  <th className="py-2.5 px-4">Product Name</th>
                  <th className="py-2.5 px-4">SKU</th>
                  <th className="py-2.5 px-4 text-right">Units</th>
                  <th className="py-2.5 px-4 text-right">Cost Price</th>
                  <th className="py-2.5 px-4 text-right">Selling Price</th>
                  <th className="py-2.5 px-4 text-right">Total Asset Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e9e4dc]">
                {inventoryStats.items.map((p) => (
                  <tr key={p.id} className="hover:bg-[#fcfaf7]">
                    <td className="py-2.5 px-4 font-semibold text-[#1c1b18]">{p.name}</td>
                    <td className="py-2.5 px-4 font-mono text-[#706c64]">{p.sku}</td>
                    <td className="py-2.5 px-4 text-right font-mono font-bold text-[#1c1b18]">
                      {p.currentStock} {p.unit}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-[#706c64]">
                      {formatCurrency(p.purchasePrice, settings.currencySymbol)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-[#1c1b18]">
                      {formatCurrency(p.sellingPrice, settings.currencySymbol)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono font-bold text-[#0e7490]">
                      {formatCurrency(p.currentStock * p.purchasePrice, settings.currencySymbol)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        </div>
      )}

      {/* 4. CUSTOMER REPORT */}
      {activeReport === 'customer' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-4 bg-white border border-[#e9e4dc] rounded-2xl shadow-2xs">
              <span className="text-xs text-[#706c64]">Total Customer Profiles</span>
              <p className="text-2xl font-bold font-mono text-[#1c1b18] mt-1">
                {customerStats.total}
              </p>
            </div>

            <div className="p-4 bg-white border border-[#e9e4dc] rounded-2xl shadow-2xs">
              <span className="text-xs text-[#706c64]">Repeat Customers</span>
              <p className="text-2xl font-bold font-mono text-[#047857] mt-1">
                {customerStats.repeat}
              </p>
              <span className="text-[11px] text-[#8a857b]">Placed 2 or more orders</span>
            </div>

            <div className="p-4 bg-white border border-[#e9e4dc] rounded-2xl shadow-2xs">
              <span className="text-xs text-[#706c64]">Customer Repeat Rate</span>
              <p className="text-2xl font-bold font-mono text-[#23424d] mt-1">
                {customerStats.total > 0
                  ? `${((customerStats.repeat / customerStats.total) * 100).toFixed(1)}%`
                  : '0%'}
              </p>
            </div>
          </div>

          <div className="bg-white border border-[#e9e4dc] rounded-2xl overflow-hidden shadow-2xs">
            <div className="p-3.5 bg-[#faf8f5] border-b border-[#e9e4dc] text-xs font-bold text-[#1c1b18]">
              Top Customers by Lifetime Value (LTV)
            </div>
            <table className="w-full text-left text-xs">
              <thead className="bg-[#faf8f5] text-[#706c64] border-b border-[#e9e4dc]">
                <tr>
                  <th className="py-2.5 px-4">Customer Name</th>
                  <th className="py-2.5 px-4">Phone Number</th>
                  <th className="py-2.5 px-4 text-center">Delivered Orders</th>
                  <th className="py-2.5 px-4 text-right">Lifetime Spend</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e9e4dc]">
                {customerStats.topCustomers.map((c) => (
                  <tr key={c.id} className="hover:bg-[#fcfaf7]">
                    <td className="py-2.5 px-4 font-semibold text-[#1c1b18]">{c.name}</td>
                    <td className="py-2.5 px-4 font-mono text-[#706c64]">{c.phone}</td>
                    <td className="py-2.5 px-4 text-center font-mono font-bold text-[#1c1b18]">
                      {c.deliveredOrders}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono font-bold text-[#047857]">
                      {formatCurrency(c.ltv || c.totalSpent, settings.currencySymbol)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <section className="bg-white border border-[#e9e4dc] rounded-2xl overflow-hidden shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 bg-[#faf8f5] border-b border-[#e9e4dc]">
              <div>
                <h3 className="text-sm font-bold text-[#1c1b18]">Customer Order Timeline</h3>
                <p className="mt-1 text-[11px] text-[#706c64]">Review a customer’s orders in the selected report period.</p>
              </div>
              <select
                value={timelineCustomerId}
                onChange={(event) => setTimelineCustomerId(event.target.value)}
                className="w-full sm:w-auto min-w-56 px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg text-xs text-[#1c1b18]"
                aria-label="Choose a customer for the order timeline"
              >
                <option value="">Select a customer</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name} · {customer.phone}
                  </option>
                ))}
              </select>
            </div>
            {!timelineCustomerId ? (
              <p className="p-5 text-center text-xs text-[#706c64]">Select a customer to view their order history.</p>
            ) : timelineOrders.length === 0 ? (
              <p className="p-5 text-center text-xs text-[#706c64]">No orders for this customer in the selected period.</p>
            ) : (
              <ol className="divide-y divide-[#f0ede6]">
                {timelineOrders.map((order) => (
                  <li key={order.id} className="flex gap-3 p-4">
                    <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-[#23424d]" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-bold text-[#1c1b18]">Order #{order.orderNumber}</p>
                        <span className="text-[11px] text-[#706c64]">{formatDate(order.orderDate)}</span>
                      </div>
                      <p className="mt-1 text-[11px] text-[#706c64]">
                        {order.items.map((item) => `${item.productName} × ${item.quantity}`).join(', ')}
                      </p>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="rounded-full bg-[#f4efe6] px-2 py-0.5 text-[10px] font-semibold capitalize text-[#4a4741]">
                          {order.orderStatus}
                        </span>
                        <span className="font-mono text-xs font-bold text-[#1c1b18]">
                          {formatCurrency(order.totalAmount, settings.currencySymbol)}
                        </span>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      )}

      {/* 5. EXPENSES REPORT */}
      {activeReport === 'expenses' && (
        <div className="space-y-4">
          <div className="p-4 bg-white border border-[#e9e4dc] rounded-2xl shadow-2xs max-w-sm">
            <span className="text-xs text-[#706c64]">Total Period Outflows</span>
            <p className="text-2xl font-bold font-mono text-[#be123c] mt-1">
              {formatCurrency(expenseStats.total, settings.currencySymbol)}
            </p>
          </div>
          <p className="text-xs text-[#706c64]">
            Includes inventory purchase outflows for cash-flow reference. Product purchases are excluded from operating expenses in profit calculations.
          </p>

          <div className="bg-white border border-[#e9e4dc] rounded-2xl overflow-hidden shadow-2xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#faf8f5] border-b border-[#e9e4dc] text-[#706c64] font-medium">
                <tr>
                  <th className="py-2.5 px-4">Expense Category</th>
                  <th className="py-2.5 px-4 text-right">Total Outlay</th>
                  <th className="py-2.5 px-4 text-right">% of Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e9e4dc]">
                {expenseStats.byCategory.map(([cat, amt]) => {
                  const pct =
                    expenseStats.total > 0 ? ((amt / expenseStats.total) * 100).toFixed(1) : '0';
                  return (
                    <tr key={cat} className="hover:bg-[#fcfaf7]">
                      <td className="py-2.5 px-4 font-semibold text-[#1c1b18]">{cat}</td>
                      <td className="py-2.5 px-4 text-right font-mono font-bold text-[#be123c]">
                        {formatCurrency(amt, settings.currencySymbol)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-[#706c64]">{pct}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
