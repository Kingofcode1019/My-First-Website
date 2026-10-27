import React from 'react';
import { useBusiness } from '../../context/BusinessContext';
import { formatCurrency } from '../../lib/utils';
import { Package } from 'lucide-react';
import { ActiveTab } from '../layout/Sidebar';

interface TopProductsProps {
  setActiveTab: (tab: ActiveTab) => void;
}

export const TopProducts: React.FC<TopProductsProps> = ({ setActiveTab }) => {
  const { products, orders, settings } = useBusiness();

  const topProducts = React.useMemo(() => {
    const productStats: Record<string, { product: any; unitsSold: number; revenue: number }> = {};

    products.forEach((p) => {
      productStats[p.id] = { product: p, unitsSold: 0, revenue: 0 };
    });

    orders
      .filter((o) => o.orderStatus === 'delivered')
      .forEach((o) => {
        o.items.forEach((item) => {
          if (productStats[item.productId]) {
            productStats[item.productId].unitsSold += item.quantity;
            productStats[item.productId].revenue += item.total;
          }
        });
      });

    return Object.values(productStats)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);
  }, [products, orders]);

  return (
    <div className="p-5 bg-white border border-[#e9e4dc] rounded-2xl shadow-2xs flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-bold text-[#1c1b18]">Top Performing Products</h3>
          <p className="text-xs text-[#706c64] mt-0.5">Ranked by delivered customer revenue</p>
        </div>
        <button
          onClick={() => setActiveTab('products')}
          className="text-xs font-semibold text-[#23424d] hover:text-[#c85a32] transition-colors cursor-pointer"
        >
          View all
        </button>
      </div>

      {topProducts.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-6 text-[#8a857b] text-xs">
          <Package className="w-8 h-8 mb-2 opacity-50" />
          No sales recorded yet.
        </div>
      ) : (
        <div className="space-y-3 flex-1 overflow-y-auto">
          {topProducts.map((item, idx) => (
            <div
              key={item.product.id}
              className="flex items-center justify-between p-2.5 rounded-xl bg-[#faf8f5] border border-[#e9e4dc] hover:border-[#23424d]/30 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono font-bold text-[#8a857b] w-4 text-center">
                  #{idx + 1}
                </span>
                <div className="w-9 h-9 rounded-lg bg-[#ede8de] border border-[#ddd7cc] overflow-hidden shrink-0 flex items-center justify-center text-[#706c64]">
                  {item.product.imageUrl ? (
                    <img
                      src={item.product.imageUrl}
                      alt={item.product.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Package className="w-4 h-4" />
                  )}
                </div>
                <div>
                  <p className="text-xs font-bold text-[#1c1b18] truncate max-w-[140px] sm:max-w-[200px]">
                    {item.product.name}
                  </p>
                  <p className="text-[11px] text-[#706c64]">
                    {item.unitsSold} units sold · Stock: {item.product.currentStock} {item.product.unit}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs font-bold font-mono text-[#059669]">
                  {formatCurrency(item.revenue, settings.currencySymbol)}
                </p>
                <p className="text-[10px] text-[#8a857b]">Delivered</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
