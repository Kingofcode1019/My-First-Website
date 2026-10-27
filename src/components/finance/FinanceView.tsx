import React, { useState, useMemo, useEffect } from 'react';
import { Account, FinanceAuditEntry, Transaction, TransactionType } from '../../types';
import { useBusiness } from '../../context/BusinessContext';
import { formatCurrency, formatDateTime, exportToCSV } from '../../lib/utils';
import {
  Wallet,
  DollarSign,
  TrendingUp,
  CreditCard,
  Plus,
  ArrowRightLeft,
  Download,
  Search,
  ArrowDownLeft,
  ArrowUpRight,
  Edit2,
  Trash2,
  Scale,
  History,
  ShieldCheck,
  Pencil,
  ChevronDown,
  FileClock,
} from 'lucide-react';
import { AccountModal } from './AccountModal';
import { IncomeModal } from './IncomeModal';
import { ExpenseModal } from './ExpenseModal';
import { ProductPurchaseModal } from './ProductPurchaseModal';
import { PurchaseDueBalance } from './PurchaseDueBalance';
import { TransferModal } from './TransferModal';
import { EmptyState } from '../common/EmptyState';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { financeService } from '../../services/finance.service';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { EditManualTransactionModal } from './EditManualTransactionModal';
import { isPurchasePaymentTransaction, isStandaloneManualTransaction } from '../../lib/manualTransaction';
import { isOperatingExpenseTransaction } from '../../lib/financeCategories';
import { getPurchasePaymentSummary } from '../../lib/purchasePayment';
import { FinanceGuide } from './FinanceGuide';
import { BalanceAdjustmentModal } from './BalanceAdjustmentModal';
import { Modal } from '../common/Modal';
import { EditTransferModal } from './EditTransferModal';
import { featureFlagsService } from '../../services/featureFlags.service';

const txTypeBadgeStyles: Record<TransactionType, { bg: string; text: string; border: string }> = {
  sale: { bg: 'bg-[#ecfdf5]', text: 'text-[#047857]', border: 'border-[#a7f3d0]' },
  income: { bg: 'bg-[#f0fdfa]', text: 'text-[#0f766e]', border: 'border-[#99f6e4]' },
  expense: { bg: 'bg-[#fff1f2]', text: 'text-[#be123c]', border: 'border-[#fecdd3]' },
  asset: { bg: 'bg-[#fffbeb]', text: 'text-[#92400e]', border: 'border-[#fde68a]' },
  purchase: { bg: 'bg-[#f5f3ff]', text: 'text-[#6d28d9]', border: 'border-[#ede9fe]' },
  supplier_payment: { bg: 'bg-[#f5f3ff]', text: 'text-[#6d28d9]', border: 'border-[#ede9fe]' },
  ar_payment: { bg: 'bg-[#ecfdf5]', text: 'text-[#047857]', border: 'border-[#a7f3d0]' },
  customer_refund: { bg: 'bg-[#fff1f2]', text: 'text-[#be123c]', border: 'border-[#fecdd3]' },
  other_inflow: { bg: 'bg-[#f0fdfa]', text: 'text-[#0f766e]', border: 'border-[#99f6e4]' },
  owner_investment: { bg: 'bg-[#fffbeb]', text: 'text-[#92400e]', border: 'border-[#fde68a]' },
  loan_received: { bg: 'bg-[#f0f9ff]', text: 'text-[#0369a1]', border: 'border-[#bae6fd]' },
  refund_received: { bg: 'bg-[#fdf2f8]', text: 'text-[#be185d]', border: 'border-[#fce7f3]' },
  refund: { bg: 'bg-[#fdf2f8]', text: 'text-[#be185d]', border: 'border-[#fce7f3]' },
  transfer: { bg: 'bg-[#f0f9ff]', text: 'text-[#0369a1]', border: 'border-[#bae6fd]' },
  balance_adjustment: { bg: 'bg-[#fffbeb]', text: 'text-[#92400e]', border: 'border-[#fde68a]' },
  delivery_collection: { bg: 'bg-[#f0f9ff]', text: 'text-[#0369a1]', border: 'border-[#bae6fd]' },
  delivery_due_collection: { bg: 'bg-[#ecfdf5]', text: 'text-[#047857]', border: 'border-[#a7f3d0]' },
  courier_payment: { bg: 'bg-[#fff1f2]', text: 'text-[#be123c]', border: 'border-[#fecdd3]' },
  delivery_refund: { bg: 'bg-[#fdf2f8]', text: 'text-[#be185d]', border: 'border-[#fce7f3]' },
  delivery_income: { bg: 'bg-[#ecfdf5]', text: 'text-[#047857]', border: 'border-[#a7f3d0]' },
};

const auditActionStyles: Record<
  FinanceAuditEntry['action'],
  { label: string; icon: React.ComponentType<{ className?: string }>; color: string; description: string }
> = {
  transaction_edited: {
    label: 'Transaction edited',
    icon: Pencil,
    color: 'text-blue-700 bg-blue-50 border-blue-200',
    description: 'A finance transaction was corrected.',
  },
  transaction_deleted: {
    label: 'Transaction deleted',
    icon: Trash2,
    color: 'text-rose-700 bg-rose-50 border-rose-200',
    description: 'A manual transaction was deleted and its account effect reversed.',
  },
  purchase_edited: {
    label: 'Purchase edited',
    icon: Pencil,
    color: 'text-violet-700 bg-violet-50 border-violet-200',
    description: 'A purchase record was corrected without duplicating stock.',
  },
  balance_adjusted: {
    label: 'Balance reconciled',
    icon: Scale,
    color: 'text-amber-800 bg-amber-50 border-amber-200',
    description: 'An account balance was reconciled to its actual balance.',
  },
};

function auditValueLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function auditValueText(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

export const FinanceView: React.FC = () => {
  const { accounts, transactions, orders, products, suppliers, purchases, settings, refreshAll } = useBusiness();
  const { effectiveUid } = useAuth();
  const { success, error } = useToast();

  const [search, setSearch] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedAccount, setSelectedAccount] = useState<string>('all');

  // Modals state
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [isIncomeModalOpen, setIsIncomeModalOpen] = useState(false);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [isProductPurchaseModalOpen, setIsProductPurchaseModalOpen] = useState(false);
  const [isPurchaseDuePanelOpen, setIsPurchaseDuePanelOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isBalanceAdjustmentOpen, setIsBalanceAdjustmentOpen] = useState(false);
  const [balanceAdjustmentEnabled, setBalanceAdjustmentEnabled] = useState(false);
  const [isAuditHistoryOpen, setIsAuditHistoryOpen] = useState(false);
  const [auditEntries, setAuditEntries] = useState<FinanceAuditEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [deletingTransaction, setDeletingTransaction] = useState<Transaction | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [journalLinkedTransactionIds, setJournalLinkedTransactionIds] = useState<Set<string> | null>(null);
  const [journalCheckFailed, setJournalCheckFailed] = useState(false);
  const transactionIds = transactions.map((transaction) => transaction.id).join('|');

  useEffect(() => {
    let cancelled = false;
    featureFlagsService.getGlobalFlags()
      .then((flags) => {
        if (!cancelled) {
          setBalanceAdjustmentEnabled(flags.balanceAdjustment?.enabled === true);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setBalanceAdjustmentEnabled(false);
        error(err instanceof Error ? err.message : 'Could not load finance feature availability');
      });
    return () => { cancelled = true; };
  }, [error]);

  useEffect(() => {
    if (!effectiveUid) return;
    let cancelled = false;
    setJournalCheckFailed(false);
    setJournalLinkedTransactionIds(null);
    financeService.getJournalLinkedTransactionIds(effectiveUid)
      .then((ids) => {
        if (!cancelled) setJournalLinkedTransactionIds(new Set(ids));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setJournalCheckFailed(true);
        error(err instanceof Error ? err.message : 'Could not verify transaction links');
      });
    return () => { cancelled = true; };
  }, [effectiveUid, transactionIds, error]);

  const handleDeleteTransaction = async () => {
    if (!effectiveUid || !deletingTransaction) return;
    try {
      setDeleteLoading(true);
      await financeService.deleteTransaction(effectiveUid, deletingTransaction.id);
      success('Transaction deleted and account balance reversed');
      setDeletingTransaction(null);
      await refreshAll();
    } catch (err: any) {
      error(err.message || 'Failed to delete transaction');
    } finally {
      setDeleteLoading(false);
    }
  };

  const canEditTransaction = (transaction: Transaction) =>
    !transaction.linkedOrderId &&
    journalLinkedTransactionIds !== null &&
    !journalLinkedTransactionIds.has(transaction.id) &&
    (isStandaloneManualTransaction(transaction) ||
      isPurchasePaymentTransaction(transaction, purchases) ||
      (transaction.type === 'transfer' && Boolean(transaction.targetAccountId)));

  const canDeleteTransaction = (transaction: Transaction) =>
    !transaction.linkedOrderId &&
    journalLinkedTransactionIds !== null &&
    isStandaloneManualTransaction(transaction) &&
    !journalLinkedTransactionIds.has(transaction.id);

  // Financial calculations
  const finances = useMemo(() => {
    const totalLiquidCash = accounts
      .filter((a) => a.isActive)
      .reduce((sum, a) => sum + (a.currentBalance || 0), 0);

    const deliveredOrders = orders.filter((o) => o.orderStatus === 'delivered');
    const totalRevenue = deliveredOrders.reduce(
      (sum, o) => sum + Math.max(0, (o.subtotal || 0) - (o.discount || 0)),
      0
    );

    const totalCogs = deliveredOrders.reduce((sum, o) => {
      return (
        sum +
        o.items.reduce((s, it) => s + (it.purchasePrice || 0) * (it.quantity || 0), 0)
      );
    }, 0);

    const grossProfit = totalRevenue - totalCogs;

    const operatingExpenses = transactions
      .filter(isOperatingExpenseTransaction)
      .reduce((sum, t) => sum + t.amount, 0);

    const netProfit = grossProfit - operatingExpenses;

    return { totalLiquidCash, totalRevenue, totalCogs, grossProfit, operatingExpenses, netProfit };
  }, [accounts, orders, transactions]);

  const purchaseDueTotal = useMemo(
    () => purchases.reduce((sum, purchase) => {
      const payment = getPurchasePaymentSummary(
        Number(purchase.totalAmount ?? purchase.totalCost),
        purchase.amountPaid,
        purchase.paymentStatus
      );
      return sum + payment.amountDue;
    }, 0),
    [purchases]
  );

  // Filtered transactions
  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      if (selectedType !== 'all' && t.type !== selectedType) return false;
      if (selectedAccount !== 'all' && t.accountId !== selectedAccount && t.targetAccountId !== selectedAccount)
        return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchCat = t.category?.toLowerCase().includes(q) || false;
        const matchNote = t.note?.toLowerCase().includes(q) || false;
        const matchAcc = t.accountName?.toLowerCase().includes(q) || false;
        const matchRef = t.referenceId?.toLowerCase().includes(q) || false;
        if (!matchCat && !matchNote && !matchAcc && !matchRef) return false;
      }
      return true;
    });
  }, [transactions, selectedType, selectedAccount, search]);

  const handleExportCSV = () => {
    const headers = ['Date', 'Type', 'Amount', 'Source Account', 'Target Account', 'Category', 'Reference', 'Note'];
    const rows = filteredTransactions.map((t) => [
      formatDateTime(t.date),
      t.type,
      t.amount,
      t.accountName,
      t.targetAccountName || '',
      t.category || '',
      t.referenceId || '',
      t.note || '',
    ]);
    exportToCSV(`finance_ledger_${new Date().toISOString().slice(0, 10)}`, headers, rows);
  };

  const handleOpenAuditHistory = async () => {
    if (!effectiveUid) return;
    try {
      setAuditLoading(true);
      setIsAuditHistoryOpen(true);
      setAuditEntries(await financeService.getFinanceAuditEntries(effectiveUid));
    } catch (err) {
      error(err instanceof Error ? err.message : 'Could not load finance audit history');
      setIsAuditHistoryOpen(false);
    } finally {
      setAuditLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[#1c1b18] tracking-tight">Finance & Multi-Wallet Ledger</h2>
          <p className="text-xs text-[#706c64] mt-0.5">
            Real balances across Cash, bKash, and Banks with strict Revenue vs Profit tracking
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <button
            onClick={() => setIsIncomeModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#047857] bg-[#ecfdf5] hover:bg-[#d1fae5] border border-[#a7f3d0] rounded-lg transition-colors cursor-pointer"
          >
            <ArrowDownLeft className="w-3.5 h-3.5" />
            <span>+ Other Inflow</span>
          </button>

          <button
            onClick={() => setIsProductPurchaseModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#6d28d9] bg-[#f5f3ff] hover:bg-[#ede9fe] border border-[#ddd6fe] rounded-lg transition-colors cursor-pointer"
            title="Record an inventory purchase; payments are recorded in Due Balance"
          >
            <ArrowUpRight className="w-3.5 h-3.5" />
            <span>+ Product Purchase</span>
          </button>

          <button
            onClick={() => setIsExpenseModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#be123c] bg-[#fff1f2] hover:bg-[#ffe4e6] border border-[#fecdd3] rounded-lg transition-colors cursor-pointer"
          >
            <ArrowUpRight className="w-3.5 h-3.5" />
            <span>+ Expense</span>
          </button>

          <button
            onClick={() => setIsTransferModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#0369a1] bg-[#f0f9ff] hover:bg-[#e0f2fe] border border-[#bae6fd] rounded-lg transition-colors cursor-pointer"
          >
            <ArrowRightLeft className="w-3.5 h-3.5" />
            <span>⇆ Transfer</span>
          </button>

          {balanceAdjustmentEnabled && (
            <button
              onClick={() => setIsBalanceAdjustmentOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#92400e] bg-[#fffbeb] hover:bg-[#fef3c7] border border-[#fde68a] rounded-lg transition-colors cursor-pointer"
            >
              <Scale className="w-3.5 h-3.5" />
              <span>Adjust Balance</span>
            </button>
          )}

          <button
            onClick={handleOpenAuditHistory}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#4a4741] bg-white hover:bg-[#f7f4ee] border border-[#d8d3c9] rounded-lg transition-colors cursor-pointer"
          >
            <History className="w-3.5 h-3.5" />
            <span>Audit History</span>
          </button>

          <button
            onClick={() => {
              setEditingAccount(null);
              setIsAccountModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#23424d] hover:bg-[#1a323b] rounded-lg shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Account</span>
          </button>
        </div>
      </div>

      <FinanceGuide />

      {/* Financial Overview Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="min-h-[124px] flex flex-col p-3.5 bg-white border border-[#e9e4dc] rounded-2xl shadow-2xs">
          <span className="min-h-8 text-[11px] text-[#706c64] font-medium">Liquid Cash</span>
          <p className="text-base sm:text-lg font-bold font-mono text-[#0e7490] mt-0.5">
            {formatCurrency(finances.totalLiquidCash, settings.currencySymbol)}
          </p>
          <span className="mt-auto pt-1 text-[10px] text-[#8a857b]">{accounts.length} active wallets</span>
        </div>

        <div className="min-h-[124px] flex flex-col p-3.5 bg-white border border-[#e9e4dc] rounded-2xl shadow-2xs">
          <span className="min-h-8 text-[11px] text-[#706c64] font-medium">Product Revenue</span>
          <p className="text-base sm:text-lg font-bold font-mono text-[#047857] mt-0.5">
            {formatCurrency(finances.totalRevenue, settings.currencySymbol)}
          </p>
          <span className="mt-auto pt-1 text-[10px] text-[#8a857b]">Delivered sales, delivery excluded</span>
        </div>

        <div className="min-h-[124px] flex flex-col p-3.5 bg-white border border-[#e9e4dc] rounded-2xl shadow-2xs">
          <span className="min-h-8 text-[11px] text-[#706c64] font-medium">Cost of Goods (COGS)</span>
          <p className="text-base sm:text-lg font-bold font-mono text-[#706c64] mt-0.5">
            {formatCurrency(finances.totalCogs, settings.currencySymbol)}
          </p>
          <span className="mt-auto pt-1 text-[10px] text-[#8a857b]">Sold items inventory cost</span>
        </div>

        <div className="min-h-[124px] flex flex-col p-3.5 bg-white border border-[#e9e4dc] rounded-2xl shadow-2xs">
          <span className="min-h-8 text-[11px] text-[#706c64] font-medium">Gross Profit</span>
          <p className="text-base sm:text-lg font-bold font-mono text-[#23424d] mt-0.5">
            {formatCurrency(finances.grossProfit, settings.currencySymbol)}
          </p>
          <span className="mt-auto pt-1 text-[10px] text-[#8a857b]">Revenue - COGS</span>
        </div>

        <div className="min-h-[124px] flex flex-col p-3.5 bg-white border border-[#e9e4dc] rounded-2xl shadow-2xs">
          <span className="min-h-8 text-[11px] text-[#706c64] font-medium">Operating Expenses</span>
          <p className="text-base sm:text-lg font-bold font-mono text-[#be123c] mt-0.5">
            {formatCurrency(finances.operatingExpenses, settings.currencySymbol)}
          </p>
          <span className="mt-auto pt-1 text-[10px] text-[#8a857b]">Packaging, ads, rent</span>
        </div>

        <div className="min-h-[124px] flex flex-col p-3.5 bg-white border border-[#e9e4dc] rounded-2xl shadow-2xs">
          <span className="min-h-8 text-[11px] text-[#706c64] font-medium">Net Profit</span>
          <p
            className={`text-base sm:text-lg font-bold font-mono mt-0.5 ${
              finances.netProfit >= 0 ? 'text-[#047857]' : 'text-[#be123c]'
            }`}
          >
            {formatCurrency(finances.netProfit, settings.currencySymbol)}
          </p>
          <span className="mt-auto pt-1 text-[10px] text-[#8a857b]">Gross profit - expenses</span>
        </div>

        <div className="min-h-[124px] flex flex-col p-3.5 bg-white border border-[#e9e4dc] rounded-2xl shadow-2xs">
          <span className="min-h-8 text-[11px] text-[#706c64] font-medium">Due Balance</span>
          <p className="text-base sm:text-lg font-bold font-mono text-[#be123c] mt-0.5">
            {formatCurrency(purchaseDueTotal, settings.currencySymbol)}
          </p>
          <button
            type="button"
            onClick={() => setIsPurchaseDuePanelOpen(true)}
            className="mt-auto flex w-full items-center justify-center rounded-lg border border-[#23424d] bg-[#23424d] px-2.5 py-1.5 text-[10px] font-semibold text-white shadow-xs transition-colors hover:bg-[#1a323b] cursor-pointer"
            aria-label={`See inventory purchase due details: ${formatCurrency(purchaseDueTotal, settings.currencySymbol)}`}
          >
            See details
          </button>
        </div>

      </div>

      <PurchaseDueBalance
        isOpen={isPurchaseDuePanelOpen}
        onClose={() => setIsPurchaseDuePanelOpen(false)}
        purchases={purchases}
        products={products}
        suppliers={suppliers}
        accounts={accounts}
        currencySymbol={settings.currencySymbol}
        onSaved={async () => {
          await refreshAll();
        }}
      />
      <div>
        <h3 className="text-xs font-bold text-[#706c64] uppercase tracking-wider mb-2.5">
          Payment Wallets & Cash Accounts
        </h3>
        {accounts.length === 0 ? (
          <div className="p-6 bg-white border border-[#e9e4dc] rounded-2xl text-center text-xs text-[#706c64]">
            No financial accounts set up yet. Add an account like "Cash in Hand" or "bKash".
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {accounts.map((acc) => (
              <div
                key={acc.id}
                className="p-3.5 rounded-2xl bg-white border border-[#e9e4dc] hover:border-[#23424d]/40 transition-colors shadow-2xs flex flex-col justify-between"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-[#f0ede4] text-[#23424d]">
                      <Wallet className="w-4 h-4" />
                    </div>
                    <span className="font-bold text-[#1c1b18] text-xs truncate max-w-[130px]">
                      {acc.name}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      setEditingAccount(acc);
                      setIsAccountModalOpen(true);
                    }}
                    className="p-1 rounded text-[#706c64] hover:text-[#1c1b18] hover:bg-[#f7f4ee] transition-colors cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div>
                  <span className="text-[10px] text-[#8a857b] uppercase tracking-wider">
                    Current Balance
                  </span>
                  <p className="text-lg font-bold font-mono text-[#1c1b18]">
                    {formatCurrency(acc.currentBalance, settings.currencySymbol)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Unified Transactions Ledger */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h3 className="text-xs font-bold text-[#706c64] uppercase tracking-wider">
            Unified Transaction Ledger
          </h3>
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#1c1b18] bg-white hover:bg-[#f7f4ee] border border-[#d8d3c9] rounded-lg transition-colors cursor-pointer self-start sm:self-auto shadow-2xs"
          >
            <Download className="w-3.5 h-3.5 text-[#706c64]" />
            <span>Export CSV</span>
          </button>
        </div>

        {/* Filter row */}
        <div className="p-3 bg-white border border-[#e9e4dc] rounded-2xl shadow-2xs grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8a857b]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search category, note, reference..."
              className="w-full pl-9 pr-3 py-2 bg-white border border-[#d8d3c9] rounded-lg text-[#1c1b18] placeholder-[#8a857b] focus:outline-none focus:border-[#23424d]"
            />
          </div>

          <div>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg text-[#1c1b18] focus:outline-none focus:border-[#23424d]"
            >
              <option value="all">All Transaction Types</option>
              <option value="sale">Sale (Order Fulfillment)</option>
              <option value="income">Income (Direct / Offline)</option>
              <option value="expense">Operating Expense</option>
              <option value="asset">Equipment / Fixed Asset</option>
              <option value="purchase">Stock Purchase</option>
              <option value="supplier_payment">Supplier Payment</option>
              <option value="refund">Refund / Return</option>
              <option value="transfer">Account Transfer</option>
            </select>
          </div>

          <div>
            <select
              value={selectedAccount}
              onChange={(e) => setSelectedAccount(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg text-[#1c1b18] focus:outline-none focus:border-[#23424d]"
            >
              <option value="all">All Wallets & Accounts</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Table */}
        {filteredTransactions.length === 0 ? (
          <EmptyState
            icon={CreditCard}
            title="No financial transactions recorded"
            description="Transactions are created when orders are delivered, expenses are entered, or transfers are processed."
          />
        ) : (
          <div className="bg-white border border-[#e9e4dc] rounded-2xl overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#faf8f5] border-b border-[#e9e4dc] text-[#706c64] font-medium">
                  <tr>
                    <th className="py-3 px-4">Date & Time</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">Wallet Account</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4 text-right">Amount</th>
                    <th className="py-3 px-4">Note / Reference</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e9e4dc]">
                  {filteredTransactions.map((tx) => {
                    const badge = txTypeBadgeStyles[tx.type] || txTypeBadgeStyles.expense;
                    const isCredit = ['sale', 'income', 'ar_payment', 'other_inflow', 'owner_investment', 'loan_received', 'refund_received', 'delivery_collection', 'delivery_due_collection', 'delivery_income'].includes(tx.type) ||
                      (tx.type === 'balance_adjustment' && (tx.adjustmentDifference || 0) > 0);
                    const isDebit = ['expense', 'purchase', 'supplier_payment', 'asset', 'refund', 'customer_refund', 'courier_payment', 'delivery_refund'].includes(tx.type) ||
                      (tx.type === 'balance_adjustment' && (tx.adjustmentDifference || 0) < 0);

                    return (
                      <tr key={tx.id} className="hover:bg-[#fcfaf7] transition-colors">
                        <td className="py-3 px-4 text-[#706c64] text-[11px] whitespace-nowrap">
                          {formatDateTime(tx.date)}
                        </td>

                        <td className="py-3 px-4">
                          <span
                            className={`inline-block px-2 py-0.5 text-[10px] font-semibold rounded-md border capitalize ${badge.bg} ${badge.text} ${badge.border}`}
                          >
                            {tx.type}
                          </span>
                        </td>

                        <td className="py-3 px-4 text-[#1c1b18] font-medium">
                          {tx.type === 'transfer' ? (
                            <span>
                              {tx.accountName} → {tx.targetAccountName}
                            </span>
                          ) : (
                            tx.accountName
                          )}
                        </td>

                        <td className="py-3 px-4 text-[#4a4741]">{tx.category || '—'}</td>

                        <td className="py-3 px-4 text-right font-mono font-bold">
                          <span
                            className={
                              isCredit
                                ? 'text-[#047857]'
                                : isDebit
                                ? 'text-[#be123c]'
                                : 'text-[#0369a1]'
                            }
                          >
                            {tx.type === 'balance_adjustment'
                              ? `${(tx.adjustmentDifference || 0) > 0 ? '+' : (tx.adjustmentDifference || 0) < 0 ? '-' : ''}${formatCurrency(tx.amount, settings.currencySymbol)}`
                              : `${isCredit ? '+' : isDebit ? '-' : '⇆'}${formatCurrency(tx.amount, settings.currencySymbol)}`}
                          </span>
                        </td>

                        <td className="py-3 px-4 text-[#706c64]">
                          <p className="truncate max-w-[200px]">{tx.note || '—'}</p>
                          {tx.referenceId && (
                            <span className="text-[10px] font-mono text-[#8a857b] block truncate">
                              Ref: {tx.referenceId}
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-4 text-right">
                          {canEditTransaction(tx) ? (
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => setEditingTransaction(tx)}
                                title={tx.type === 'transfer'
                                  ? 'Edit transfer and update both account balances atomically'
                                  : isPurchasePaymentTransaction(tx, purchases)
                                  ? 'Edit linked purchase payment and recalculate purchase due and account balances'
                                  : 'Edit manual transaction and recalculate account balances'}
                                className="p-1.5 rounded-lg text-[#23424d] hover:bg-[#eef3f4] transition-colors cursor-pointer"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              {canDeleteTransaction(tx) && (
                                <button
                                  type="button"
                                  onClick={() => setDeletingTransaction(tx)}
                                  disabled={deleteLoading}
                                  title="Delete manual transaction and reverse account balance"
                                  className="p-1.5 rounded-lg text-[#be123c] hover:bg-[#fff1f2] transition-colors cursor-pointer disabled:opacity-50"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          ) : (
                            <span
                              className="text-[10px] text-[#8a857b]"
                              title={journalCheckFailed
                                ? 'Actions are unavailable because linked accounting records could not be checked.'
                                : journalLinkedTransactionIds === null
                                  ? 'Checking linked accounting records.'
                                  : 'Correct this transaction from its original module to preserve linked balances and records.'}
                            >
                              {journalCheckFailed
                                ? 'Link check unavailable'
                                : journalLinkedTransactionIds === null
                                  ? 'Checking links...'
                                  : 'Correct in original module'}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Account Modal */}
      <AccountModal
        isOpen={isAccountModalOpen}
        onClose={() => setIsAccountModalOpen(false)}
        account={editingAccount}
        currencySymbol={settings.currencySymbol}
        onSaved={refreshAll}
      />

      {/* Income Modal */}
      <IncomeModal
        isOpen={isIncomeModalOpen}
        onClose={() => setIsIncomeModalOpen(false)}
        accounts={accounts}
        currencySymbol={settings.currencySymbol}
        onSaved={refreshAll}
      />

      {/* Expense Modal */}
      <ExpenseModal
        isOpen={isExpenseModalOpen}
        onClose={() => setIsExpenseModalOpen(false)}
        accounts={accounts}
        currencySymbol={settings.currencySymbol}
        onSaved={refreshAll}
      />

      <ProductPurchaseModal
        isOpen={isProductPurchaseModalOpen}
        onClose={() => setIsProductPurchaseModalOpen(false)}
        products={products}
        suppliers={suppliers}
        currencySymbol={settings.currencySymbol}
        onSaved={refreshAll}
      />

      <EditManualTransactionModal
        isOpen={!!editingTransaction && editingTransaction.type !== 'transfer'}
        transaction={editingTransaction}
        accounts={accounts}
        currencySymbol={settings.currencySymbol}
        onClose={() => setEditingTransaction(null)}
        onSaved={refreshAll}
      />

      <EditTransferModal
        isOpen={editingTransaction?.type === 'transfer'}
        transaction={editingTransaction?.type === 'transfer' ? editingTransaction : null}
        accounts={accounts}
        currencySymbol={settings.currencySymbol}
        onClose={() => setEditingTransaction(null)}
        onSaved={refreshAll}
      />

      <BalanceAdjustmentModal
        isOpen={isBalanceAdjustmentOpen && balanceAdjustmentEnabled}
        accounts={accounts}
        currencySymbol={settings.currencySymbol}
        onClose={() => setIsBalanceAdjustmentOpen(false)}
        onSaved={refreshAll}
      />

      <Modal
        isOpen={isAuditHistoryOpen}
        onClose={() => setIsAuditHistoryOpen(false)}
        title="Finance Audit History"
        subtitle="Review preserved corrections and account reconciliations."
        maxWidth="3xl"
      >
        <div className="space-y-5">
          <div className="flex items-start gap-3 rounded-2xl border border-[#dce6e6] bg-gradient-to-br from-[#f3f8f7] to-[#faf8f5] p-4 sm:p-5">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#23424d] text-white shadow-sm">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <h4 className="text-sm font-bold text-[#1c1b18]">A clear record of important finance changes</h4>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-[#706c64]">
                Edits, deletions, purchase corrections, and account reconciliations are preserved here for review.
                Open any entry to inspect the recorded values before and after the change.
              </p>
            </div>
          </div>

          {!auditLoading && auditEntries.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: 'Total events', value: auditEntries.length, icon: History, tone: 'text-[#23424d] bg-[#edf4f3]' },
                { label: 'Reconciliations', value: auditEntries.filter((entry) => entry.action === 'balance_adjusted').length, icon: Scale, tone: 'text-amber-800 bg-amber-50' },
                { label: 'Corrections', value: auditEntries.filter((entry) => entry.action === 'transaction_edited' || entry.action === 'purchase_edited').length, icon: Pencil, tone: 'text-blue-700 bg-blue-50' },
                { label: 'Deletions', value: auditEntries.filter((entry) => entry.action === 'transaction_deleted').length, icon: Trash2, tone: 'text-rose-700 bg-rose-50' },
              ].map(({ label, value, icon: Icon, tone }) => (
                <div key={label} className="rounded-xl border border-[#e9e4dc] bg-white p-3 sm:p-3.5">
                  <div className={`mb-2 grid h-8 w-8 place-items-center rounded-lg ${tone}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <p className="text-lg font-bold leading-none text-[#1c1b18]">{value}</p>
                  <p className="mt-1.5 text-[10px] font-medium text-[#706c64] sm:text-[11px]">{label}</p>
                </div>
              ))}
            </div>
          )}

          {auditLoading ? (
            <div className="grid place-items-center rounded-2xl border border-[#e9e4dc] bg-[#faf8f5] px-4 py-12 text-center">
              <span className="mb-3 grid h-10 w-10 place-items-center rounded-full bg-white text-[#23424d] shadow-sm">
                <FileClock className="h-5 w-5 animate-pulse" />
              </span>
              <p className="text-xs font-semibold text-[#1c1b18]">Loading audit history</p>
              <p className="mt-1 text-[11px] text-[#8a857b]">Fetching saved finance activity…</p>
            </div>
          ) : auditEntries.length === 0 ? (
            <div className="grid place-items-center rounded-2xl border border-dashed border-[#d8d3c9] bg-[#faf8f5] px-4 py-12 text-center">
              <span className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-white text-[#8a857b] shadow-sm">
                <History className="h-5 w-5" />
              </span>
              <h4 className="text-sm font-bold text-[#1c1b18]">No audit activity yet</h4>
              <p className="mt-1 max-w-sm text-xs leading-relaxed text-[#706c64]">
                Finance corrections and account reconciliations will appear here when recorded.
              </p>
            </div>
          ) : (
            <div className="max-h-[54vh] space-y-3 overflow-y-auto pr-1">
              {auditEntries.map((entry) => {
                const style = auditActionStyles[entry.action];
                const Icon = style?.icon || History;
                const values = [...new Set([
                  ...Object.keys(entry.previousValues || {}),
                  ...Object.keys(entry.newValues || {}),
                ])];

                return (
                  <article key={entry.id} className="overflow-hidden rounded-2xl border border-[#e9e4dc] bg-white shadow-2xs">
                    <div className="p-4 sm:p-5">
                      <div className="flex items-start gap-3">
                        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border ${style?.color || 'text-[#23424d] bg-[#edf4f3] border-[#dce6e6]'}`}>
                          <Icon className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-bold sm:text-[11px] ${style?.color || 'text-[#23424d] bg-[#edf4f3] border-[#dce6e6]'}`}>
                              {style?.label || auditValueLabel(entry.action)}
                            </span>
                            <time className="inline-flex items-center gap-1.5 text-[10px] font-medium text-[#8a857b] sm:text-[11px]">
                              <FileClock className="h-3.5 w-3.5" />
                              {formatDateTime(entry.timestamp)}
                            </time>
                          </div>
                          <p className="mt-2 text-xs leading-relaxed text-[#4a4741]">
                            {entry.reason || style?.description}
                          </p>
                          <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px]">
                            <span className="rounded-md bg-[#f6f3eb] px-2 py-1 font-semibold capitalize text-[#4a4741]">{entry.recordType}</span>
                            <span className="max-w-full truncate rounded-md border border-[#e9e4dc] px-2 py-1 font-mono text-[#706c64]" title={entry.recordId}>
                              Ref: {entry.recordId}
                            </span>
                            <span className="text-[#8a857b]">Recorded by <strong className="font-medium text-[#4a4741]">{entry.responsibleUserId}</strong></span>
                          </div>
                        </div>
                      </div>
                    </div>
                    {values.length > 0 && (
                      <details className="group border-t border-[#f0ede6] bg-[#fcfbf9]">
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-xs font-semibold text-[#23424d] sm:px-5 [&::-webkit-details-marker]:hidden">
                          <span className="inline-flex items-center gap-2">
                            <span className="grid h-6 w-6 place-items-center rounded-md bg-white text-[#23424d] shadow-2xs">
                              <History className="h-3.5 w-3.5" />
                            </span>
                            View recorded values
                          </span>
                          <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
                        </summary>
                        <div className="grid grid-cols-1 gap-3 border-t border-[#f0ede6] p-3 sm:grid-cols-2 sm:p-4">
                          {[
                            { label: 'Before', values: entry.previousValues },
                            { label: 'After', values: entry.newValues },
                          ].map(({ label, values: snapshot }) => (
                            <div key={label} className="overflow-hidden rounded-xl border border-[#e9e4dc] bg-white">
                              <div className={`border-b border-[#e9e4dc] px-3 py-2 text-[10px] font-bold uppercase tracking-wider ${label === 'Before' ? 'text-[#706c64] bg-[#f8f5ee]' : 'text-[#047857] bg-[#f0f9f5]'}`}>
                                {label}
                              </div>
                              {snapshot && Object.keys(snapshot).length > 0 ? (
                                <dl className="divide-y divide-[#f0ede6]">
                                  {Object.entries(snapshot).map(([key, value]) => (
                                    <div key={key} className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-3 px-3 py-2">
                                      <dt className="text-[10px] font-medium text-[#8a857b]">{auditValueLabel(key)}</dt>
                                      <dd className="break-words whitespace-pre-wrap text-right font-mono text-[10px] text-[#4a4741]">{auditValueText(value)}</dd>
                                    </div>
                                  ))}
                                </dl>
                              ) : (
                                <p className="px-3 py-4 text-center text-[10px] text-[#8a857b]">No values recorded</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </Modal>

      {/* Transfer Modal */}
      <TransferModal
        isOpen={isTransferModalOpen}
        onClose={() => setIsTransferModalOpen(false)}
        accounts={accounts}
        currencySymbol={settings.currencySymbol}
        onSaved={refreshAll}
      />

      <ConfirmDialog
        isOpen={!!deletingTransaction}
        onClose={() => setDeletingTransaction(null)}
        onConfirm={handleDeleteTransaction}
        loading={deleteLoading}
        title="Delete Manual Transaction"
        message={`Delete this ${deletingTransaction?.type} of ${formatCurrency(deletingTransaction?.amount || 0, settings.currencySymbol)}? This permanently removes the manual transaction and reverses its effect on ${deletingTransaction?.accountName || 'the account'} balance.`}
        confirmLabel="Delete Transaction"
        isDestructive
      />
    </div>
  );
};
