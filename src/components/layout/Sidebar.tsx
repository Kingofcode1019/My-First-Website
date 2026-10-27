import React from 'react';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Layers,
  Users,
  Truck,
  Wallet,
  FileBarChart2,
  TrendingUp,
  Settings,
  Sparkles,
  Boxes,
} from 'lucide-react';
import { useBusiness } from '../../context/BusinessContext';

export type ActiveTab =
  | 'dashboard'
  | 'orders'
  | 'products'
  | 'inventory'
  | 'customers'
  | 'suppliers'
  | 'finance'
  | 'reports'
  | 'analytics'
  | 'settings';

interface SidebarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  openAI: () => void;
  isMobileOpen: boolean;
  setIsMobileOpen: (open: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  openAI,
  isMobileOpen,
  setIsMobileOpen,
}) => {
  const { lowStockProducts, settings } = useBusiness();

  const navItems: { id: ActiveTab; label: string; icon: React.ComponentType<{ className?: string }>; badge?: number }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'orders', label: 'Orders', icon: ShoppingCart },
    { id: 'products', label: 'Products', icon: Package },
    {
      id: 'inventory',
      label: 'Inventory',
      icon: Layers,
      badge: lowStockProducts.length > 0 ? lowStockProducts.length : undefined,
    },
    { id: 'customers', label: 'Customers', icon: Users },
    { id: 'suppliers', label: 'Suppliers', icon: Truck },
    { id: 'finance', label: 'Finance & Wallets', icon: Wallet },
    { id: 'reports', label: 'Reports', icon: FileBarChart2 },
    { id: 'analytics', label: 'Analytics', icon: TrendingUp },
    { id: 'settings', label: 'Settings & Workspace', icon: Settings },
  ];

  const handleSelect = (tab: ActiveTab) => {
    setActiveTab(tab);
    setIsMobileOpen(false);
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobileOpen && (
        <div
          onClick={() => setIsMobileOpen(false)}
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs md:hidden"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-40 w-64 bg-[#f6f3eb] border-r border-[#e7e1d5] flex flex-col transition-transform duration-200 ease-in-out md:translate-x-0 ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="flex items-center gap-3 px-6 h-16 border-b border-[#e7e1d5] bg-[#f8f5ee]">
          <div className="p-2 bg-[#23424d] rounded-xl text-white shadow-xs">
            <Boxes className="w-5 h-5" />
          </div>
          <div className="overflow-hidden">
            <h1 className="text-sm font-bold text-[#1c1b18] tracking-tight truncate">
              Business Manager
            </h1>
            <p className="text-[10px] text-[#c85a32] font-semibold truncate">
              Business Operations
            </p>
          </div>
        </div>

        {/* Navigation Links */}
        <div className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-[#8a857b]">
            Workspace Navigation
          </div>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleSelect(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 text-xs font-semibold rounded-xl transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-[#eae3d5] text-[#1c1b18] shadow-2xs'
                    : 'text-[#67635b] hover:text-[#1c1b18] hover:bg-[#efe9dd]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-[#23424d]' : 'text-[#8a857b]'}`} />
                  <span>{item.label}</span>
                </div>
                {item.badge !== undefined && (
                  <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-[#fef3c7] text-[#92400e] border border-[#fde68a]">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* AI Assistant Banner */}
        <div className="p-3 border-t border-[#e7e1d5]">
          <button
            onClick={() => {
              openAI();
              setIsMobileOpen(false);
            }}
            className="w-full flex items-center justify-between p-3 rounded-xl bg-white border border-[#e5dfd2] hover:border-[#23424d]/40 text-left transition-all cursor-pointer shadow-xs group"
          >
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-[#f0ede4] text-[#23424d] group-hover:bg-[#23424d] group-hover:text-white transition-colors">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-[#1c1b18]">Apex AI Assistant</p>
                <p className="text-[10px] text-[#706c64]">Natural language queries</p>
              </div>
            </div>
          </button>
        </div>
      </aside>
    </>
  );
};
