import React from 'react';
import { KPICards } from './KPICards';
import { SalesChart } from './SalesChart';
import { OrderStatusChart } from './OrderStatusChart';
import { TopProducts } from './TopProducts';
import { RecentOrders } from './RecentOrders';
import { LowStockBanner } from './LowStockBanner';
import { ActiveTab } from '../layout/Sidebar';

interface DashboardViewProps {
  setActiveTab: (tab: ActiveTab) => void;
  onSelectOrder: (orderId: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  setActiveTab,
  onSelectOrder,
}) => {
  return (
    <div className="space-y-4">
      {/* Low Stock Attention Banner */}
      <LowStockBanner setActiveTab={setActiveTab} />

      {/* KPI Cards Grid */}
      <KPICards setActiveTab={setActiveTab} />

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <SalesChart />
        </div>
        <div className="lg:col-span-1">
          <OrderStatusChart />
        </div>
      </div>

      {/* Tables Grid: Top Products & Recent Orders */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TopProducts setActiveTab={setActiveTab} />
        <RecentOrders setActiveTab={setActiveTab} onSelectOrder={onSelectOrder} />
      </div>
    </div>
  );
};
