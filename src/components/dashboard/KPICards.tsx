import React from 'react';
import {
  DollarSign,
  TrendingUp,
  CreditCard,
  ShoppingCart,
  Clock,
  RotateCcw,
  Layers,
  AlertTriangle,
} from 'lucide-react';
import { useBusiness } from '../../context/BusinessContext';
import { formatCurrency } from '../../lib/utils';
import { ActiveTab } from '../layout/Sidebar';

interface KPICardsProps {
  setActiveTab: (tab: ActiveTab) => void;
}

export const KPICards: React.FC<KPICardsProps> = ({ setActiveTab }) => {
  const { metrics, settings } = useBusiness();
  const symbol = settings.currencySymbol;

  const cards = [
    {
      label: 'Total Revenue',
      value: formatCurrency(metrics.totalRevenue, symbol),
      subtext: 'From delivered customer orders',
      icon: DollarSign,
      color: 'text-[#047857]',
      bgColor: 'bg-[#ecfdf5] border-[#a7f3d0]',
      tab: 'orders' as ActiveTab,
    },
    {
      label: 'Gross Profit',
      value: formatCurrency(metrics.totalProfit, symbol),
      subtext: 'Product sales less COGS; delivery excluded',
      icon: TrendingUp,
      color: 'text-[#23424d]',
      bgColor: 'bg-[#edf4f6] border-[#cedfe4]',
      tab: 'reports' as ActiveTab,
    },
    {
      label: 'Total Operating Expenses',
      value: formatCurrency(metrics.totalExpenses, symbol),
      subtext: 'Packaging, logistics & outlays',
      icon: CreditCard,
      color: 'text-[#be123c]',
      bgColor: 'bg-[#fff1f2] border-[#fecdd3]',
      tab: 'finance' as ActiveTab,
    },
    {
      label: 'Total Inventory Valuation',
      value: formatCurrency(metrics.totalInventoryValue, symbol),
      subtext: `${metrics.totalProducts} active catalog products`,
      icon: Layers,
      color: 'text-[#0e7490]',
      bgColor: 'bg-[#ecfeff] border-[#a5f3fc]',
      tab: 'inventory' as ActiveTab,
    },
    {
      label: 'Total Orders',
      value: metrics.totalOrders.toString(),
      subtext: `${metrics.deliveredOrders} delivered to date`,
      icon: ShoppingCart,
      color: 'text-[#1c1b18]',
      bgColor: 'bg-[#f4efe6] border-[#e2dcd0]',
      tab: 'orders' as ActiveTab,
    },
    {
      label: 'Pending Orders',
      value: metrics.pendingOrders.toString(),
      subtext: 'Active fulfillment queue',
      icon: Clock,
      color: 'text-[#b45309]',
      bgColor: 'bg-[#fffbeb] border-[#fef3c7]',
      tab: 'orders' as ActiveTab,
    },
    {
      label: 'Returns / Cancelled',
      value: `${metrics.returnedOrders} / ${metrics.cancelledOrders}`,
      subtext: 'Processed return reversals',
      icon: RotateCcw,
      color: 'text-[#c85a32]',
      bgColor: 'bg-[#fbeee8] border-[#f5d9cd]',
      tab: 'orders' as ActiveTab,
    },
    {
      label: 'Low Stock Alerts',
      value: metrics.lowStockProductsCount.toString(),
      subtext: metrics.lowStockProductsCount > 0 ? 'Requires restocking' : 'All stock healthy',
      icon: AlertTriangle,
      color: metrics.lowStockProductsCount > 0 ? 'text-[#b45309]' : 'text-[#047857]',
      bgColor: metrics.lowStockProductsCount > 0 ? 'bg-[#fffbeb] border-[#fef3c7]' : 'bg-[#ecfdf5] border-[#a7f3d0]',
      tab: 'inventory' as ActiveTab,
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      {cards.map((c, i) => {
        const Icon = c.icon;
        return (
          <div
            key={i}
            onClick={() => setActiveTab(c.tab)}
            className="p-4 bg-white border border-[#e9e4dc] rounded-2xl shadow-2xs hover:border-[#23424d]/40 transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-[#706c64] font-medium truncate">{c.label}</span>
              <div className={`p-1.5 rounded-xl border ${c.bgColor} ${c.color}`}>
                <Icon className="w-4 h-4" />
              </div>
            </div>
            <div className="text-xl sm:text-2xl font-bold text-[#1c1b18] tracking-tight">
              {c.value}
            </div>
            <p className="text-[11px] text-[#8a857b] mt-1 truncate">{c.subtext}</p>
          </div>
        );
      })}
    </div>
  );
};
