import React, { useState } from 'react';
import {
  Menu,
  Search,
  Bell,
  Plus,
  LogOut,
  Sparkles,
  AlertTriangle,
  Check,
  HardDrive,
  Settings,
  Cloud,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { ActiveTab } from './Sidebar';

interface HeaderProps {
  setIsMobileOpen: (open: boolean) => void;
  openSearch: () => void;
  openAI: () => void;
  setActiveTab: (tab: ActiveTab) => void;
  onQuickAction: (action: 'newOrder' | 'newProduct' | 'newExpense' | 'newIncome' | 'newPurchase') => void;
  onOpenWorkspaceSetup?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  setIsMobileOpen,
  openSearch,
  openAI,
  setActiveTab,
  onQuickAction,
  onOpenWorkspaceSetup,
}) => {
  const { user, isDirectWorkspace, isCustomConfig, isFirebaseConfigured, storageMode, logout } = useAuth();
  const { settings, lowStockProducts } = useBusiness();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showQuickMenu, setShowQuickMenu] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between h-16 px-4 md:px-8 bg-[#fbf9f6]/90 backdrop-blur-md border-b border-[#e9e4dc]">
      {/* Left: Mobile hamburger & search trigger */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setIsMobileOpen(true)}
          className="p-2 -ml-2 rounded-xl text-[#706c64] hover:text-[#1c1b18] hover:bg-[#eae5dc] md:hidden cursor-pointer"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Global Search Bar Trigger */}
        <button
          onClick={openSearch}
          className="flex items-center gap-2.5 px-3 py-1.5 text-xs text-[#706c64] bg-white hover:bg-[#f7f4ee] hover:text-[#1c1b18] border border-[#d8d3c9] rounded-xl transition-colors cursor-pointer w-44 sm:w-64 shadow-2xs"
        >
          <Search className="w-3.5 h-3.5 text-[#8a857b]" />
          <span className="truncate">Search products, orders...</span>
          <kbd className="hidden sm:inline-block ml-auto text-[10px] text-[#706c64] bg-[#f4efe6] px-1.5 py-0.5 rounded font-mono">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Right: Storage pill, Quick Add, AI, Notifications, User */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Workspace Storage Indicator Pill */}
        <button
          onClick={onOpenWorkspaceSetup}
          title="Click to view storage settings and backups"
          className="hidden md:flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium text-[#4a4741] bg-white hover:bg-[#f7f4ee] border border-[#d8d3c9] rounded-lg transition-colors cursor-pointer shadow-2xs"
        >
          {storageMode === 'in-build' ? (
            <HardDrive className="w-3.5 h-3.5 text-[#c85a32]" />
          ) : (
            <Cloud className="w-3.5 h-3.5 text-[#0284c7]" />
          )}
          <span className="truncate max-w-[140px]">
            {storageMode === 'in-build'
              ? 'Browser Storage'
              : isFirebaseConfigured
              ? isCustomConfig ? 'Custom Cloud' : 'Cloud Storage'
              : 'Cloud Storage'}
          </span>
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              storageMode === 'in-build' ? 'bg-[#059669]' : 'bg-[#0284c7]'
            }`}
          />
        </button>

        {/* Quick Add Menu */}
        <div className="relative">
          <button
            onClick={() => setShowQuickMenu(!showQuickMenu)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-[#23424d] hover:bg-[#1a323b] rounded-lg shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Create</span>
          </button>

          {showQuickMenu && (
            <div
              onClick={() => setShowQuickMenu(false)}
              className="fixed inset-0 z-40"
            />
          )}

          {showQuickMenu && (
            <div className="absolute right-0 mt-2 w-52 bg-white border border-[#e9e4dc] rounded-2xl shadow-xl z-50 p-1.5 text-xs space-y-1 animate-in fade-in zoom-in-95 duration-100">
              <button
                onClick={() => {
                  onQuickAction('newOrder');
                  setShowQuickMenu(false);
                }}
                className="w-full text-left px-3 py-2 rounded-xl hover:bg-[#f7f4ee] text-[#1c1b18] flex items-center justify-between cursor-pointer"
              >
                <span>New Customer Order</span>
                <span className="text-[10px] text-[#059669] font-mono font-bold">+Sale</span>
              </button>
              <button
                onClick={() => {
                  onQuickAction('newProduct');
                  setShowQuickMenu(false);
                }}
                className="w-full text-left px-3 py-2 rounded-xl hover:bg-[#f7f4ee] text-[#1c1b18] flex items-center justify-between cursor-pointer"
              >
                <span>New Product</span>
                <span className="text-[10px] text-[#23424d] font-mono font-bold">+Item</span>
              </button>
              <button
                onClick={() => {
                  onQuickAction('newPurchase');
                  setShowQuickMenu(false);
                }}
                className="w-full text-left px-3 py-2 rounded-xl hover:bg-[#f7f4ee] text-[#1c1b18] flex items-center justify-between cursor-pointer"
              >
                <span>Stock Purchase</span>
                <span className="text-[10px] text-[#8b5cf6] font-mono font-bold">+Stock</span>
              </button>
              <div className="border-t border-[#e9e4dc] my-1" />
              <button
                onClick={() => {
                  onQuickAction('newExpense');
                  setShowQuickMenu(false);
                }}
                className="w-full text-left px-3 py-2 rounded-xl hover:bg-[#f7f4ee] text-[#1c1b18] flex items-center justify-between cursor-pointer"
              >
                <span>Record Expense</span>
                <span className="text-[10px] text-[#be123c] font-mono font-bold">-Cash</span>
              </button>
              <button
                onClick={() => {
                  onQuickAction('newIncome');
                  setShowQuickMenu(false);
                }}
                className="w-full text-left px-3 py-2 rounded-xl hover:bg-[#f7f4ee] text-[#1c1b18] flex items-center justify-between cursor-pointer"
              >
                <span>Record Other Income</span>
                <span className="text-[10px] text-[#0284c7] font-mono font-bold">+Cash</span>
              </button>
            </div>
          )}
        </div>

        {/* AI Assistant Quick Trigger */}
        <button
          onClick={openAI}
          title="Apex AI Assistant"
          className="p-2 rounded-xl text-[#23424d] hover:bg-[#eae5dc] transition-colors cursor-pointer"
        >
          <Sparkles className="w-4 h-4" />
        </button>

        {/* Notifications Bell */}
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="p-2 rounded-xl text-[#706c64] hover:text-[#1c1b18] hover:bg-[#eae5dc] transition-colors relative cursor-pointer"
          >
            <Bell className="w-4 h-4" />
            {lowStockProducts.length > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#c85a32] ring-2 ring-[#fbf9f6]" />
            )}
          </button>

          {showNotifications && (
            <div
              onClick={() => setShowNotifications(false)}
              className="fixed inset-0 z-40"
            />
          )}

          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 bg-white border border-[#e9e4dc] rounded-2xl shadow-xl z-50 p-4 text-xs animate-in fade-in zoom-in-95 duration-100">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#e9e4dc]">
                <span className="font-bold text-[#1c1b18]">Stock & System Alerts</span>
                <span className="text-[11px] text-[#706c64]">
                  {lowStockProducts.length} low stock alert(s)
                </span>
              </div>
              {lowStockProducts.length === 0 ? (
                <div className="py-6 text-center text-[#706c64]">
                  <Check className="w-5 h-5 mx-auto mb-1 text-[#059669]" />
                  <p>All product inventories are healthy!</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {lowStockProducts.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => {
                        setActiveTab('inventory');
                        setShowNotifications(false);
                      }}
                      className="p-2.5 rounded-xl bg-[#fffbeb] border border-[#fef3c7] hover:border-[#fde68a] cursor-pointer transition-colors"
                    >
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="w-3.5 h-3.5 text-[#d97706] shrink-0 mt-0.5" />
                        <div>
                          <p className="font-bold text-[#92400e]">{p.name}</p>
                          <p className="text-[11px] text-[#78350f] mt-0.5">
                            Stock: {p.currentStock} {p.unit} (Min threshold: {p.minStockLevel})
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Currency Pill */}
        <span className="hidden sm:inline-flex items-center px-2.5 py-1 text-[11px] font-mono font-bold text-[#1c1b18] bg-white border border-[#d8d3c9] rounded-lg shadow-2xs">
          {settings.currencySymbol} {settings.currency}
        </span>

        {/* User Profile / Workspace Switcher */}
        <div className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-2 p-1 pl-2 rounded-xl hover:bg-[#eae5dc] transition-colors cursor-pointer"
          >
            <div className="w-7 h-7 rounded-full bg-[#23424d] flex items-center justify-center text-xs font-bold text-white shadow-xs">
              {user?.email?.charAt(0).toUpperCase() || 'P'}
            </div>
          </button>

          {showUserMenu && (
            <div
              onClick={() => setShowUserMenu(false)}
              className="fixed inset-0 z-40"
            />
          )}

          {showUserMenu && (
            <div className="absolute right-0 mt-2 w-60 bg-white border border-[#e9e4dc] rounded-2xl shadow-xl z-50 p-2 text-xs animate-in fade-in zoom-in-95 duration-100">
              <div className="px-3 py-2 border-b border-[#e9e4dc] mb-1">
                <p className="font-bold text-[#1c1b18] truncate">
                  {user?.displayName || (isDirectWorkspace ? 'Personal Workspace' : 'Merchant Owner')}
                </p>
                <p className="text-[11px] text-[#706c64] truncate">
                  {user?.email || 'Direct Personal Storage'}
                </p>
              </div>

              <button
                onClick={() => {
                  if (onOpenWorkspaceSetup) onOpenWorkspaceSetup();
                  setShowUserMenu(false);
                }}
                className="w-full text-left px-3 py-2 rounded-xl hover:bg-[#f7f4ee] text-[#1c1b18] flex items-center gap-2 cursor-pointer font-medium"
              >
                <HardDrive className="w-3.5 h-3.5 text-[#c85a32]" />
                <span>Configure Storage / Cloud</span>
              </button>

              <button
                onClick={() => {
                  setActiveTab('settings');
                  setShowUserMenu(false);
                }}
                className="w-full text-left px-3 py-2 rounded-xl hover:bg-[#f7f4ee] text-[#1c1b18] flex items-center gap-2 cursor-pointer font-medium"
              >
                <Settings className="w-3.5 h-3.5 text-[#706c64]" />
                <span>Store Settings</span>
              </button>

              <div className="border-t border-[#e9e4dc] my-1" />

              {user && (
                <button
                  onClick={() => {
                    void logout();
                    setShowUserMenu(false);
                  }}
                  className="w-full text-left px-3 py-2 rounded-xl hover:bg-[#fff1f2] text-[#be123c] flex items-center gap-2 cursor-pointer font-medium"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
