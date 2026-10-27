import {
  Account,
  BusinessSettings,
  Customer,
  FinanceCategory,
  FinanceCategoryType,
  FinanceAuditEntry,
  InventoryMovement,
  InventoryMovementType,
  JournalEntry,
  LinkedShippingExpense,
  Order,
  OrderStatus,
  PaymentStatus,
  Product,
  Purchase,
  PurchasePayment,
  ReturnCondition,
  Supplier,
  Transaction,
} from '../types';
import { auth } from './firebase';
import { buildOtherInflowJournalLines, makeJournalEntry } from '../services/accounting';
import { getSupplierDisplayName, normalizeSupplierAssignment } from './supplierUtils';
import { assertCustomFinanceCategoryName, financeCategoryKey } from './financeCategories';
import { applyPurchasePayment, getInitialPurchasePayment, getPurchasePaymentSummary } from './purchasePayment';
import {
  buildEditedPurchase,
  PurchaseEditInput,
  purchaseInventoryCostChanged,
  updateProductForPurchaseEdit,
} from './purchaseEdit';
import { createInvoiceNumber, createOrderNumber } from './invoice';
import { buildBalanceAdjustmentTransaction } from './balanceAdjustment';
import { buildCourierFeeExpense } from '../services/courierExpense';
import {
  buildUpdatedManualTransaction,
  buildUpdatedPurchasePayment,
  calculateManualTransactionBalances,
  isEditableManualTransaction,
  isPurchasePaymentTransaction,
  isStandaloneManualTransaction,
  reverseManualTransactionBalances,
  calculateTransferBalances,
  ManualTransactionUpdate,
  TransferTransactionUpdate,
} from './manualTransaction';

function createFinanceAuditEntry(
  action: FinanceAuditEntry['action'],
  recordType: FinanceAuditEntry['recordType'],
  recordId: string,
  previousValues: Record<string, unknown> | undefined,
  newValues: Record<string, unknown> | undefined,
  reason: string
): FinanceAuditEntry {
  return {
    id: `audit_${crypto.randomUUID()}`,
    action,
    recordType,
    recordId,
    ...(previousValues ? { previousValues } : {}),
    ...(newValues ? { newValues } : {}),
    reason,
    responsibleUserId: (localStorage.getItem('apex_storage_mode') === 'firebase'
      ? auth?.currentUser?.uid
      : null) ||
      localStorage.getItem('apex_personal_storage_uid') ||
      'local_merchant',
    timestamp: new Date().toISOString(),
  };
}

export type StorageMode = 'in-build' | 'firebase';

const STORAGE_KEYS = {
  MODE: 'apex_storage_mode',
  PRODUCTS: 'apex_store_products',
  MOVEMENTS: 'apex_store_movements',
  ORDERS: 'apex_store_orders',
  CUSTOMERS: 'apex_store_customers',
  SUPPLIERS: 'apex_store_suppliers',
  SUPPLIER_SEQUENCE: 'apex_supplier_sequence',
  PURCHASES: 'apex_store_purchases',
  ACCOUNTS: 'apex_store_accounts',
  TRANSACTIONS: 'apex_store_transactions',
  JOURNAL_ENTRIES: 'apex_store_journal_entries',
  FINANCE_AUDIT: 'apex_store_finance_audit',
  EXPENSES: 'apex_store_expenses',
  FINANCE_CATEGORIES: 'apex_store_finance_categories',
  SETTINGS: 'apex_store_settings',
};

function getScopedKey(key: string): string {
  const firebaseUid =
    localStorage.getItem(STORAGE_KEYS.MODE) === 'firebase' ? auth?.currentUser?.uid : null;
  const userId = firebaseUid || localStorage.getItem('apex_personal_storage_uid') || 'local_merchant';
  return `${key}_${userId}`;
}

// Safe JSON get/set
function getStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(getScopedKey(key));
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch (e) {
    console.warn(`Error parsing storage key ${key}:`, e);
    return fallback;
  }
}

function setStored<T>(key: string, data: T): void {
  try {
    localStorage.setItem(getScopedKey(key), JSON.stringify(data));
  } catch (e) {
    console.error(`Error saving to storage key ${key}:`, e);
  }
}

function setStoredAtomically(updates: Array<[string, unknown]>): void {
  const changes = updates.map(([key, value]) => ({
    storageKey: getScopedKey(key),
    nextValue: JSON.stringify(value),
    previousValue: localStorage.getItem(getScopedKey(key)),
  }));

  try {
    changes.forEach(({ storageKey, nextValue }) => localStorage.setItem(storageKey, nextValue));
  } catch (error) {
    for (const { storageKey, previousValue } of changes) {
      try {
        if (previousValue === null) localStorage.removeItem(storageKey);
        else localStorage.setItem(storageKey, previousValue);
      } catch (rollbackError) {
        console.error(`Failed to roll back local storage key ${storageKey}:`, rollbackError);
      }
    }
    throw error;
  }
}

export const inBuildStorage = {
  // Storage Mode
  getStorageMode(): StorageMode {
    const saved = localStorage.getItem(STORAGE_KEYS.MODE) as StorageMode | null;
    return saved === 'firebase' ? 'firebase' : 'in-build';
  },

  setStorageMode(mode: StorageMode): void {
    localStorage.setItem(STORAGE_KEYS.MODE, mode);
  },

  ensureInitialized(): void {
    const existing = getStored<Account[]>(STORAGE_KEYS.ACCOUNTS, []);
    if (existing.length > 0) return;

    const now = new Date().toISOString();
    const defaults: Array<Omit<Account, 'id' | 'createdAt' | 'updatedAt'>> = [
      { name: 'Cash', type: 'cash', startingBalance: 0, currentBalance: 0, isActive: true },
      { name: 'bKash', type: 'bkash', startingBalance: 0, currentBalance: 0, isActive: true },
    ];

    const seeded = defaults.map((account) => ({
      ...account,
      id: 'acc_' + Math.random().toString(36).substring(2, 9),
      createdAt: now,
      updatedAt: now,
    }));

    setStored(STORAGE_KEYS.ACCOUNTS, seeded);
  },

  // 1. PRODUCTS
  getProducts(): Product[] {
    return getStored<Product[]>(STORAGE_KEYS.PRODUCTS, []).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  },

  getProductById(id: string): Product | null {
    const prods = this.getProducts();
    return prods.find((p) => p.id === id) || null;
  },

  createProduct(data: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>): Product {
    const prods = this.getProducts();
    const now = new Date().toISOString();
    const supplier = normalizeSupplierAssignment(data.supplierId, data.supplierName);
    const newProduct: Product = {
      ...data,
      ...supplier,
      id: 'prod_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now().toString(36),
      createdAt: now,
      updatedAt: now,
    };

    prods.push(newProduct);
    setStored(STORAGE_KEYS.PRODUCTS, prods);

    // Initial stock movement
    if (newProduct.currentStock > 0) {
      this.recordMovement({
        productId: newProduct.id,
        productName: newProduct.name,
        sku: newProduct.sku,
        quantity: newProduct.currentStock,
        prevStock: 0,
        newStock: newProduct.currentStock,
        type: 'stock_in',
        supplierName: newProduct.supplierName,
        reason: 'Initial Product Stock Setup',
        date: now,
      });
    }

    return newProduct;
  },

  updateProduct(id: string, updates: Partial<Product>): Product {
    const prods = this.getProducts();
    const idx = prods.findIndex((p) => p.id === id);
    if (idx === -1) throw new Error('Product not found in in-build storage');

    const updated: Product = {
      ...prods[idx],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    prods[idx] = updated;
    setStored(STORAGE_KEYS.PRODUCTS, prods);
    return updated;
  },

  deleteProduct(id: string): void {
    const prods = this.getProducts();
    if (!prods.some((product) => product.id === id)) throw new Error('Product not found');
    const filtered = prods.filter((p) => p.id !== id);
    setStored(STORAGE_KEYS.PRODUCTS, filtered);

    const movements = this.getMovements();
    const productMovements = movements.filter((movement) => movement.productId === id);
    const onlyInitialStock = productMovements.length > 0 && productMovements.every(
      (movement) =>
        movement.type === 'stock_in' &&
        movement.prevStock === 0 &&
        movement.reason === 'Initial Product Stock Setup'
    );
    if (onlyInitialStock) {
      setStored(
        STORAGE_KEYS.MOVEMENTS,
        movements.filter((movement) => movement.productId !== id)
      );
    }
  },

  adjustStock(
    productId: string,
    delta: number,
    type: InventoryMovementType,
    reason: string,
    referenceId?: string,
    supplierName?: string
  ): number {
    const prods = this.getProducts();
    const prod = prods.find((p) => p.id === productId);
    if (!prod) throw new Error('Product not found');

    const prevStock = prod.currentStock;
    const newStock = Math.max(0, prevStock + delta);
    prod.currentStock = newStock;
    prod.updatedAt = new Date().toISOString();

    setStored(STORAGE_KEYS.PRODUCTS, prods);

    this.recordMovement({
      productId: prod.id,
      productName: prod.name,
      sku: prod.sku,
      quantity: Math.abs(delta),
      prevStock,
      newStock,
      type,
      supplierName,
      reason,
      referenceId,
      date: new Date().toISOString(),
    });

    return newStock;
  },

  // 2. INVENTORY MOVEMENTS
  getMovements(): InventoryMovement[] {
    return getStored<InventoryMovement[]>(STORAGE_KEYS.MOVEMENTS, []).sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  },

  recordMovement(
    data: Omit<InventoryMovement, 'id'>
  ): InventoryMovement {
    const movs = this.getMovements();
    const now = new Date().toISOString();
    const newMov: InventoryMovement = {
      ...data,
      ...(data.type === 'purchase' || data.type === 'stock_in'
        ? { supplierName: getSupplierDisplayName(data.supplierName) }
        : {}),
      id: 'mov_' + Math.random().toString(36).substring(2, 9),
    };
    movs.unshift(newMov);
    setStored(STORAGE_KEYS.MOVEMENTS, movs);
    return newMov;
  },

  // 3. ORDERS
  getOrders(): Order[] {
    return getStored<Order[]>(STORAGE_KEYS.ORDERS, []).sort(
      (a, b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime()
    );
  },

  getOrderById(id: string): Order | null {
    const orders = this.getOrders();
    return orders.find((o) => o.id === id) || null;
  },

  deleteOrder(id: string): void {
    const orders = this.getOrders();
    const order = orders.find((o) => o.id === id);
    if (!order) throw new Error('Order not found');
    if (order.orderStatus !== 'cancelled' || order.stockDeducted) {
      throw new Error('Only cancelled orders with restored stock can be deleted');
    }
    setStored(STORAGE_KEYS.ORDERS, orders.filter((o) => o.id !== id));
  },

  createOrder(data: Omit<Order, 'id' | 'orderNumber' | 'createdAt' | 'updatedAt' | 'stockDeducted' | 'revenueRecorded'>): Order {
    const orders = this.getOrders();
    const now = new Date().toISOString();
    const id = `ord_${crypto.randomUUID()}`;
    const orderNumber = createOrderNumber(id);
    const invoiceNumber = createInvoiceNumber(id, now);

    // Verify and deduct stock for each item
    for (const item of data.items) {
      this.adjustStock(
        item.productId,
        -item.quantity,
        'sale',
        `Customer Order #${orderNumber}`,
        orderNumber
      );
    }

    // Update customer stats
    if (data.customerId) {
      const custs = this.getCustomers();
      const cust = custs.find((c) => c.id === data.customerId);
      if (cust) {
        cust.totalOrders = (cust.totalOrders || 0) + 1;
        cust.lastOrderDate = now;
        cust.updatedAt = now;
        setStored(STORAGE_KEYS.CUSTOMERS, custs);
      }
    }

    const newOrder: Order = {
      ...data,
      id,
      orderNumber,
      invoiceNumber,
      stockDeducted: true,
      revenueRecorded: false,
      createdAt: now,
      updatedAt: now,
    };

    orders.unshift(newOrder);
    setStored(STORAGE_KEYS.ORDERS, orders);
    return newOrder;
  },

  updateOrderStatus(
    orderId: string,
    newStatus: OrderStatus,
    paymentStatusOrOptions?: PaymentStatus | {
      returnCondition?: ReturnCondition;
      paymentAccountId?: string;
      paymentStatus?: PaymentStatus;
      courierFeePaid?: number;
      courierAccountId?: string;
      cancellationReason?: string;
    },
    paymentAccountId?: string
  ): Order {
    const orders = this.getOrders();
    const order = orders.find((o) => o.id === orderId);
    if (!order) throw new Error('Order not found');

    let resolvedPaymentStatus: PaymentStatus | undefined;
    let resolvedPaymentAccountId: string | undefined = paymentAccountId;
    let resolvedReturnCondition: ReturnCondition | undefined;

    if (typeof paymentStatusOrOptions === 'string') {
      resolvedPaymentStatus = paymentStatusOrOptions;
    } else if (paymentStatusOrOptions && typeof paymentStatusOrOptions === 'object') {
      resolvedPaymentStatus = paymentStatusOrOptions.paymentStatus;
      if (paymentStatusOrOptions.paymentAccountId) {
        resolvedPaymentAccountId = paymentStatusOrOptions.paymentAccountId;
      }
      if (paymentStatusOrOptions.returnCondition) {
        resolvedReturnCondition = paymentStatusOrOptions.returnCondition;
      }
    }

    const now = new Date().toISOString();
    const prevStatus = order.orderStatus;
    const enteredCancellationFee = typeof paymentStatusOrOptions === 'object'
      ? Number(paymentStatusOrOptions.courierFeePaid ?? 0)
      : 0;
    if (!Number.isFinite(enteredCancellationFee) || enteredCancellationFee < 0) {
      throw new Error('Courier fee paid by the business must be a valid non-negative amount');
    }
    const cancellationFee = newStatus === 'cancelled' && ['shipped', 'delivered'].includes(prevStatus)
      ? enteredCancellationFee
      : 0;
    let courierExpenseAccount: Account | undefined;
    let courierExpense: Transaction | undefined;
    let updatedAccounts: Account[] | undefined;
    if (cancellationFee > 0) {
      if (!Number.isFinite(cancellationFee)) throw new Error('Courier fee must be a valid amount');
      const accountId = typeof paymentStatusOrOptions === 'object' ? paymentStatusOrOptions.courierAccountId : undefined;
      if (!accountId) throw new Error('Select the account used to pay the courier');
      const transactionId = `courier_cancel_${order.id}`;
      if (this.getTransactions().some((transaction) => transaction.id === transactionId)) {
        throw new Error('The courier fee for this cancelled order has already been recorded');
      }
      updatedAccounts = this.getAccounts();
      courierExpenseAccount = updatedAccounts.find((account) => account.id === accountId);
      if (!courierExpenseAccount) throw new Error('Selected account does not exist');
      courierExpenseAccount.currentBalance -= cancellationFee;
      courierExpenseAccount.updatedAt = now;
      courierExpense = buildCourierFeeExpense(order, courierExpenseAccount, cancellationFee, 'cancel', now) || undefined;
    }
    order.orderStatus = newStatus;
    order.updatedAt = now;

    if (resolvedPaymentStatus) order.paymentStatus = resolvedPaymentStatus;
    if (resolvedPaymentAccountId) order.paymentAccountId = resolvedPaymentAccountId;
    if (resolvedReturnCondition) order.returnCondition = resolvedReturnCondition;

    // Delivery completion
    if (newStatus === 'delivered' && prevStatus !== 'delivered') {
      order.deliveredDate = now;

      // Update customer totalSpent and ltv
      if (order.customerId && order.saleRecognized !== true) {
        const custs = this.getCustomers();
        const cust = custs.find((c) => c.id === order.customerId);
        if (cust) {
          cust.totalSpent = (cust.totalSpent || 0) + order.totalAmount;
          cust.ltv = cust.totalSpent;
          setStored(STORAGE_KEYS.CUSTOMERS, custs);
        }
      }

      order.saleRecognized = true;
    }

    // Cancellation
    if (newStatus === 'cancelled' && prevStatus !== 'cancelled') {
      const cancellationReason = typeof paymentStatusOrOptions === 'object'
        ? paymentStatusOrOptions.cancellationReason
        : undefined;
      order.cancelledDate = now;
      if (cancellationReason) {
        order.notes = `${order.notes ? `${order.notes} | ` : ''}Cancelled: ${cancellationReason}`;
      }
      if (prevStatus === 'delivered' && order.customerId) {
        const customers = this.getCustomers();
        const customer = customers.find((item) => item.id === order.customerId);
        if (customer) {
          customer.totalSpent = Math.max(0, (customer.totalSpent || 0) - order.totalAmount);
          customer.ltv = customer.totalSpent;
          setStored(STORAGE_KEYS.CUSTOMERS, customers);
        }
      }
      if (order.stockDeducted) {
        const products = this.getProducts();
        const missingProduct = order.items.find((item) => !products.some((product) => product.id === item.productId));
        if (missingProduct) throw new Error(`Product ${missingProduct.productName} no longer exists`);
        for (const item of order.items) {
          this.adjustStock(
            item.productId,
            item.quantity,
            'adjustment',
            `Restored from Cancelled Order #${order.orderNumber}`,
            order.orderNumber
          );
        }
        order.stockDeducted = false;
      }
    }

    setStoredAtomically([
      [STORAGE_KEYS.ORDERS, orders],
      ...(updatedAccounts ? [[STORAGE_KEYS.ACCOUNTS, updatedAccounts] as [string, unknown]] : []),
      ...(courierExpense ? [[STORAGE_KEYS.TRANSACTIONS, [courierExpense, ...this.getTransactions()]] as [string, unknown]] : []),
    ]);
    return order;
  },

  cancelOrder(
    orderId: string,
    reason: string,
    courierFeePaid: number = 0,
    courierAccountId?: string
  ): Order {
    return this.updateOrderStatus(orderId, 'cancelled', {
      cancellationReason: reason,
      courierFeePaid,
      courierAccountId,
    });
  },

  processReturn(
    orderId: string,
    condition: ReturnCondition,
    restock: boolean,
    note?: string,
    businessCourierFee = 0,
    courierAccountId?: string
  ): Order {
    if (!Number.isFinite(businessCourierFee) || businessCourierFee < 0) {
      throw new Error('Courier fee paid by the business must be a valid non-negative amount');
    }
    const orders = this.getOrders();
    const order = orders.find((o) => o.id === orderId);
    if (!order) throw new Error('Order not found');
    if (order.orderStatus === 'returned') throw new Error('Order has already been returned');

    const now = new Date().toISOString();
    let updatedAccounts: Account[] | undefined;
    let expense: Transaction | undefined;
    let account: Account | undefined;
    if (businessCourierFee > 0) {
      if (!courierAccountId) throw new Error('Select the account used to pay the courier');
      const transactionId = `courier_return_${order.id}`;
      if (this.getTransactions().some((transaction) => transaction.id === transactionId)) {
        throw new Error('The courier fee for this returned order has already been recorded');
      }
      updatedAccounts = this.getAccounts();
      account = updatedAccounts.find((entry) => entry.id === courierAccountId);
      if (!account) throw new Error('Selected account does not exist');
      account.currentBalance -= businessCourierFee;
      account.updatedAt = now;
      expense = buildCourierFeeExpense(order, account, businessCourierFee, 'return', now) || undefined;
    }
    const wasDelivered = order.orderStatus === 'delivered';
    order.orderStatus = 'returned';
    order.returnCondition = condition;
    order.returnedDate = now;
    if (note) {
      order.notes = (order.notes ? order.notes + ' | ' : '') + `Return: ${note}`;
    }
    order.updatedAt = now;

    if (order.stockDeducted) {
      const products = this.getProducts();
      const missingProduct = order.items.find((item) => !products.some((product) => product.id === item.productId));
      if (missingProduct) throw new Error(`Product ${missingProduct.productName} no longer exists`);
    }
    for (const item of order.items) {
      if (order.stockDeducted && restock && condition === 'sellable') {
        this.adjustStock(
          item.productId,
          item.quantity,
          'return',
          `Restocked from Return #${order.orderNumber}`,
          order.orderNumber
        );
      } else if (order.stockDeducted) {
        this.recordMovement({
          productId: item.productId,
          productName: item.productName,
          sku: item.sku,
          quantity: item.quantity,
          prevStock: 0,
          newStock: 0,
          type: 'damage',
          reason: `Returned Damaged/Unsellable #${order.orderNumber}`,
          referenceId: order.orderNumber,
          date: now,
        });
      }
    }
    order.stockDeducted = false;
    if (wasDelivered && order.customerId) {
      const customers = this.getCustomers();
      const customer = customers.find((item) => item.id === order.customerId);
      if (customer) {
        customer.totalSpent = Math.max(0, (customer.totalSpent || 0) - order.totalAmount);
        customer.ltv = customer.totalSpent;
        setStored(STORAGE_KEYS.CUSTOMERS, customers);
      }
    }

    setStoredAtomically([
      [STORAGE_KEYS.ORDERS, orders],
      ...(updatedAccounts ? [[STORAGE_KEYS.ACCOUNTS, updatedAccounts] as [string, unknown]] : []),
      ...(expense ? [[STORAGE_KEYS.TRANSACTIONS, [expense, ...this.getTransactions()]] as [string, unknown]] : []),
    ]);
    return order;
  },

  // 4. CUSTOMERS
  getCustomers(): Customer[] {
    this.ensureInitialized();
    return getStored<Customer[]>(STORAGE_KEYS.CUSTOMERS, []).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  },

  getCustomerById(id: string): Customer | null {
    const custs = this.getCustomers();
    return custs.find((c) => c.id === id) || null;
  },

  createCustomer(
    data: Omit<
      Customer,
      | 'id'
      | 'createdAt'
      | 'updatedAt'
      | 'totalOrders'
      | 'totalSpent'
      | 'returnedOrders'
      | 'ltv'
      | 'deliveredOrders'
      | 'pendingOrders'
      | 'cancelledOrders'
    >
  ): Customer {
    const custs = this.getCustomers();
    const now = new Date().toISOString();
    const newCust: Customer = {
      ...data,
      totalOrders: 0,
      deliveredOrders: 0,
      pendingOrders: 0,
      cancelledOrders: 0,
      returnedOrders: 0,
      totalSpent: 0,
      ltv: 0,
      id: 'cust_' + Math.random().toString(36).substring(2, 9),
      createdAt: now,
      updatedAt: now,
    };
    custs.push(newCust);
    setStored(STORAGE_KEYS.CUSTOMERS, custs);
    return newCust;
  },

  updateCustomer(id: string, updates: Partial<Customer>): Customer {
    const custs = this.getCustomers();
    const idx = custs.findIndex((c) => c.id === id);
    if (idx === -1) throw new Error('Customer not found');

    const updated = {
      ...custs[idx],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    custs[idx] = updated;
    setStored(STORAGE_KEYS.CUSTOMERS, custs);
    return updated;
  },

  deleteCustomer(id: string): void {
    const custs = this.getCustomers();
    const filtered = custs.filter((c) => c.id !== id);
    setStored(STORAGE_KEYS.CUSTOMERS, filtered);
  },

  // 5. SUPPLIERS
  getSuppliers(): Supplier[] {
    this.ensureInitialized();
    const suppliers = getStored<Supplier[]>(STORAGE_KEYS.SUPPLIERS, []);
    let changed = false;
    suppliers.forEach((supplier) => {
      if (!supplier.code) {
        supplier.code = `SUP-${supplier.id}`;
        changed = true;
      }
    });
    if (changed) setStored(STORAGE_KEYS.SUPPLIERS, suppliers);
    return suppliers.sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  },

  getSupplierById(id: string): Supplier | null {
    const supps = this.getSuppliers();
    return supps.find((s) => s.id === id) || null;
  },

  createSupplier(
    data: Omit<Supplier, 'id' | 'code' | 'createdAt' | 'updatedAt' | 'totalPurchases' | 'amountPaid' | 'amountDue'>
  ): Supplier {
    const supps = this.getSuppliers();
    const now = new Date().toISOString();
    const id = `sup_${Math.random().toString(36).substring(2, 9)}_${Date.now().toString(36)}`;
    const storedSequence = Number(localStorage.getItem(STORAGE_KEYS.SUPPLIER_SEQUENCE)) || 1;
    const highestExistingSequence = supps.reduce((highest, supplier) => {
      const match = /^SUP-(\d+)$/i.exec(supplier.code || '');
      return Math.max(highest, match ? Number(match[1]) : 0);
    }, 0);
    const sequence = Math.max(storedSequence, highestExistingSequence + 1);
    localStorage.setItem(STORAGE_KEYS.SUPPLIER_SEQUENCE, String(sequence + 1));
    const newSup: Supplier = {
      ...data,
      id,
      code: `SUP-${String(sequence).padStart(4, '0')}`,
      totalPurchases: 0,
      createdAt: now,
      updatedAt: now,
    };
    supps.push(newSup);
    setStored(STORAGE_KEYS.SUPPLIERS, supps);
    return newSup;
  },

  deleteSupplier(id: string): void {
    const suppliers = this.getSuppliers();
    if (!suppliers.some((supplier) => supplier.id === id)) throw new Error('Supplier not found');
    const products = this.getProducts();
    const detachedProducts = products.map((product) =>
      product.supplierId === id ? { ...product, ...normalizeSupplierAssignment() } : product
    );
    setStored(STORAGE_KEYS.PRODUCTS, detachedProducts);
    setStored(STORAGE_KEYS.SUPPLIERS, suppliers.filter((supplier) => supplier.id !== id));
  },

  updateSupplier(id: string, updates: Partial<Supplier>): Supplier {
    const supps = this.getSuppliers();
    const idx = supps.findIndex((s) => s.id === id);
    if (idx === -1) throw new Error('Supplier not found');

    const updated = {
      ...supps[idx],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    supps[idx] = updated;
    setStored(STORAGE_KEYS.SUPPLIERS, supps);
    return updated;
  },

  paySupplierDue(data: {
    supplierId: string;
    amount: number;
    accountId: string;
    date: string;
    note?: string;
  }): never {
    void data;
    throw new Error('Supplier payments are disabled. Record actual money movements in Finance.');
  },

  // 6. PURCHASES
  getPurchases(): Purchase[] {
    return getStored<Purchase[]>(STORAGE_KEYS.PURCHASES, []).sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  },

  getLinkedShippingExpenses(): LinkedShippingExpense[] {
    return getStored<LinkedShippingExpense[]>(STORAGE_KEYS.EXPENSES, []);
  },

  createPurchase(data: Omit<Purchase, 'id' | 'createdAt'>): Purchase {
    const purchases = this.getPurchases();
    const now = new Date().toISOString();
    const supplier = normalizeSupplierAssignment(data.supplierId, data.supplierName);
    const shippingCost = Math.max(0, Number(data.shippingCost) || 0);
    const subtotal = data.items.reduce((sum, item) => sum + item.quantity * item.purchasePrice, 0);
    const totalAmount = subtotal + shippingCost;
    if (!Number.isFinite(totalAmount)) throw new Error('Purchase total must be a valid non-negative number');
    if (data.items.some((item) => !Number.isInteger(item.quantity) || item.quantity <= 0 || !Number.isFinite(item.purchasePrice) || item.purchasePrice < 0)) {
      throw new Error('Purchase quantities must be positive and unit prices cannot be negative');
    }
    const totalUnits = data.items.reduce((sum, item) => sum + item.quantity, 0);
    if (totalUnits <= 0) throw new Error('Add at least one product to the purchase');
    const initialPayment = getInitialPurchasePayment();
    const supplierList = this.getSuppliers();
    const supplierRecord = supplier.supplierId
      ? supplierList.find((item) => item.id === supplier.supplierId)
      : undefined;
    if (supplier.supplierId && !supplierRecord) throw new Error('Selected supplier does not exist');
    const products = this.getProducts();
    const productUpdates = data.items.map((item) => {
      const product = products.find((existing) => existing.id === item.productId);
      if (!product) throw new Error(`Product ${item.productName} no longer exists`);
      const unitCost = item.purchasePrice + shippingCost / totalUnits;
      const newStock = product.currentStock + item.quantity;
      const oldValue = product.currentStock * (product.purchasePrice || 0);
      return {
        item,
        product,
        newStock,
        unitCost,
        weightedUnitCost: newStock > 0 ? (oldValue + item.quantity * unitCost) / newStock : unitCost,
      };
    });

    const newPurch: Purchase = {
      ...data,
      ...supplier,
      supplierId: supplierRecord?.id || supplier.supplierId,
      supplierName: supplierRecord?.company || supplier.supplierName,
      items: data.items.map((item) => {
        const effectiveUnitCost = item.purchasePrice + shippingCost / totalUnits;
        return { ...item, effectiveUnitCost, totalCost: effectiveUnitCost * item.quantity };
      }),
      subtotal,
      shippingCost,
      totalAmount,
      totalCost: totalAmount,
      ...initialPayment,
      payments: [],
      id: 'po_' + Math.random().toString(36).substring(2, 9),
      createdAt: now,
    };

    const movements = this.getMovements();
    for (const { item, product, newStock, weightedUnitCost } of productUpdates) {
      product.currentStock = newStock;
      product.purchasePrice = weightedUnitCost;
      product.updatedAt = now;
      movements.unshift({
        id: 'mov_' + Math.random().toString(36).substring(2, 9),
        productId: item.productId,
        productName: item.productName,
        sku: product.sku,
        quantity: item.quantity,
        prevStock: newStock - item.quantity,
        newStock,
        type: 'purchase',
        supplierName: getSupplierDisplayName(supplierRecord?.company || supplier.supplierName),
        referenceId: newPurch.id,
        reason: `Stock Purchase from ${supplierRecord?.company || supplier.supplierName}`,
        date: newPurch.date,
      });
    }
    if (supplierRecord) {
      supplierRecord.totalPurchases = (supplierRecord.totalPurchases || 0) + totalAmount;
      supplierRecord.updatedAt = now;
    }
    const storageUpdates: Array<[string, unknown]> = [
      [STORAGE_KEYS.PRODUCTS, products],
      [STORAGE_KEYS.MOVEMENTS, movements],
      [STORAGE_KEYS.PURCHASES, [newPurch, ...purchases]],
    ];
    if (supplierRecord) storageUpdates.push([STORAGE_KEYS.SUPPLIERS, supplierList]);
    setStoredAtomically(storageUpdates);
    return newPurch;
  },

  updatePurchase(id: string, data: PurchaseEditInput): Purchase {
    const purchases = this.getPurchases();
    const original = purchases.find((item) => item.id === id);
    if (!original) throw new Error('Inventory purchase not found');
    const updated = buildEditedPurchase(original, data);
    const inventoryChanged = purchaseInventoryCostChanged(original, updated);
    const movementNeedsCorrection = inventoryChanged || original.date !== updated.date;
    const products = this.getProducts();
    const movements = this.getMovements();
    const updatedItems = new Map(updated.items.map((item) => [item.productId, item]));
    const originalDateMs = new Date(original.date).getTime();
    const updatedDateMs = new Date(updated.date).getTime();
    const movementCutoff = Math.min(originalDateMs, updatedDateMs);
    if (movementNeedsCorrection && !Number.isFinite(movementCutoff)) {
      throw new Error('Existing purchase date is invalid; its inventory history cannot be safely edited');
    }

    for (const oldItem of original.items) {
      const ownMovement = movements.find((movement) =>
        movement.type === 'purchase' &&
        movement.referenceId === id &&
        movement.productId === oldItem.productId
      );
      const newItem = updatedItems.get(oldItem.productId);
      if (!newItem) throw new Error('Existing purchase products cannot be removed while editing');
      if (movementNeedsCorrection) {
        if (!ownMovement) {
          throw new Error('Purchase inventory history is missing; quantity, cost, or date cannot be safely edited');
        }
        if (movements.some((movement) =>
          movement.productId === oldItem.productId &&
          movement.id !== ownMovement.id &&
          new Date(movement.date).getTime() >= movementCutoff
        )) {
          throw new Error(`Stock for ${oldItem.productName} has later inventory movements. Quantity, cost, or date cannot be safely edited from this purchase.`);
        }
      }
      if (inventoryChanged) {
        if (!ownMovement) {
          throw new Error('Purchase inventory history is missing; quantity or cost cannot be safely edited');
        }
        const product = products.find((item) => item.id === oldItem.productId);
        if (!product) throw new Error(`Product ${oldItem.productName} no longer exists`);
        const totalUnits = original.items.reduce((sum, item) => sum + item.quantity, 0);
        const oldItemWithCost = {
          ...oldItem,
          effectiveUnitCost: oldItem.effectiveUnitCost ??
            oldItem.purchasePrice + (Number(original.shippingCost) || 0) / totalUnits,
        };
        const productUpdate = updateProductForPurchaseEdit(
          Number(product.currentStock) || 0,
          Number(product.purchasePrice) || 0,
          Number(product.reservedStock) || 0,
          oldItemWithCost,
          newItem
        );
        product.currentStock = productUpdate.currentStock;
        product.purchasePrice = productUpdate.purchasePrice;
        product.updatedAt = new Date().toISOString();
        ownMovement.quantity = newItem.quantity;
        ownMovement.newStock = ownMovement.prevStock + newItem.quantity;
      }
      if (ownMovement) {
        ownMovement.supplierName = getSupplierDisplayName(updated.supplierName);
        ownMovement.reason = `Stock Purchase from ${updated.supplierName}`;
        ownMovement.date = updated.date;
      }
    }

    const suppliers = this.getSuppliers();
    if (updated.supplierId && !suppliers.some((supplier) => supplier.id === updated.supplierId)) {
      throw new Error('Selected supplier does not exist');
    }
    const oldTotal = Number(original.totalAmount ?? original.totalCost);
    const supplierUpdates = new Map<string, number>();
    if (original.supplierId) supplierUpdates.set(original.supplierId, (supplierUpdates.get(original.supplierId) || 0) - oldTotal);
    if (updated.supplierId) supplierUpdates.set(updated.supplierId, (supplierUpdates.get(updated.supplierId) || 0) + updated.totalAmount);
    for (const [supplierId, delta] of supplierUpdates) {
      const supplier = suppliers.find((item) => item.id === supplierId);
      if (supplier) {
        supplier.totalPurchases = Math.max(0, (Number(supplier.totalPurchases) || 0) + delta);
        supplier.updatedAt = new Date().toISOString();
      }
    }

    const updatedPurchases = purchases.map((item) => item.id === id ? updated : item);
    const audit = createFinanceAuditEntry(
      'purchase_edited',
      'purchase',
      id,
      { supplierId: original.supplierId, supplierName: original.supplierName, items: original.items, shippingCost: original.shippingCost, totalAmount: original.totalAmount, amountPaid: original.amountPaid, date: original.date, notes: original.notes },
      { supplierId: updated.supplierId, supplierName: updated.supplierName, items: updated.items, shippingCost: updated.shippingCost, totalAmount: updated.totalAmount, amountPaid: updated.amountPaid, date: updated.date, notes: updated.notes },
      'Inventory purchase corrected'
    );
    const storageUpdates: Array<[string, unknown]> = [
      [STORAGE_KEYS.PURCHASES, updatedPurchases],
      [STORAGE_KEYS.MOVEMENTS, movements],
      [STORAGE_KEYS.FINANCE_AUDIT, [audit, ...this.getFinanceAuditEntries()]],
    ];
    if (inventoryChanged) storageUpdates.push([STORAGE_KEYS.PRODUCTS, products]);
    if (supplierUpdates.size) storageUpdates.push([STORAGE_KEYS.SUPPLIERS, suppliers]);
    setStoredAtomically(storageUpdates);
    return updated;
  },

  recordPurchasePayment(data: {
    purchaseId: string;
    amount: number;
    accountId: string;
    date: string;
    note?: string;
  }): Purchase {
    if (!data.purchaseId) throw new Error('Select an inventory purchase');
    if (!data.accountId) throw new Error('Select the account used for this payment');
    if (!Number.isFinite(data.amount) || data.amount <= 0) throw new Error('Payment amount must be greater than zero');
    if (!data.date || !Number.isFinite(new Date(data.date).getTime())) throw new Error('Enter a valid payment date');

    const purchases = this.getPurchases();
    const purchase = purchases.find((item) => item.id === data.purchaseId);
    if (!purchase) throw new Error('Inventory purchase not found');
    const totalAmount = Number(purchase.totalAmount ?? purchase.totalCost);
    const existingPayment = getPurchasePaymentSummary(totalAmount, purchase.amountPaid, purchase.paymentStatus);
    const paymentUpdate = applyPurchasePayment(totalAmount, existingPayment.amountPaid, data.amount);
    const accounts = this.getAccounts();
    const account = accounts.find((item) => item.id === data.accountId);
    if (!account) throw new Error('Selected payment account does not exist');

    const now = new Date().toISOString();
    const transactionId = `tx_${crypto.randomUUID()}`;
    const payment: PurchasePayment = {
      id: transactionId,
      amount: data.amount,
      accountId: account.id,
      accountName: account.name,
      date: data.date,
      ...(data.note?.trim() ? { note: data.note.trim() } : {}),
    };
    const updatedPurchase: Purchase = {
      ...purchase,
      amountPaid: paymentUpdate.amountPaid,
      paymentStatus: paymentUpdate.paymentStatus,
      payments: [...(purchase.payments || []), payment],
    };
    const transaction: Transaction = {
      id: transactionId,
      type: 'expense',
      amount: data.amount,
      accountId: account.id,
      accountName: account.name,
      category: 'Product Purchase',
      referenceId: purchase.id,
      date: data.date,
      note: data.note?.trim() || `Payment for inventory purchase ${purchase.id}`,
      createdAt: now,
    };

    account.currentBalance = (Number(account.currentBalance) || 0) - data.amount;
    account.updatedAt = now;
    const updatedPurchases = purchases.map((item) => item.id === purchase.id ? updatedPurchase : item);
    setStoredAtomically([
      [STORAGE_KEYS.PURCHASES, updatedPurchases],
      [STORAGE_KEYS.ACCOUNTS, accounts],
      [STORAGE_KEYS.TRANSACTIONS, [transaction, ...this.getTransactions()]],
    ]);
    return updatedPurchase;
  },

  addLinkedShippingExpense(data: {
    purchaseId: string;
    supplierId: string;
    shippingAmount: number;
    date?: string;
    note?: string;
    billedBy?: 'supplier' | 'courier';
  }): LinkedShippingExpense {
    if (data.shippingAmount <= 0) throw new Error('Shipping amount must be greater than zero');
    const purchases = this.getPurchases();
    const purchase = purchases.find((item) => item.id === data.purchaseId);
    if (!purchase || purchase.supplierId !== data.supplierId) {
      throw new Error('Purchase and supplier do not match');
    }
    const supplier = this.getSupplierById(data.supplierId);
    if (!supplier) throw new Error('Supplier not found');

    const now = new Date().toISOString();
    const billedBy = data.billedBy || 'supplier';
    const date = data.date || now;
    const totalUnits = purchase.items.reduce((sum, item) => sum + item.quantity, 0);
    if (totalUnits <= 0) throw new Error('Purchase has no stock units to allocate shipping against');
    const shippingPerUnit = data.shippingAmount / totalUnits;
    let capitalizedAmount = 0;

    purchase.items = purchase.items.map((item) => ({
      ...item,
      effectiveUnitCost: (item.effectiveUnitCost || item.purchasePrice) + shippingPerUnit,
      totalCost: ((item.effectiveUnitCost || item.purchasePrice) + shippingPerUnit) * item.quantity,
    }));

    for (const item of purchase.items) {
      const product = this.getProductById(item.productId);
      const remainingUnits = Math.min(item.quantity, product?.currentStock || 0);
      const itemCapitalized = shippingPerUnit * remainingUnits;
      capitalizedAmount += itemCapitalized;
      if (product && product.currentStock > 0 && itemCapitalized > 0) {
        this.updateProduct(product.id, {
          purchasePrice: (product.currentStock * (product.purchasePrice || 0) + itemCapitalized) / product.currentStock,
        });
      }
    }

    const expenseAmount = Math.max(0, data.shippingAmount - capitalizedAmount);
    const expense: LinkedShippingExpense = {
      id: 'exp_' + Math.random().toString(36).substring(2, 9),
      purchaseId: purchase.id,
      supplierId: supplier.id,
      supplierName: supplier.company,
      billedBy,
      category: 'Freight & Shipping',
      amount: data.shippingAmount,
      capitalizedAmount,
      expenseAmount,
      date,
      createdAt: now,
      note: data.note || `Late shipping cost for purchase ${purchase.id}`,
    };

    purchase.shippingCost = (purchase.shippingCost || 0) + data.shippingAmount;
    purchase.totalAmount = (purchase.totalAmount || purchase.totalCost) + data.shippingAmount;
    purchase.totalCost = purchase.totalAmount;
    setStored(STORAGE_KEYS.PURCHASES, purchases);

    if (billedBy === 'supplier') {
      supplier.totalPurchases += data.shippingAmount;
      supplier.updatedAt = now;
      setStored(STORAGE_KEYS.SUPPLIERS, this.getSuppliers().map((item) => item.id === supplier.id ? supplier : item));
    }

    const expenses = getStored<LinkedShippingExpense[]>(STORAGE_KEYS.EXPENSES, []);
    expenses.unshift(expense);
    setStored(STORAGE_KEYS.EXPENSES, expenses);
    return expense;
  },

  // 7. ACCOUNTS & TRANSACTIONS
  getAccounts(): Account[] {
    this.ensureInitialized();
    return getStored<Account[]>(STORAGE_KEYS.ACCOUNTS, []);
  },

  recordBalanceAdjustment(data: {
    accountId: string;
    actualBalance: number;
    reason: string;
    date: string;
    responsibleUserId: string;
    idempotencyKey: string;
  }): Transaction {
    const transactions = this.getTransactions();
    if (transactions.some((item) => item.idempotencyKey === data.idempotencyKey)) {
      throw new Error('This balance adjustment has already been recorded');
    }
    const accounts = this.getAccounts();
    const account = accounts.find((item) => item.id === data.accountId);
    if (!account) throw new Error('Selected account does not exist');
    const previousBalance = Number(account.currentBalance) || 0;
    const difference = data.actualBalance - previousBalance;
    const now = new Date().toISOString();
    const transaction = buildBalanceAdjustmentTransaction(
      account,
      data,
      `adjust_${data.idempotencyKey}`,
      now
    );
    account.currentBalance = data.actualBalance;
    account.updatedAt = now;
    const audit = createFinanceAuditEntry(
      'balance_adjusted',
      'account',
      account.id,
      { balance: previousBalance },
      { balance: data.actualBalance, difference, transactionId: transaction.id },
      data.reason.trim()
    );
    setStoredAtomically([
      [STORAGE_KEYS.ACCOUNTS, accounts],
      [STORAGE_KEYS.TRANSACTIONS, [transaction, ...transactions]],
      [STORAGE_KEYS.FINANCE_AUDIT, [audit, ...this.getFinanceAuditEntries()]],
    ]);
    return transaction;
  },

  createAccount(data: Omit<Account, 'id' | 'createdAt' | 'updatedAt'>): Account {
    const accs = this.getAccounts();
    const now = new Date().toISOString();
    const newAcc: Account = {
      ...data,
      id: 'acc_' + Math.random().toString(36).substring(2, 9),
      createdAt: now,
      updatedAt: now,
    };
    accs.push(newAcc);
    setStored(STORAGE_KEYS.ACCOUNTS, accs);
    return newAcc;
  },

  updateAccount(id: string, updates: Partial<Account>): Account {
    const accs = this.getAccounts();
    const idx = accs.findIndex((a) => a.id === id);
    if (idx === -1) throw new Error('Account not found');

    const updated = {
      ...accs[idx],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    accs[idx] = updated;
    setStored(STORAGE_KEYS.ACCOUNTS, accs);
    return updated;
  },

  getTransactions(): Transaction[] {
    return getStored<Transaction[]>(STORAGE_KEYS.TRANSACTIONS, []).sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  },

  getJournalEntries(): JournalEntry[] {
    return getStored<JournalEntry[]>(STORAGE_KEYS.JOURNAL_ENTRIES, []);
  },

  getFinanceAuditEntries(): FinanceAuditEntry[] {
    return getStored<FinanceAuditEntry[]>(STORAGE_KEYS.FINANCE_AUDIT, []);
  },

  getFinanceCategories(type: FinanceCategoryType): FinanceCategory[] {
    return getStored<FinanceCategory[]>(STORAGE_KEYS.FINANCE_CATEGORIES, [])
      .filter((category) => category.type === type && !category.isArchived)
      .sort((a, b) => a.name.localeCompare(b.name));
  },

  saveFinanceCategory(type: FinanceCategoryType, name: string): FinanceCategory {
    const normalizedName = assertCustomFinanceCategoryName(type, name);
    const categories = getStored<FinanceCategory[]>(STORAGE_KEYS.FINANCE_CATEGORIES, []);
    const normalizedNameKey = financeCategoryKey(normalizedName);
    const existing = categories.find(
      (category) => category.type === type && category.normalizedName === normalizedNameKey
    );
    const now = new Date().toISOString();
    if (existing) {
      existing.isArchived = false;
      existing.updatedAt = now;
      setStored(STORAGE_KEYS.FINANCE_CATEGORIES, categories);
      return existing;
    }
    const category: FinanceCategory = {
      id: `cat_${Math.random().toString(36).substring(2, 9)}`,
      type,
      name: normalizedName,
      normalizedName: normalizedNameKey,
      isArchived: false,
      createdAt: now,
      updatedAt: now,
    };
    categories.push(category);
    setStored(STORAGE_KEYS.FINANCE_CATEGORIES, categories);
    return category;
  },

  archiveFinanceCategory(id: string): void {
    const categories = getStored<FinanceCategory[]>(STORAGE_KEYS.FINANCE_CATEGORIES, []);
    const category = categories.find((item) => item.id === id);
    if (!category) throw new Error('Category not found');
    category.isArchived = true;
    category.updatedAt = new Date().toISOString();
    setStored(STORAGE_KEYS.FINANCE_CATEGORIES, categories);
  },

  recordOtherInflow(data: {
    amount: number;
    accountId: string;
    classification: 'other_income' | 'owner_investment' | 'loan_received' | 'refund_received';
    date: string;
    note?: string;
    reference?: string;
    category?: string;
    transactionType: 'other_inflow' | 'owner_investment' | 'loan_received' | 'refund_received';
  }): Transaction {
    if (!Number.isFinite(data.amount) || data.amount <= 0) throw new Error('Amount must be greater than zero');
    const accounts = this.getAccounts();
    const account = accounts.find((item) => item.id === data.accountId);
    if (!account) throw new Error('Account not found');
    const now = new Date().toISOString();
    const transactionId = 'tx_' + Math.random().toString(36).substring(2, 9);
    const defaultCategory = data.classification === 'other_income' ? 'Other Income'
      : data.classification === 'owner_investment' ? 'Owner Investment'
      : data.classification === 'loan_received' ? 'Loan Received' : 'Refund Received';
    const category = data.category === '' ? undefined : data.category?.trim() || defaultCategory;
    const eventType = data.classification === 'owner_investment' ? 'owner_investment'
      : data.classification === 'loan_received' ? 'loan_received' : 'other_inflow';
    const transaction: Transaction = {
      id: transactionId,
      type: data.transactionType,
      amount: data.amount,
      accountId: account.id,
      accountName: account.name,
      ...(category ? { category } : {}),
      referenceId: data.reference || transactionId,
      eventType,
      date: data.date || now,
      note: data.note || '',
      createdAt: now,
    };
    const journalEntry = makeJournalEntry({
      id: transactionId,
      eventType,
      sourceId: transactionId,
      reference: transaction.referenceId || transactionId,
      date: transaction.date,
      note: transaction.note,
      lines: buildOtherInflowJournalLines(data.amount, account.id, data.classification),
    });
    account.currentBalance = (account.currentBalance || 0) + data.amount;
    account.updatedAt = now;
    setStored(STORAGE_KEYS.ACCOUNTS, accounts);
    setStored(STORAGE_KEYS.TRANSACTIONS, [transaction, ...this.getTransactions()]);
    setStored(STORAGE_KEYS.JOURNAL_ENTRIES, [journalEntry, ...this.getJournalEntries()]);
    return transaction;
  },

  deleteTransaction(id: string): void {
    const transactions = this.getTransactions();
    const transaction = transactions.find((item) => item.id === id);
    if (!transaction) throw new Error('Transaction not found');
    const journalEntries = this.getJournalEntries();
    const linkedJournals = journalEntries.filter((entry) => entry.sourceId === id);
    if (!isEditableManualTransaction(transaction, linkedJournals)) {
      throw new Error('This transaction is linked to another record and must be corrected from its original module');
    }
    const accounts = reverseManualTransactionBalances(this.getAccounts(), transaction);
    const audit = createFinanceAuditEntry(
      'transaction_deleted',
      'transaction',
      id,
      { ...transaction },
      undefined,
      'Manual transaction deleted and account effect reversed'
    );
    setStoredAtomically([
      [STORAGE_KEYS.ACCOUNTS, accounts],
      [STORAGE_KEYS.TRANSACTIONS, transactions.filter((item) => item.id !== id)],
      [STORAGE_KEYS.FINANCE_AUDIT, [audit, ...this.getFinanceAuditEntries()]],
    ]);
  },

  updateManualTransaction(id: string, update: ManualTransactionUpdate): Transaction {
    const transactions = this.getTransactions();
    const original = transactions.find((item) => item.id === id);
    if (!original) throw new Error('Transaction not found');
    const journalEntries = this.getJournalEntries();
    const linkedJournals = journalEntries.filter((entry) => entry.sourceId === id);
    if (!Number.isFinite(update.amount) || update.amount <= 0) {
      throw new Error('Amount must be greater than zero');
    }
    if (!update.accountId) throw new Error('Select an account');
    if (!Number.isFinite(new Date(update.date).getTime())) throw new Error('Enter a valid transaction date');

    const purchases = this.getPurchases();
    const linkedPurchase = original.referenceId
      ? purchases.find((item) => item.id === original.referenceId)
      : undefined;
    const isPurchasePayment = Boolean(
      linkedPurchase && isPurchasePaymentTransaction(original, [linkedPurchase])
    );
    if (!isEditableManualTransaction(original, linkedJournals) && !isPurchasePayment) {
      throw new Error('This transaction is linked to another record and must be corrected from its original module');
    }

    const accounts = calculateManualTransactionBalances(this.getAccounts(), original, update);
    const account = accounts.find((item) => item.id === update.accountId);
    if (!account) throw new Error('Selected account does not exist');
    let updated = buildUpdatedManualTransaction(original, update, account);
    const storageUpdates: Array<[string, unknown]> = [
      [STORAGE_KEYS.ACCOUNTS, accounts],
      [STORAGE_KEYS.TRANSACTIONS, transactions.map((item) => item.id === id ? updated : item)],
    ];
    let audit: FinanceAuditEntry;
    if (isPurchasePayment && linkedPurchase) {
      const paymentUpdate = buildUpdatedPurchasePayment(linkedPurchase, original, update, account);
      updated = { ...updated, category: original.category };
      storageUpdates[1] = [
        STORAGE_KEYS.TRANSACTIONS,
        transactions.map((item) => item.id === id ? updated : item),
      ];
      storageUpdates.push([
        STORAGE_KEYS.PURCHASES,
        purchases.map((item) => item.id === linkedPurchase.id ? paymentUpdate.purchase : item),
      ]);
      audit = createFinanceAuditEntry(
        'transaction_edited',
        'transaction',
        id,
        { transaction: original, purchase: linkedPurchase },
        { transaction: updated, purchase: paymentUpdate.purchase },
        update.reason?.trim() || 'Purchase payment corrected'
      );
    } else {
      audit = createFinanceAuditEntry(
        'transaction_edited',
        'transaction',
        id,
        { ...original },
        { ...updated },
        update.reason?.trim() || 'Manual transaction corrected'
      );
    }
    storageUpdates.push([STORAGE_KEYS.FINANCE_AUDIT, [audit, ...this.getFinanceAuditEntries()]]);
    setStoredAtomically(storageUpdates);
    return updated;
  },

  updateTransfer(id: string, update: TransferTransactionUpdate): Transaction {
    const transactions = this.getTransactions();
    const original = transactions.find((item) => item.id === id);
    if (!original) throw new Error('Transfer not found');
    if (this.getJournalEntries().some((entry) => entry.sourceId === id)) {
      throw new Error('This transfer is linked to accounting records and cannot be edited here');
    }
    if (!Number.isFinite(new Date(update.date).getTime())) throw new Error('Enter a valid transfer date');
    const accounts = calculateTransferBalances(this.getAccounts(), original, update);
    const source = accounts.find((account) => account.id === update.accountId);
    const destination = accounts.find((account) => account.id === update.targetAccountId);
    if (!source || !destination) throw new Error('One or more transfer accounts do not exist');
    const updated: Transaction = {
      ...original,
      amount: update.amount,
      accountId: source.id,
      accountName: source.name,
      targetAccountId: destination.id,
      targetAccountName: destination.name,
      category: 'Account Transfer',
      date: update.date,
      note: update.note?.trim() || `Transfer from ${source.name} to ${destination.name}`,
    };
    const audit = createFinanceAuditEntry(
      'transaction_edited',
      'transaction',
      id,
      { ...original },
      { ...updated },
      update.reason?.trim() || 'Account transfer corrected'
    );
    setStoredAtomically([
      [STORAGE_KEYS.ACCOUNTS, accounts],
      [STORAGE_KEYS.TRANSACTIONS, transactions.map((item) => item.id === id ? updated : item)],
      [STORAGE_KEYS.FINANCE_AUDIT, [audit, ...this.getFinanceAuditEntries()]],
    ]);
    return updated;
  },

  recordIncome(data: {
    amount: number;
    accountId: string;
    category?: string;
    date: string;
    note?: string;
    referenceId?: string;
  }): Transaction {
    if (!Number.isFinite(data.amount) || data.amount <= 0) {
      throw new Error('Amount must be greater than zero');
    }
    const accs = this.getAccounts();
    const acc = accs.find((a) => a.id === data.accountId);
    if (!acc) throw new Error('Account not found');

    acc.currentBalance = (acc.currentBalance || 0) + data.amount;
    acc.updatedAt = new Date().toISOString();
    setStored(STORAGE_KEYS.ACCOUNTS, accs);

    const txs = this.getTransactions();
    const now = new Date().toISOString();
    const newTx: Transaction = {
      id: 'tx_' + Math.random().toString(36).substring(2, 9),
      type: 'income',
      amount: data.amount,
      accountId: acc.id,
      accountName: acc.name,
      ...(data.category?.trim() ? { category: data.category.trim() } : {}),
      referenceId: data.referenceId || '',
      date: data.date || now,
      note: data.note || '',
      createdAt: now,
    };
    txs.unshift(newTx);
    setStored(STORAGE_KEYS.TRANSACTIONS, txs);
    return newTx;
  },

  recordExpense(data: {
    amount: number;
    accountId: string;
    category?: string;
    date: string;
    note?: string;
    referenceId?: string;
    transactionType?: 'expense' | 'purchase';
  }): Transaction {
    if (!Number.isFinite(data.amount) || data.amount <= 0) {
      throw new Error('Amount must be greater than zero');
    }
    const accs = this.getAccounts();
    const acc = accs.find((a) => a.id === data.accountId);
    if (!acc) throw new Error('Account not found');

    acc.currentBalance = (acc.currentBalance || 0) - data.amount;
    acc.updatedAt = new Date().toISOString();
    setStored(STORAGE_KEYS.ACCOUNTS, accs);

    const txs = this.getTransactions();
    const now = new Date().toISOString();
    const newTx: Transaction = {
      id: 'tx_' + Math.random().toString(36).substring(2, 9),
      type: data.transactionType || 'expense',
      amount: data.amount,
      accountId: acc.id,
      accountName: acc.name,
      ...(data.category?.trim() ? { category: data.category.trim() } : {}),
      referenceId: data.referenceId || '',
      date: data.date || now,
      note: data.note || '',
      createdAt: now,
    };
    txs.unshift(newTx);
    setStored(STORAGE_KEYS.TRANSACTIONS, txs);
    return newTx;
  },

  recordAssetPurchase(data: {
    amount: number;
    accountId: string;
    category?: string;
    date: string;
    note?: string;
  }): Transaction {
    if (!Number.isFinite(data.amount) || data.amount <= 0) {
      throw new Error('Amount must be greater than zero');
    }
    const accounts = this.getAccounts();
    const account = accounts.find((item) => item.id === data.accountId);
    if (!account) throw new Error('Account not found');

    const now = new Date().toISOString();
    account.currentBalance -= data.amount;
    account.updatedAt = now;
    setStored(STORAGE_KEYS.ACCOUNTS, accounts);

    const transaction: Transaction = {
      id: 'tx_' + Math.random().toString(36).substring(2, 9),
      type: 'asset',
      amount: data.amount,
      accountId: account.id,
      accountName: account.name,
      ...(data.category?.trim() ? { category: data.category.trim() } : {}),
      date: data.date || now,
      note: data.note || '',
      createdAt: now,
    };
    const transactions = this.getTransactions();
    transactions.unshift(transaction);
    setStored(STORAGE_KEYS.TRANSACTIONS, transactions);
    return transaction;
  },

  recordTransfer(data: {
    fromAccountId: string;
    toAccountId: string;
    amount: number;
    date: string;
    note?: string;
  }): Transaction {
    if (!Number.isFinite(data.amount) || data.amount <= 0) {
      throw new Error('Transfer amount must be greater than zero');
    }
    if (data.fromAccountId === data.toAccountId) {
      throw new Error('Source and destination accounts must be different');
    }
    const accs = this.getAccounts();
    const fromAcc = accs.find((a) => a.id === data.fromAccountId);
    const toAcc = accs.find((a) => a.id === data.toAccountId);
    if (!fromAcc || !toAcc) throw new Error('One or both accounts not found');

    fromAcc.currentBalance = (fromAcc.currentBalance || 0) - data.amount;
    toAcc.currentBalance = (toAcc.currentBalance || 0) + data.amount;
    fromAcc.updatedAt = new Date().toISOString();
    toAcc.updatedAt = new Date().toISOString();
    setStored(STORAGE_KEYS.ACCOUNTS, accs);

    const txs = this.getTransactions();
    const now = new Date().toISOString();
    const newTx: Transaction = {
      id: 'tx_' + Math.random().toString(36).substring(2, 9),
      type: 'transfer',
      amount: data.amount,
      accountId: fromAcc.id,
      accountName: fromAcc.name,
      targetAccountId: toAcc.id,
      targetAccountName: toAcc.name,
      category: 'Account Transfer',
      date: data.date || now,
      note: data.note || `Transfer from ${fromAcc.name} to ${toAcc.name}`,
      createdAt: now,
    };
    txs.unshift(newTx);
    setStored(STORAGE_KEYS.TRANSACTIONS, txs);
    return newTx;
  },

  // 8. SETTINGS
  getSettings(): BusinessSettings {
    const fallback: BusinessSettings = {
      id: 'general',
      businessName: '',
      phone: '',
      email: '',
      address: '',
      currency: 'BDT',
      currencySymbol: '৳',
      defaultDeliveryCharge: 80,
      orderPrefix: 'ORD',
      allowNegativeStock: false,
      defaultMinStockLevel: 5,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return getStored<BusinessSettings>(STORAGE_KEYS.SETTINGS, fallback);
  },

  updateSettings(updates: Partial<BusinessSettings>): BusinessSettings {
    const current = this.getSettings();
    const updated: BusinessSettings = {
      ...current,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    setStored(STORAGE_KEYS.SETTINGS, updated);
    return updated;
  },

  // 9. BACKUP & RESTORE
  exportAllDataJSON(): string {
    const backup = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      storageMode: this.getStorageMode(),
      products: this.getProducts(),
      movements: this.getMovements(),
      orders: this.getOrders(),
      customers: this.getCustomers(),
      suppliers: this.getSuppliers(),
      purchases: this.getPurchases(),
      expenses: this.getLinkedShippingExpenses(),
      accounts: this.getAccounts(),
      transactions: this.getTransactions(),
      financeAuditEntries: this.getFinanceAuditEntries(),
      settings: this.getSettings(),
    };
    return JSON.stringify(backup, null, 2);
  },

  importAllDataJSON(jsonStr: string): boolean {
    try {
      const data = JSON.parse(jsonStr);
      if (Array.isArray(data.products)) setStored(STORAGE_KEYS.PRODUCTS, data.products);
      if (Array.isArray(data.movements)) setStored(STORAGE_KEYS.MOVEMENTS, data.movements);
      if (Array.isArray(data.orders)) setStored(STORAGE_KEYS.ORDERS, data.orders);
      if (Array.isArray(data.customers)) setStored(STORAGE_KEYS.CUSTOMERS, data.customers);
      if (Array.isArray(data.suppliers)) setStored(STORAGE_KEYS.SUPPLIERS, data.suppliers);
      if (Array.isArray(data.purchases)) setStored(STORAGE_KEYS.PURCHASES, data.purchases);
      if (Array.isArray(data.expenses)) setStored(STORAGE_KEYS.EXPENSES, data.expenses);
      if (Array.isArray(data.accounts)) setStored(STORAGE_KEYS.ACCOUNTS, data.accounts);
      if (Array.isArray(data.transactions)) setStored(STORAGE_KEYS.TRANSACTIONS, data.transactions);
      if (Array.isArray(data.financeAuditEntries)) {
        setStored(STORAGE_KEYS.FINANCE_AUDIT, data.financeAuditEntries);
      }
      if (data.settings) setStored(STORAGE_KEYS.SETTINGS, data.settings);
      return true;
    } catch (err) {
      console.error('Failed to import backup data:', err);
      return false;
    }
  },

};
