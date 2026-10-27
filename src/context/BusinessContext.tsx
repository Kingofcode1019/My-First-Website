import React, { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import {
  Account,
  BusinessSettings,
  Customer,
  DashboardMetrics,
  InventoryMovement,
  Order,
  Product,
  Purchase,
  Supplier,
  Transaction,
} from '../types';
import { productsService } from '../services/products.service';
import { inventoryService } from '../services/inventory.service';
import { ordersService } from '../services/orders.service';
import { customersService } from '../services/customers.service';
import { suppliersService } from '../services/suppliers.service';
import { purchasesService } from '../services/purchases.service';
import { financeService } from '../services/finance.service';
import { defaultSettings, settingsService } from '../services/settings.service';

interface BusinessContextType {
  products: Product[];
  movements: InventoryMovement[];
  orders: Order[];
  customers: Customer[];
  suppliers: Supplier[];
  purchases: Purchase[];
  accounts: Account[];
  transactions: Transaction[];
  settings: BusinessSettings;
  metrics: DashboardMetrics;
  lowStockProducts: Product[];
  loading: boolean;
  refreshAll: () => Promise<void>;
  updateSettings: (updates: Partial<BusinessSettings>) => Promise<void>;
}

const BusinessContext = createContext<BusinessContextType | undefined>(undefined);

export const BusinessProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { effectiveUid, storageMode, user, loading: authLoading } = useAuth();
  const { success, error: toastError } = useToast();

  const [products, setProducts] = useState<Product[]>([]);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [settings, setSettings] = useState<BusinessSettings>(defaultSettings);
  const [loading, setLoading] = useState<boolean>(true);
  const requestId = useRef(0);

  const refreshAll = useCallback(async () => {
    const currentRequestId = ++requestId.current;
    if (authLoading || (storageMode === 'firebase' && !user)) {
      setLoading(false);
      return;
    }
    if (!effectiveUid) {
      setLoading(false);
      return;
    }
    if (storageMode === 'firebase' && user && effectiveUid !== user.uid) {
      setLoading(false);
      toastError('Firebase workspace UID does not match the signed-in account. Sign out and back in to refresh the workspace.');
      return;
    }

    const loadResource = <T,>(name: string, request: Promise<T>): Promise<T> =>
      request.catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`${name}: ${message}`);
      });

    setLoading(true);
    try {
      const [
        prods,
        movs,
        ords,
        custs,
        supps,
        purchs,
        accs,
        txs,
        sett,
      ] = await Promise.all([
        loadResource('Products', productsService.getProducts(effectiveUid)),
        loadResource('Inventory movements', inventoryService.getMovements(effectiveUid)),
        loadResource('Orders', ordersService.getOrders(effectiveUid)),
        loadResource('Customers', customersService.getCustomers(effectiveUid)),
        loadResource('Suppliers', suppliersService.getSuppliers(effectiveUid)),
        loadResource('Purchases', purchasesService.getPurchases(effectiveUid)),
        loadResource('Accounts', financeService.getAccounts(effectiveUid)),
        loadResource('Transactions', financeService.getTransactions(effectiveUid)),
        loadResource('Settings', settingsService.getSettings(effectiveUid)),
      ]);

      if (currentRequestId !== requestId.current) return;

      setProducts(prods || []);
      setMovements(movs || []);
      setOrders(ords || []);
      setCustomers(custs || []);
      setSuppliers(supps || []);
      setPurchases(purchs || []);
      setAccounts(accs || []);
      setTransactions(txs || []);
      setSettings(sett || defaultSettings);
    } catch (err: any) {
      if (currentRequestId !== requestId.current) return;
      console.warn('Syncing business data:', err);
      const details = err instanceof Error ? err.message : String(err);
      toastError(`Could not load business data: ${details}`);
    } finally {
      if (currentRequestId === requestId.current) setLoading(false);
    }
  }, [authLoading, effectiveUid, storageMode, toastError, user]);

  useEffect(() => {
    requestId.current += 1;
    setProducts([]);
    setMovements([]);
    setOrders([]);
    setCustomers([]);
    setSuppliers([]);
    setPurchases([]);
    setAccounts([]);
    setTransactions([]);
    setSettings(defaultSettings);
    if (authLoading) {
      setLoading(true);
    } else if (storageMode === 'firebase' && !user) {
      setLoading(false);
      toastError('Sign in to load your Firebase business data.');
    } else if (effectiveUid) {
      setLoading(true);
      refreshAll();
    } else {
      setLoading(false);
    }
  }, [authLoading, effectiveUid, storageMode, user, refreshAll]);

  const updateSettings = async (updates: Partial<BusinessSettings>) => {
    if (!effectiveUid) return;
    try {
      await settingsService.updateSettings(effectiveUid, updates);
      setSettings((prev) => ({ ...prev, ...updates }));
      success('Settings updated successfully');
    } catch (err: any) {
      toastError('Failed to update settings');
      throw err;
    }
  };

  // Low Stock Items
  const lowStockProducts = useMemo(() => {
    return products.filter((p) => p.status !== 'archived' && p.currentStock <= p.minStockLevel);
  }, [products]);

  // Dashboard Metrics Computation
  const metrics: DashboardMetrics = useMemo(() => {
    const deliveredOrdersList = orders.filter((o) => o.orderStatus === 'delivered');
    const totalRevenue = deliveredOrdersList.reduce(
      (acc, o) => acc + Math.max(0, (o.subtotal || 0) - (o.discount || 0)),
      0
    );

    const totalCogs = deliveredOrdersList.reduce((acc, o) => {
      const itemsCost = o.items.reduce(
        (sum, item) => sum + (item.purchasePrice || 0) * (item.quantity || 0),
        0
      );
      return acc + itemsCost;
    }, 0);

    const totalProfit = totalRevenue - totalCogs;

    // Sum expenses from transactions
    const totalExpenses = transactions
      .filter((t) => t.type === 'expense')
      .reduce((acc, t) => acc + t.amount, 0);

    const totalOrders = orders.length;
    const deliveredOrders = deliveredOrdersList.length;
    const pendingOrders = orders.filter((o) => ['pending', 'confirmed', 'processing'].includes(o.orderStatus)).length;
    const returnedOrders = orders.filter((o) => o.orderStatus === 'returned').length;
    const cancelledOrders = orders.filter((o) => o.orderStatus === 'cancelled').length;

    const activeProducts = products.filter((p) => p.status !== 'archived');
    const totalProducts = activeProducts.length;

    const totalInventoryValue = activeProducts.reduce(
      (sum, p) => sum + Math.max(0, p.currentStock) * (p.purchasePrice || 0),
      0
    );

    return {
      totalRevenue,
      totalProfit,
      totalExpenses,
      totalOrders,
      deliveredOrders,
      pendingOrders,
      returnedOrders,
      cancelledOrders,
      totalProducts,
      totalInventoryValue,
      lowStockProductsCount: lowStockProducts.length,
    };
  }, [orders, products, transactions, lowStockProducts]);

  return (
    <BusinessContext.Provider
      value={{
        products,
        movements,
        orders,
        customers,
        suppliers,
        purchases,
        accounts,
        transactions,
        settings,
        metrics,
        lowStockProducts,
        loading,
        refreshAll,
        updateSettings,
      }}
    >
      {children}
    </BusinessContext.Provider>
  );
};

export const useBusiness = () => {
  const context = useContext(BusinessContext);
  if (!context) {
    throw new Error('useBusiness must be used within a BusinessProvider');
  }
  return context;
};
