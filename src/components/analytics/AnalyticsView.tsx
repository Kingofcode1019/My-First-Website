import React, { useMemo } from 'react';
import { useBusiness } from '../../context/BusinessContext';
import { formatCurrency } from '../../lib/utils';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { TrendingUp, AlertTriangle, CheckCircle, RotateCcw } from 'lucide-react';

const COLORS = ['#23424d', '#c85a32', '#047857', '#0e7490', '#b45309', '#6d28d9', '#be123c'];

export const AnalyticsView: React.FC = () => {
  const { orders, products, transactions, settings } = useBusiness();

  // Category sales distribution
  const categoryData = useMemo(() => {
    const catRevenue: Record<string, number> = {};
    orders
      .filter((o) => o.orderStatus === 'delivered')
      .forEach((o) => {
        o.items.forEach((it) => {
          const prod = products.find((p) => p.id === it.productId);
          const cat = prod?.category || 'General';
          catRevenue[cat] = (catRevenue[cat] || 0) + it.total;
        });
      });

    return Object.entries(catRevenue).map(([name, value]) => ({ name, value }));
  }, [orders, products]);

  // Operational conversion rates
  const rates = useMemo(() => {
    const total = orders.length;
    if (total === 0) {
      return { deliveryRate: '0', returnRate: '0', cancellationRate: '0' };
    }
    const delivered = orders.filter((o) => o.orderStatus === 'delivered').length;
    const returned = orders.filter((o) => o.orderStatus === 'returned').length;
    const cancelled = orders.filter((o) => o.orderStatus === 'cancelled').length;

    return {
      deliveryRate: ((delivered / total) * 100).toFixed(1),
      returnRate: ((returned / total) * 100).toFixed(1),
      cancellationRate: ((cancelled / total) * 100).toFixed(1),
    };
  }, [orders]);

  // Monthly product revenue vs expense breakdown (last 6 months)
  const monthlyComparison = useMemo(() => {
    const now = new Date();
    const months: { month: string; revenue: number; expense: number }[] = [];

    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mName = d.toLocaleDateString('en-US', { month: 'short' });
      months.push({ month: mName, revenue: 0, expense: 0 });
    }

    // Populate revenue
    orders
      .filter((o) => o.orderStatus === 'delivered')
      .forEach((o) => {
        const d = new Date(o.deliveredDate || o.orderDate);
        const mName = d.toLocaleDateString('en-US', { month: 'short' });
        const target = months.find((m) => m.month === mName);
        if (target) {
          target.revenue += Math.max(0, (o.subtotal || 0) - (o.discount || 0));
        }
      });

    // Populate expenses
    transactions
      .filter((t) => t.type === 'expense' || t.type === 'purchase' || t.type === 'asset')
      .forEach((t) => {
        const d = new Date(t.date);
        const mName = d.toLocaleDateString('en-US', { month: 'short' });
        const target = months.find((m) => m.month === mName);
        if (target) {
          target.expense += t.amount;
        }
      });

    return months;
  }, [orders, transactions]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-[#1c1b18] tracking-tight">Business Analytics & Health</h2>
        <p className="text-xs text-[#706c64] mt-0.5">
          In-depth fulfillment efficiencies, return ratios, and category performance
        </p>
      </div>

      {/* Operational KPI Ratio Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-4 bg-white border border-[#e9e4dc] rounded-2xl shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-xs text-[#706c64] font-medium">Order Delivery Success Rate</span>
            <p className="text-2xl font-bold font-mono text-[#047857] mt-1">
              {rates.deliveryRate}%
            </p>
            <span className="text-[11px] text-[#8a857b]">Delivered / Total Orders</span>
          </div>
          <div className="p-2.5 rounded-xl bg-[#ecfdf5] text-[#047857]">
            <CheckCircle className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 bg-white border border-[#e9e4dc] rounded-2xl shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-xs text-[#706c64] font-medium">Return Rate</span>
            <p
              className={`text-2xl font-bold font-mono mt-1 ${
                Number(rates.returnRate) > 10 ? 'text-[#be185d]' : 'text-[#1c1b18]'
              }`}
            >
              {rates.returnRate}%
            </p>
            <span className="text-[11px] text-[#8a857b]">Returned / Total Orders</span>
          </div>
          <div className="p-2.5 rounded-xl bg-[#fdf2f8] text-[#be185d]">
            <RotateCcw className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 bg-white border border-[#e9e4dc] rounded-2xl shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-xs text-[#706c64] font-medium">Cancellation Rate</span>
            <p
              className={`text-2xl font-bold font-mono mt-1 ${
                Number(rates.cancellationRate) > 10 ? 'text-[#b45309]' : 'text-[#1c1b18]'
              }`}
            >
              {rates.cancellationRate}%
            </p>
            <span className="text-[11px] text-[#8a857b]">Cancelled / Total Orders</span>
          </div>
          <div className="p-2.5 rounded-xl bg-[#fffbeb] text-[#b45309]">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Main Charts: Revenue vs Expenses & Category Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Revenue vs Outlay Bar Chart */}
        <div className="p-5 bg-white border border-[#e9e4dc] rounded-2xl shadow-2xs flex flex-col h-[320px]">
          <h3 className="text-sm font-bold text-[#1c1b18] mb-0.5">
            Product Revenue vs. Total Outlay (Last 6 Months)
          </h3>
          <p className="text-xs text-[#706c64] mb-3">Comparing sales inflow against operational expenses & purchases</p>

          <div className="flex-1 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyComparison} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e9e4dc" vertical={false} />
                <XAxis dataKey="month" stroke="#8a857b" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#8a857b" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-white border border-[#d8d3c9] rounded-xl p-2.5 shadow-xl text-xs space-y-1">
                          <p className="font-bold text-[#1c1b18]">{label}</p>
                          <p className="text-[#047857]">
                            Product Revenue: {formatCurrency(Number(payload[0]?.value) || 0, settings.currencySymbol)}
                          </p>
                          <p className="text-[#be123c]">
                            Expenses: {formatCurrency(Number(payload[1]?.value) || 0, settings.currencySymbol)}
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                <Bar dataKey="revenue" fill="#047857" name="Product Revenue" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expense" fill="#be123c" name="Expenses & Purchases" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Category Performance Donut */}
        <div className="p-5 bg-white border border-[#e9e4dc] rounded-2xl shadow-2xs flex flex-col h-[320px]">
          <h3 className="text-sm font-bold text-[#1c1b18] mb-0.5">
            Delivered Product Sales by Category
          </h3>
          <p className="text-xs text-[#706c64] mb-3">Which product categories drive the most commercial value</p>

          {categoryData.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-xs text-[#706c64]">
              No delivered order sales to categorize yet.
            </div>
          ) : (
            <div className="flex-1 flex flex-col sm:flex-row items-center justify-center gap-4">
              <div className="w-48 h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryData}
                      innerRadius={50}
                      outerRadius={75}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {categoryData.map((_, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={COLORS[index % COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(val: any) => formatCurrency(Number(val) || 0, settings.currencySymbol)}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="space-y-1.5 text-xs max-h-48 overflow-y-auto pr-2">
                {categoryData.map((cat, idx) => (
                  <div key={cat.name} className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                    />
                    <span className="text-[#4a4741] truncate max-w-[120px]">{cat.name}:</span>
                    <span className="font-mono font-bold text-[#1c1b18] ml-auto">
                      {formatCurrency(cat.value, settings.currencySymbol)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
