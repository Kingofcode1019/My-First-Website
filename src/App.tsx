import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider, useToast } from './context/ToastContext';
import { BusinessProvider, useBusiness } from './context/BusinessContext';
import { Sidebar, ActiveTab } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { GlobalSearchModal } from './components/layout/GlobalSearchModal';
import { AIAssistantModal } from './components/ai/AIAssistantModal';
import { PersonalStorageModal } from './components/layout/PersonalStorageModal';
import { AdminApp } from './components/admin/AdminApp';

// Domain Views
import { DashboardView } from './components/dashboard/DashboardView';
import { OrderList } from './components/orders/OrderList';
import { ProductList } from './components/products/ProductList';
import { InventoryView } from './components/inventory/InventoryView';
import { CustomerList } from './components/customers/CustomerList';
import { SupplierList } from './components/suppliers/SupplierList';
import { FinanceView } from './components/finance/FinanceView';
import { ReportsView } from './components/reports/ReportsView';
import { AnalyticsView } from './components/analytics/AnalyticsView';
import { SettingsView } from './components/settings/SettingsView';

// Quick Modals
import { CreateOrderModal } from './components/orders/CreateOrderModal';
import { ProductModal } from './components/products/ProductModal';
import { ExpenseModal } from './components/finance/ExpenseModal';
import { IncomeModal } from './components/finance/IncomeModal';
import { PurchaseOrderModal } from './components/suppliers/PurchaseOrderModal';
import { InvoiceModal } from './components/orders/InvoiceModal';
import { Order } from './types';

import { Loader2 } from 'lucide-react';

const AppContent: React.FC = () => {
  const { loading: authLoading } = useAuth();
  const { products, customers, accounts, suppliers, settings, refreshAll } = useBusiness();

  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isAIOpen, setIsAIOpen] = useState(false);
  const [isStorageModalOpen, setIsStorageModalOpen] = useState(false);

  // Jump to specific order in orders tab
  const [targetOrderId, setTargetOrderId] = useState<string | null>(null);

  // Quick action modals
  const [quickOrderOpen, setQuickOrderOpen] = useState(false);
  const [quickOrderInvoice, setQuickOrderInvoice] = useState<Order | null>(null);
  const [quickProductOpen, setQuickProductOpen] = useState(false);
  const [quickExpenseOpen, setQuickExpenseOpen] = useState(false);
  const [quickIncomeOpen, setQuickIncomeOpen] = useState(false);
  const [quickPurchaseOpen, setQuickPurchaseOpen] = useState(false);

  // Keyboard shortcut: Cmd+K / Ctrl+K for Global Search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#fbf9f6] flex flex-col items-center justify-center text-[#706c64]">
        <Loader2 className="w-8 h-8 animate-spin text-[#23424d] mb-3" />
        <p className="text-xs font-semibold tracking-wide">Starting Personal Storage Workspace...</p>
      </div>
    );
  }

  const handleQuickAction = (action: 'newOrder' | 'newProduct' | 'newExpense' | 'newIncome' | 'newPurchase') => {
    if (action === 'newOrder') setQuickOrderOpen(true);
    if (action === 'newProduct') setQuickProductOpen(true);
    if (action === 'newExpense') setQuickExpenseOpen(true);
    if (action === 'newIncome') setQuickIncomeOpen(true);
    if (action === 'newPurchase') setQuickPurchaseOpen(true);
  };

  const handleSelectOrderFromAnywhere = (orderId: string) => {
    setTargetOrderId(orderId);
    setActiveTab('orders');
  };

  return (
    <div className="min-h-screen bg-[#fbf9f6] text-[#1c1b18] flex flex-col md:flex-row antialiased selection:bg-[#23424d] selection:text-white">
      {/* Left Sidebar */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={(t) => {
          setActiveTab(t);
          if (t !== 'orders') setTargetOrderId(null);
        }}
        openAI={() => setIsAIOpen(true)}
        isMobileOpen={isMobileOpen}
        setIsMobileOpen={setIsMobileOpen}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 md:pl-64">
        {/* Top Header */}
        <Header
          setIsMobileOpen={setIsMobileOpen}
          openSearch={() => setIsSearchOpen(true)}
          openAI={() => setIsAIOpen(true)}
          setActiveTab={setActiveTab}
          onQuickAction={handleQuickAction}
          onOpenWorkspaceSetup={() => setIsStorageModalOpen(true)}
        />

        {/* Tab Content View */}
        <main className="flex-1 p-4 md:p-8 max-w-7xl w-full mx-auto pb-20 md:pb-12">
          {activeTab === 'dashboard' && (
            <DashboardView
              setActiveTab={setActiveTab}
              onSelectOrder={handleSelectOrderFromAnywhere}
            />
          )}

          {activeTab === 'orders' && (
            <OrderList initialSelectedOrderId={targetOrderId} />
          )}

          {activeTab === 'products' && <ProductList />}

          {activeTab === 'inventory' && <InventoryView />}

          {activeTab === 'customers' && (
            <CustomerList onSelectOrder={handleSelectOrderFromAnywhere} />
          )}

          {activeTab === 'suppliers' && <SupplierList />}

          {activeTab === 'finance' && <FinanceView />}

          {activeTab === 'reports' && <ReportsView />}

          {activeTab === 'analytics' && <AnalyticsView />}

          {activeTab === 'settings' && <SettingsView />}
        </main>
      </div>

      {/* Global Modals */}
      <GlobalSearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        setActiveTab={setActiveTab}
        onSelectOrder={handleSelectOrderFromAnywhere}
      />

      <AIAssistantModal isOpen={isAIOpen} onClose={() => setIsAIOpen(false)} />

      <PersonalStorageModal
        isOpen={isStorageModalOpen}
        onClose={() => setIsStorageModalOpen(false)}
      />

      {/* Quick Action Modals */}
      <CreateOrderModal
        isOpen={quickOrderOpen}
        onClose={() => setQuickOrderOpen(false)}
        products={products}
        customers={customers}
        accounts={accounts}
        currencySymbol={settings.currencySymbol}
        defaultDeliveryCharge={settings.defaultDeliveryCharge}
        onOrderCreated={(order) => {
          setQuickOrderInvoice(order);
          void refreshAll();
        }}
      />
      {quickOrderInvoice && (
        <InvoiceModal
          isOpen={!!quickOrderInvoice}
          onClose={() => setQuickOrderInvoice(null)}
          order={quickOrderInvoice}
          settings={settings}
        />
      )}

      <ProductModal
        isOpen={quickProductOpen}
        onClose={() => setQuickProductOpen(false)}
        suppliers={suppliers}
        onSaved={refreshAll}
      />

      <ExpenseModal
        isOpen={quickExpenseOpen}
        onClose={() => setQuickExpenseOpen(false)}
        accounts={accounts}
        currencySymbol={settings.currencySymbol}
        onSaved={refreshAll}
      />

      <IncomeModal
        isOpen={quickIncomeOpen}
        onClose={() => setQuickIncomeOpen(false)}
        accounts={accounts}
        currencySymbol={settings.currencySymbol}
        onSaved={refreshAll}
      />

      <PurchaseOrderModal
        isOpen={quickPurchaseOpen}
        onClose={() => setQuickPurchaseOpen(false)}
        suppliers={suppliers}
        products={products}
        currencySymbol={settings.currencySymbol}
        onSaved={refreshAll}
      />
    </div>
  );
};

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <ApplicationRouter />
      </AuthProvider>
    </ToastProvider>
  );
}

const ApplicationRouter: React.FC = () => {
  const isAdminPath =
    window.location.pathname === '/2026.12.10' ||
    window.location.pathname.startsWith('/2026.12.10/') ||
    window.location.pathname === '/admin' ||
    window.location.pathname.startsWith('/admin/');
  if (isAdminPath) return <AdminApp />;
  return (
    <BusinessProvider>
      <AppContent />
    </BusinessProvider>
  );
};
