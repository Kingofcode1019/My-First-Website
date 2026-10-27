import React, { useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock3, Edit2, Wallet, X } from 'lucide-react';
import { Account, Product, Purchase, Supplier } from '../../types';
import { formatCurrency, formatDate, localDateTimeInputToISOString, toLocalDateTimeInput } from '../../lib/utils';
import { getPurchasePaymentSummary } from '../../lib/purchasePayment';
import { purchasesService } from '../../services/purchases.service';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Modal } from '../common/Modal';
import { EditPurchaseModal } from '../purchases/EditPurchaseModal';

interface PurchaseDueBalanceProps {
  isOpen: boolean;
  onClose: () => void;
  purchases: Purchase[];
  products: Product[];
  suppliers: Supplier[];
  accounts: Account[];
  currencySymbol: string;
  onSaved: () => Promise<void>;
}

export const PurchaseDueBalance: React.FC<PurchaseDueBalanceProps> = ({
  isOpen,
  onClose,
  purchases,
  products,
  suppliers,
  accounts,
  currencySymbol,
  onSaved,
}) => {
  const { effectiveUid } = useAuth();
  const { success, error } = useToast();
  const [selectedPurchase, setSelectedPurchase] = useState<Purchase | null>(null);
  const [editingPurchase, setEditingPurchase] = useState<Purchase | null>(null);
  const [amount, setAmount] = useState(0);
  const [accountId, setAccountId] = useState(accounts[0]?.id || '');
  const [date, setDate] = useState(toLocalDateTimeInput);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);

  const outstandingPurchases = useMemo(() => purchases.map((purchase) => {
    const payment = getPurchasePaymentSummary(
      Number(purchase.totalAmount ?? purchase.totalCost),
      purchase.amountPaid,
      purchase.paymentStatus
    );
    return { purchase, payment };
  }).filter(({ payment }) => payment.amountDue > 0), [purchases]);

  const totalDue = outstandingPurchases.reduce((sum, item) => sum + item.payment.amountDue, 0);
  const selectedSummary = selectedPurchase
    ? getPurchasePaymentSummary(
      Number(selectedPurchase.totalAmount ?? selectedPurchase.totalCost),
      selectedPurchase.amountPaid,
      selectedPurchase.paymentStatus
    )
    : null;

  const getSupplierName = (purchase: Purchase) =>
    suppliers.find((supplier) => supplier.id === purchase.supplierId)?.company ||
    purchase.supplierName ||
    'Unassigned Supplier';

  const openPayModal = (purchase: Purchase) => {
    setSelectedPurchase(purchase);
    const due = getPurchasePaymentSummary(
      Number(purchase.totalAmount ?? purchase.totalCost),
      purchase.amountPaid,
      purchase.paymentStatus
    ).amountDue;
    setAmount(due);
    setAccountId(accounts[0]?.id || '');
    setDate(toLocalDateTimeInput());
    setNote('');
  };

  const handlePay = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!effectiveUid || !selectedPurchase || !selectedSummary) return;
    if (!Number.isFinite(amount) || amount <= 0 || amount > selectedSummary.amountDue) {
      error('Enter a payment greater than zero and no more than the remaining due');
      return;
    }
    if (!accountId) {
      error('Select the account used for this payment');
      return;
    }
    if (!date || !Number.isFinite(new Date(date).getTime())) {
      error('Enter a valid payment date');
      return;
    }

    try {
      setLoading(true);
      await purchasesService.recordPurchasePayment(effectiveUid, {
        purchaseId: selectedPurchase.id,
        amount,
        accountId,
        date: localDateTimeInputToISOString(date),
        note: note.trim(),
      });
      success(`${formatCurrency(amount, currencySymbol)} payment recorded from ${accounts.find((account) => account.id === accountId)?.name || 'selected account'}.`);
      setSelectedPurchase(null);
      await onSaved();
    } catch (err) {
      error(err instanceof Error ? err.message : 'Failed to record purchase payment');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/40" onClick={onClose}>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="purchase-due-panel-title"
            className="flex h-full w-full max-w-5xl flex-col overflow-hidden border-l border-[#e9e4dc] bg-white shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-[#e9e4dc] bg-[#faf8f5] px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-[#fff1f2] p-2 text-[#be123c]"><AlertCircle className="h-4 w-4" /></div>
                <div>
                  <h3 id="purchase-due-panel-title" className="text-sm font-bold text-[#1c1b18]">Inventory Purchase Due Balance</h3>
                  <p className="mt-0.5 text-[11px] text-[#706c64]">Payments reduce an account only when you record them here.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close due balance panel"
                className="rounded-lg p-2 text-[#706c64] hover:bg-[#eae5dc] hover:text-[#1c1b18]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="border-b border-[#e9e4dc] bg-white px-5 py-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#706c64]">Total outstanding due</p>
              <p className="mt-1 font-mono text-2xl font-bold text-[#be123c]">{formatCurrency(totalDue, currencySymbol)}</p>
            </div>

            <div className="flex-1 overflow-y-auto">
              {outstandingPurchases.length === 0 ? (
                <div className="flex h-full min-h-60 flex-col items-center justify-center gap-2 px-5 py-8 text-center text-xs text-[#706c64]">
                  <CheckCircle2 className="h-6 w-6 text-[#047857]" />
                  <p className="font-semibold text-[#1c1b18]">No inventory purchase dues</p>
                  <p>Unpaid purchase records will appear here.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[820px] text-left text-xs">
                    <thead className="sticky top-0 border-b border-[#e9e4dc] bg-[#faf8f5] text-[10px] uppercase tracking-wide text-[#706c64]">
                      <tr>
                        <th className="px-4 py-3">Purchase / Product</th>
                        <th className="px-4 py-3">Supplier</th>
                        <th className="px-4 py-3">Date</th>
                        <th className="px-4 py-3 text-right">Purchase Total</th>
                        <th className="px-4 py-3 text-right">Paid</th>
                        <th className="px-4 py-3 text-right">Due</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#f0ede6]">
                      {outstandingPurchases.map(({ purchase, payment }) => (
                        <tr key={purchase.id} className="hover:bg-[#fcfaf7]">
                          <td className="px-4 py-3">
                            <p className="font-semibold text-[#1c1b18]">{purchase.items.map((item) => item.productName).join(', ')}</p>
                            <p className="mt-0.5 font-mono text-[10px] text-[#8a857b]">{purchase.id}</p>
                          </td>
                          <td className="px-4 py-3 text-[#4a4741]">{getSupplierName(purchase)}</td>
                          <td className="px-4 py-3 text-[#706c64]">{formatDate(purchase.date)}</td>
                          <td className="px-4 py-3 text-right font-mono">{formatCurrency(Number(purchase.totalAmount ?? purchase.totalCost), currencySymbol)}</td>
                          <td className="px-4 py-3 text-right font-mono text-[#047857]">{formatCurrency(payment.amountPaid, currencySymbol)}</td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-[#be123c]">{formatCurrency(payment.amountDue, currencySymbol)}</td>
                          <td className="px-4 py-3 text-right">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => setEditingPurchase(purchase)}
                                title="Edit this inventory purchase"
                                className="inline-flex items-center gap-1 rounded-lg border border-[#d8d3c9] px-2.5 py-1.5 text-[11px] font-semibold text-[#23424d] hover:bg-[#f7f4ee]"
                              >
                                <Edit2 className="h-3.5 w-3.5" /> Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => openPayModal(purchase)}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-[#23424d] px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-[#1a323b]"
                              >
                                <Wallet className="h-3.5 w-3.5" /> Pay Due
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      <Modal
        isOpen={!!selectedPurchase}
        onClose={() => !loading && setSelectedPurchase(null)}
        title="Pay Inventory Purchase Due"
        subtitle={selectedPurchase ? `${selectedPurchase.id} · ${getSupplierName(selectedPurchase)}` : undefined}
        maxWidth="md"
      >
        {selectedPurchase && selectedSummary && (
          <form onSubmit={handlePay} className="space-y-4 text-xs">
            <div className="rounded-xl border border-[#e9e4dc] bg-[#faf8f5] p-3">
              <div className="flex justify-between"><span className="text-[#706c64]">Purchase total</span><strong className="font-mono">{formatCurrency(Number(selectedPurchase.totalAmount ?? selectedPurchase.totalCost), currencySymbol)}</strong></div>
              <div className="mt-1 flex justify-between"><span className="text-[#706c64]">Previously paid</span><strong className="font-mono text-[#047857]">{formatCurrency(selectedSummary.amountPaid, currencySymbol)}</strong></div>
              <div className="mt-1 flex justify-between"><span className="font-semibold text-[#1c1b18]">Remaining due</span><strong className="font-mono text-[#be123c]">{formatCurrency(selectedSummary.amountDue, currencySymbol)}</strong></div>
            </div>

            <div>
              <label className="mb-1 block font-medium text-[#4a4741]">Payment Amount ({currencySymbol}) *</label>
              <input
                type="number"
                required
                min="0.01"
                max={selectedSummary.amountDue}
                step="any"
                value={amount || ''}
                onChange={(event) => setAmount(Number(event.target.value) || 0)}
                className="w-full rounded-lg border border-[#d8d3c9] bg-white px-3 py-2 font-mono"
              />
              <button
                type="button"
                onClick={() => setAmount(selectedSummary.amountDue)}
                className="mt-1 text-[10px] font-semibold text-[#23424d] hover:underline"
              >
                Pay full remaining due
              </button>
            </div>

            <div>
              <label className="mb-1 block font-medium text-[#4a4741]">Pay From Account *</label>
              <select
                required
                value={accountId}
                onChange={(event) => setAccountId(event.target.value)}
                className="w-full rounded-lg border border-[#d8d3c9] bg-white px-3 py-2"
              >
                <option value="">Select account</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} ({formatCurrency(account.currentBalance, currencySymbol)})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block font-medium text-[#4a4741]">Payment Date *</label>
              <input type="datetime-local" required value={date} onChange={(event) => setDate(event.target.value)} className="w-full rounded-lg border border-[#d8d3c9] bg-white px-3 py-2 font-mono" />
            </div>

            <div>
              <label className="mb-1 block font-medium text-[#4a4741]">Note (optional)</label>
              <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Receipt / reference" className="w-full rounded-lg border border-[#d8d3c9] bg-white px-3 py-2" />
            </div>

            <p className="flex items-start gap-2 border-t border-[#e9e4dc] pt-3 text-[11px] text-[#706c64]">
              <Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Only this payment amount will be deducted from the selected account and added to this purchase’s paid total.
            </p>

            <div className="flex justify-end gap-2 border-t border-[#e9e4dc] pt-3">
              <button type="button" onClick={() => setSelectedPurchase(null)} disabled={loading} className="rounded-lg border border-[#d8d3c9] px-4 py-2">Cancel</button>
              <button type="submit" disabled={loading || accounts.length === 0} className="rounded-lg bg-[#23424d] px-4 py-2 font-semibold text-white disabled:opacity-50">
                {loading ? 'Recording payment…' : 'Record Payment'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      <EditPurchaseModal
        purchase={editingPurchase}
        products={products}
        suppliers={suppliers}
        currencySymbol={currencySymbol}
        onClose={() => setEditingPurchase(null)}
        onSaved={onSaved}
      />
    </>
  );
};
