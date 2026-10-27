import React from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { useBusiness } from '../../context/BusinessContext';

const STATUS_COLORS: Record<string, string> = {
  pending: '#d97706',
  confirmed: '#0284c7',
  processing: '#2563eb',
  shipped: '#7c3aed',
  delivered: '#059669',
  returned: '#db2777',
  cancelled: '#e11d48',
};

export const OrderStatusChart: React.FC = () => {
  const { orders } = useBusiness();

  const data = React.useMemo(() => {
    const counts: Record<string, number> = {
      pending: 0,
      processing: 0,
      shipped: 0,
      delivered: 0,
      returned: 0,
      cancelled: 0,
    };

    orders.forEach((o) => {
      const st = o.orderStatus === 'confirmed' ? 'processing' : o.orderStatus;
      if (counts[st] !== undefined) {
        counts[st]++;
      }
    });

    return Object.entries(counts).map(([name, value]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      key: name,
      value,
    }));
  }, [orders]);

  const total = orders.length;

  return (
    <div className="p-5 bg-white border border-[#e9e4dc] rounded-2xl shadow-2xs flex flex-col h-full">
      <div>
        <h3 className="text-sm font-bold text-[#1c1b18]">Order Status Distribution</h3>
        <p className="text-xs text-[#706c64] mt-0.5">Fulfillment pipeline breakdown</p>
      </div>

      <div className="flex-1 flex flex-col sm:flex-row items-center justify-center gap-4 my-2">
        <div className="w-44 h-44 relative">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                innerRadius={50}
                outerRadius={70}
                paddingAngle={4}
                dataKey="value"
              >
                {data.map((entry) => (
                  <Cell
                    key={`cell-${entry.key}`}
                    fill={STATUS_COLORS[entry.key] || '#8a857b'}
                  />
                ))}
              </Pie>
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const item = payload[0];
                    return (
                      <div className="bg-white border border-[#e9e4dc] rounded-xl p-2.5 shadow-xl text-xs">
                        <span className="font-bold text-[#1c1b18]">{item.name}: </span>
                        <span className="font-semibold text-[#4a4741]">{item.value} orders</span>
                      </div>
                    );
                  }
                  return null;
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          {/* Centered counter */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-xl font-bold text-[#1c1b18] tracking-tight">{total}</span>
            <span className="text-[10px] text-[#706c64] uppercase tracking-wider font-semibold">
              Orders
            </span>
          </div>
        </div>

        {/* Legend */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          {data.map((item) => (
            <div key={item.key} className="flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: STATUS_COLORS[item.key] || '#8a857b' }}
              />
              <span className="text-[#4a4741] text-[11px] truncate">{item.name}</span>
              <span className="text-[#1c1b18] font-mono font-bold text-[11px] ml-auto">
                {item.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
