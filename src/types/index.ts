export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'returned'
  | 'cancelled';

export type PaymentStatus = 'pending' | 'unpaid' | 'partially_paid' | 'paid' | 'refunded';
export type SalesChannel = 'online' | 'offline';
export type PaymentEventType = 'sale_payment' | 'ar_payment' | 'customer_refund';
export type DeliveryCollectionMethod = 'advance' | 'on_delivery' | 'business_paid' | 'undecided';
export type DeliveryResponsibleParty = 'customer' | 'business' | 'other';
export type DeliveryChargePaymentStatus = 'unpaid' | 'partially_paid' | 'paid' | 'not_applicable';

export type AccountingAccount =
  | 'cash'
  | 'accounts_receivable'
  | 'inventory'
  | 'accounts_payable'
  | 'sales_revenue'
  | 'other_income'
  | 'delivery_income'
  | 'cogs'
  | 'operating_expense'
  | 'owner_equity'
  | 'loan_payable';

export type ReturnCondition = 'sellable' | 'damaged';
export type FinanceCategoryType = 'income' | 'expense';

export type InventoryMovementType =
  | 'stock_in'
  | 'stock_out'
  | 'sale'
  | 'return'
  | 'damage'
  | 'adjustment'
  | 'purchase'
  | 'reservation'
  | 'reservation_release';

export type AccountType =
  | 'cash'
  | 'bkash'
  | 'nagad'
  | 'rocket'
  | 'bank'
  | 'wallet'
  | 'savings'
  | 'other';

export type TransactionType =
  | 'income'
  | 'expense'
  | 'asset'
  | 'sale'
  | 'refund'
  | 'purchase'
  | 'supplier_payment'
  | 'ar_payment'
  | 'customer_refund'
  | 'other_inflow'
  | 'owner_investment'
  | 'loan_received'
  | 'refund_received'
  | 'transfer'
  | 'balance_adjustment'
  | 'delivery_collection'
  | 'delivery_due_collection'
  | 'courier_payment'
  | 'delivery_refund'
  | 'delivery_income';

export interface Product {
  id: string;
  name: string;
  sku: string;
  category: string;
  brand?: string;
  description?: string;
  imageUrl?: string;
  purchasePrice: number;
  sellingPrice: number;
  currentStock: number;
  reservedStock?: number;
  minStockLevel: number;
  unit: string;
  supplierId?: string;
  supplierName?: string;
  status: 'active' | 'archived';
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface InventoryMovement {
  id: string;
  productId: string;
  productName: string;
  sku?: string;
  quantity: number; // positive or negative based on perspective or delta
  prevStock: number;
  newStock: number;
  type: InventoryMovementType;
  supplierName?: string;
  referenceId?: string; // Order ID, Purchase ID, or Adjustment ref
  reason?: string;
  date: string;
  createdBy?: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  city?: string;
  area?: string;
  notes?: string;
  totalOrders: number;
  deliveredOrders: number;
  pendingOrders: number;
  cancelledOrders: number;
  returnedOrders: number;
  totalSpent: number;
  ltv: number;
  lastOrderDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrderItem {
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  sellingPrice: number;
  purchasePrice: number;
  total: number;
}

export interface OrderPayment {
  id: string;
  type: PaymentEventType;
  amount: number;
  accountId?: string;
  accountName?: string;
  date: string;
  reference?: string;
  note?: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  invoiceNumber?: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  customerCity?: string;
  items: OrderItem[];
  subtotal: number;
  discount: number;
  deliveryCharge: number;
  deliveryCollectionMethod?: DeliveryCollectionMethod;
  deliveryResponsibleParty?: DeliveryResponsibleParty;
  deliveryPaymentStatus?: DeliveryChargePaymentStatus;
  deliveryAmountCollected?: number;
  deliveryAmountPaidToCourier?: number;
  actualCourierCharge?: number;
  actualReturnCharge?: number;
  deliveryAmountBusinessBorne?: number;
  deliveryAmountCustomerOwes?: number;
  deliveryChargeNotes?: string;
  deliverySettlements?: DeliverySettlement[];
  deliveryIncomeAmount?: number;
  totalAmount: number;
  paymentMethod: string;
  paymentAccountId?: string;
  paymentStatus: PaymentStatus;
  saleChannel?: SalesChannel;
  amountPaid?: number;
  amountDue?: number;
  payments?: OrderPayment[];
  orderStatus: OrderStatus;
  returnCondition?: ReturnCondition;
  stockDeducted: boolean;
  stockReserved?: boolean;
  saleRecognized?: boolean;
  revenueRecorded: boolean;
  orderDate: string;
  expectedDeliveryDate?: string;
  deliveredDate?: string;
  cancelledDate?: string;
  deliveryLoss?: number;
  returnedDate?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DeliverySettlement {
  id: string;
  type: 'collection' | 'courier_payment' | 'refund' | 'customer_receivable' | 'customer_due_payment' | 'income';
  amount: number;
  accountId?: string;
  accountName?: string;
  responsibleParty?: DeliveryResponsibleParty;
  date: string;
  note?: string;
  reference?: string;
}

export interface Supplier {
  id: string;
  code: string;
  name: string;
  company: string;
  phone: string;
  email?: string;
  address?: string;
  notes?: string;
  totalPurchases: number;
  /** Legacy payment totals retained only when present in historical records. */
  amountPaid?: number;
  amountDue?: number;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseItem {
  productId: string;
  productName: string;
  quantity: number;
  purchasePrice: number;
  effectiveUnitCost: number;
  totalCost: number;
}

export interface PurchasePayment {
  id: string;
  amount: number;
  accountId: string;
  accountName: string;
  date: string;
  note?: string;
}

export interface Purchase {
  id: string;
  supplierId?: string;
  supplierName?: string;
  items: PurchaseItem[];
  subtotal: number;
  shippingCost: number;
  totalAmount: number;
  /** Legacy total used by existing purchase summaries. */
  totalCost: number;
  /** Legacy payment fields retained for previously saved purchases. */
  amountPaid?: number;
  paymentStatus?: 'paid' | 'due' | 'partial';
  payments?: PurchasePayment[];
  accountId?: string;
  accountName?: string;
  notes?: string;
  date: string;
  createdAt: string;
}

export interface LinkedShippingExpense {
  id: string;
  purchaseId: string;
  supplierId: string;
  supplierName: string;
  billedBy?: 'supplier' | 'courier';
  category: 'Freight & Shipping';
  amount: number;
  capitalizedAmount: number;
  expenseAmount: number;
  /** Legacy payment fields retained for previously saved shipping records. */
  amountPaid?: number;
  paymentStatus?: 'paid' | 'due';
  accountId?: string;
  accountName?: string;
  date: string;
  createdAt: string;
  note?: string;
}

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  startingBalance: number;
  currentBalance: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface JournalLine {
  account: AccountingAccount;
  debit: number;
  credit: number;
  accountId?: string;
}

export interface JournalEntry {
  id: string;
  eventType: 'sale' | 'inventory_purchase' | 'operating_expense' | 'ar_payment' | 'supplier_payment' | 'owner_investment' | 'loan_received' | 'transfer' | 'customer_refund' | 'other_inflow';
  sourceId: string;
  reference: string;
  date: string;
  note?: string;
  lines: JournalLine[];
  createdAt: string;
}

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  accountId: string;
  accountName: string;
  targetAccountId?: string;
  targetAccountName?: string;
  category?: string;
  referenceId?: string;
  eventType?: JournalEntry['eventType'];
  orderId?: string;
  customerId?: string;
  supplierId?: string;
  previousBalance?: number;
  adjustedBalance?: number;
  adjustmentDifference?: number;
  adjustmentReason?: string;
  adjustedBy?: string;
  idempotencyKey?: string;
  linkedOrderId?: string;
  deliveryEventType?: DeliverySettlement['type'];
  date: string;
  note?: string;
  createdAt: string;
}

export interface FinanceCategory {
  id: string;
  type: FinanceCategoryType;
  name: string;
  normalizedName: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export type FinanceAuditAction =
  | 'transaction_edited'
  | 'transaction_deleted'
  | 'purchase_edited'
  | 'balance_adjusted';

export interface FinanceAuditEntry {
  id: string;
  action: FinanceAuditAction;
  recordType: 'transaction' | 'purchase' | 'account';
  recordId: string;
  previousValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  reason: string;
  responsibleUserId: string;
  timestamp: string;
}

export interface BusinessSettings {
  id: string;
  businessName: string;
  phone: string;
  email: string;
  address: string;
  currency: string;
  currencySymbol: string;
  defaultDeliveryCharge: number;
  orderPrefix: string;
  allowNegativeStock: boolean;
  defaultMinStockLevel: number;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardMetrics {
  totalRevenue: number;
  totalProfit: number;
  totalExpenses: number;
  totalCogs?: number;
  grossProfit?: number;
  netProfit?: number;
  accountsReceivable?: number;
  accountsPayable?: number;
  totalOrders: number;
  deliveredOrders: number;
  pendingOrders: number;
  returnedOrders: number;
  cancelledOrders: number;
  totalProducts: number;
  totalInventoryValue: number;
  lowStockProductsCount: number;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: 'warning' | 'info' | 'success' | 'danger';
  timestamp: string;
  read: boolean;
  link?: string;
}
