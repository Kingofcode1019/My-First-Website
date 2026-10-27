import React, { useState, useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { useBusiness } from '../../context/BusinessContext';
import { formatCurrency } from '../../lib/utils';

type TimeRange = 'today' | '7d' | '30d' | '3m' | '12m';

export const SalesChart: React.FC = () => {
  const { orders, settings } = useBusiness();
  const [range, setRange] = useState<TimeRange>('30d');

  const chartData = useMemo(() => {
    const now = new Date();
    const deliveredOrders = orders.filter((o) => o.orderStatus === 'delivered');

    let buckets: { label: string; dateStart: Date; revenue: number; profit: number }[] = [];

    if (range === 'today') {
      for (let i = 0; i < 24; i += 4) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), i, 0, 0);
        buckets.push({
          label: `${i.toString().padStart(2, '0')}:00`,
          dateStart: d,
          revenue: 0,
          profit: 0,
        });
      }
    } else if (range === '7d') {
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        d.setHours(0, 0, 0, 0);
        buckets.push({
          label: d.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' }),
          dateStart: d,
          revenue: 0,
          profit: 0,
        });
      }
    } else if (range === '30d') {
      for (let i = 29; i >= 0; i -= 3) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        d.setHours(0, 0, 0, 0);
        buckets.push({
          label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          dateStart: d,
          revenue: 0,
          profit: 0,
        });
      }
    } else if (range === '3m') {
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i * 7);
        d.setHours(0, 0, 0, 0);
        buckets.push({
          label: `W-${12 - i}`,
          dateStart: d,
          revenue: 0,
          profit: 0,
        });
      }
    } else {
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        buckets.push({
          label: d.toLocaleDateString('en-US', { month: 'short' }),
          dateStart: d,
          revenue: 0,
          profit: 0,
        });
      }
    }

    deliveredOrders.forEach((o) => {
      const oDate = new Date(o.deliveredDate || o.orderDate);
      const cogs = o.items.reduce((s, it) => s + (it.purchasePrice || 0) * (it.quantity || 0), 0);
      const productRevenue = Math.max(0, (o.subtotal || 0) - (o.discount || 0));
      const profit = productRevenue - cogs;

      for (let i = buckets.length - 1; i >= 0; i--) {
        if (oDate >= buckets[i].dateStart) {
          buckets[i].revenue += productRevenue;
          buckets[i].profit += profit;
          break;
        }
      }
    });

    return buckets;
  }, [orders, range]);

  return (
    <div className="p-5 bg-white border border-[#e9e4dc] rounded-2xl shadow-2xs flex flex-col h-full">
      {/* Header with Title and Range Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="text-sm font-bold text-[#1c1b18]">Sales & Gross Profit Over Time</h3>
          <p className="text-xs text-[#706c64] mt-0.5">Delivered order revenue vs product gross profit</p>
        </div>

        {/* Timeframe Buttons */}
        <div className="flex items-center gap-1 p-1 bg-[#f4efe6] border border-[#e2dcd0] rounded-xl shrink-0">
          {(['today', '7d', '30d', '3m', '12m'] as TimeRange[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                range === r
                  ? 'bg-white text-[#1c1b18] shadow-2xs'
                  : 'text-[#706c64] hover:text-[#1c1b18]'
              }`}
            >
              {r === 'today' ? 'Today' : r.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Chart Canvas */}
      <div className="flex-1 w-full min-h-[240px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#059669" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#059669" stopOpacity={0.0} />
              </linearGradient>
              <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#23424d" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#23424d" stopOpacity={0.0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#eee8df" vertical={false} />
            <XAxis
              dataKey="label"
              stroke="#8a857b"
              fontSize={11}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="#8a857b"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${settings.currencySymbol}${v}`}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (active && payload && payload.length) {
                  return (
                    <div className="bg-white border border-[#e9e4dc] rounded-xl p-3 shadow-xl text-xs space-y-1">
                      <p className="font-bold text-[#1c1b18] mb-1.5">{label}</p>
                      <p className="text-[#059669] flex items-center justify-between gap-4 font-medium">
                        <span>Revenue:</span>
                        <span className="font-mono font-bold">
                          {formatCurrency(Number(payload[0]?.value) || 0, settings.currencySymbol)}
                        </span>
                      </p>
                      <p className="text-[#23424d] flex items-center justify-between gap-4 font-medium">
                        <span>Gross Profit:</span>
                        <span className="font-mono font-bold">
                          {formatCurrency(Number(payload[1]?.value) || 0, settings.currencySymbol)}
                        </span>
                      </p>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Area
              type="monotone"
              dataKey="revenue"
              stroke="#059669"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#revenueGrad)"
              name="Revenue"
            />
            <Area
              type="monotone"
              dataKey="profit"
              stroke="#23424d"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#profitGrad)"
              name="Gross Profit"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
