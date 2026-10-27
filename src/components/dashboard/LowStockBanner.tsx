import React from 'react';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { useBusiness } from '../../context/BusinessContext';
import { ActiveTab } from '../layout/Sidebar';

interface LowStockBannerProps {
  setActiveTab: (tab: ActiveTab) => void;
}

export const LowStockBanner: React.FC<LowStockBannerProps> = ({ setActiveTab }) => {
  const { lowStockProducts } = useBusiness();

  if (lowStockProducts.length === 0) return null;

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-[#fffbeb] border border-[#fde68a] rounded-2xl mb-4 shadow-2xs">
      <div className="flex items-start sm:items-center gap-3">
        <div className="p-2 rounded-xl bg-[#fef3c7] text-[#b45309] shrink-0">
          <AlertTriangle className="w-5 h-5" />
        </div>
        <div>
          <h4 className="text-xs sm:text-sm font-bold text-[#92400e]">
            {lowStockProducts.length} Product{lowStockProducts.length > 1 ? 's' : ''} Running Low on Stock
          </h4>
          <p className="text-xs text-[#b45309] mt-0.5">
            {lowStockProducts.map((p) => `${p.name} (${p.currentStock} left)`).slice(0, 3).join(', ')}
            {lowStockProducts.length > 3 ? ` and ${lowStockProducts.length - 3} more...` : ''}
          </p>
        </div>
      </div>
      <button
        onClick={() => setActiveTab('inventory')}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-[#b45309] hover:bg-[#92400e] rounded-lg shrink-0 transition-colors cursor-pointer self-start sm:self-auto shadow-xs"
      >
        <span>Manage Inventory</span>
        <ArrowRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
