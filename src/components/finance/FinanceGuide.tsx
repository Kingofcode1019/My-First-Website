import React, { useState } from 'react';
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Boxes,
  Calculator,
  CheckCircle2,
  CircleDollarSign,
  Package,
  ReceiptText,
  Truck,
  Wallet,
} from 'lucide-react';
import { Modal } from '../common/Modal';

const guideSections = [
  {
    icon: Wallet,
    title: 'Money in and money out',
    color: 'text-[#047857] bg-[#ecfdf5]',
    content: (
      <>
        <p>
          Use <strong>Other Inflow</strong> when money arrives outside a recorded product sale, and
          <strong> Expense</strong> for a business cost. Choose the account that received or paid the
          money. The selected account balance changes by the amount entered.
        </p>
        <p>
          Category and description are optional. Income entered here is not product-sale revenue.
          Product sales are counted from delivered orders, so do not enter a sale again as an inflow.
          Transfers move money between accounts and are not revenue or expenses.
        </p>
      </>
    ),
  },
  {
    icon: Package,
    title: 'Purchases and restocking',
    color: 'text-[#6d28d9] bg-[#f5f3ff]',
    content: (
      <>
        <p>
          Record a purchase from <strong>Finance → Product Purchase</strong> or restock from
          Inventory. Both paths create inventory purchase history and increase stock; neither
          deducts money nor creates a payment automatically. The purchase is initially unpaid.
        </p>
        <p>
          The purchase total is product quantities multiplied by unit costs, plus freight or shipping
          where entered. Freight is allocated across the purchased units for inventory costing.
          Restocking updates the product’s current weighted purchase cost.
        </p>
      </>
    ),
  },
  {
    icon: CircleDollarSign,
    title: 'Paid, partial, and unpaid purchases',
    color: 'text-[#be123c] bg-[#fff1f2]',
    content: (
      <>
        <p>
          Open the <strong>Due Balance</strong> card to see each outstanding purchase, its supplier,
          total, paid amount, and remaining due. Purchases without a selected supplier are grouped
          under <strong>Unassigned Supplier</strong>.
        </p>
        <p>
          Use <strong>Pay Due</strong> only when you actually pay. Enter the full or partial amount
          and choose the account used. That amount is deducted from the account, added to the
          purchase’s paid total, and the remaining due is recalculated. Payment does not add stock
          again and Product Purchase payments are excluded from operating expenses.
        </p>
      </>
    ),
  },
  {
    icon: Truck,
    title: 'Suppliers and product SKUs',
    color: 'text-[#0369a1] bg-[#f0f9ff]',
    content: (
      <>
        <p>
          Supplier records hold seller details and help identify who supplied a purchase. The
          Unassigned Supplier group tracks purchases when you do not know or have not registered the
          seller. Purchase history and due amounts belong to each purchase record.
        </p>
        <p>
          A product <strong>SKU</strong> is its stock-keeping code for identifying the product in
          product and inventory views. It is not a payment, purchase, or supplier balance.
        </p>
      </>
    ),
  },
  {
    icon: Boxes,
    title: 'Inventory value and COGS',
    color: 'text-[#0e7490] bg-[#ecfeff]',
    content: (
      <>
        <p>
          Inventory’s <strong>Total Cost Valuation</strong> uses active products’ available stock
          multiplied by each product’s current purchase cost. <strong>Retail Selling Value</strong>
          uses available stock multiplied by selling price. Potential Gross Margin is the estimated
          difference between those totals; it is not realized profit.
        </p>
        <p>
          <strong>COGS</strong> is calculated from the purchase cost saved on items in delivered
          orders. It represents the cost of goods sold, not the cost of all stock purchased.
          Purchase payments do not add to COGS a second time.
        </p>
      </>
    ),
  },
  {
    icon: Calculator,
    title: 'Revenue and profit cards',
    color: 'text-[#92400e] bg-[#fffbeb]',
    content: (
      <>
        <p>
          Product Revenue sums delivered orders’ item subtotal after discounts; the Finance summary
          excludes delivery charges. Customer collections do not record that sales revenue again.
        </p>
        <p>
          <strong>Gross Profit = Product Revenue − COGS.</strong> Operating Expenses sum expense
          transactions except Product Purchase / Inventory Purchase. <strong>Net Profit = Gross
          Profit − Operating Expenses.</strong> The app’s summary uses these current card
          calculations; it is not the same as cash on hand.
        </p>
      </>
    ),
  },
];

export const FinanceGuide: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="group flex w-full items-center justify-between gap-4 rounded-2xl border border-[#d8e4e7] bg-gradient-to-r from-white to-[#f0f9f8] p-4 text-left shadow-2xs transition hover:border-[#9bb8bf] hover:shadow-sm"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="rounded-xl bg-[#e8f0ee] p-2.5 text-[#23424d]">
            <BookOpen className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-bold text-[#1c1b18]">How Finance Works</span>
            <span className="mt-0.5 block text-xs text-[#706c64]">
              Learn how purchases, payments, stock value, sales, and profit fit together.
            </span>
          </span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#23424d] px-3 py-2 text-xs font-semibold text-white transition group-hover:bg-[#1a323b]">
          Open guide <ArrowRight className="h-3.5 w-3.5" />
        </span>
      </button>

      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="How Finance Works"
        subtitle="A practical guide to money, inventory, purchases, and profit in Business Manager."
        maxWidth="4xl"
      >
        <div className="space-y-5">
          <div className="rounded-xl border border-[#d8e4e7] bg-[#f0f9f8] p-4">
            <h4 className="flex items-center gap-2 text-sm font-bold text-[#23424d]">
              <CheckCircle2 className="h-4 w-4" /> The simple rule
            </h4>
            <p className="mt-1.5 text-xs leading-5 text-[#4a4741]">
              Inventory actions manage products and stock. Finance actions record money. Buying
              stock raises inventory and creates a purchase record; only a separately recorded
              payment changes an account balance.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {guideSections.map(({ icon: Icon, title, color, content }) => (
              <section key={title} className="rounded-xl border border-[#e9e4dc] bg-white p-4">
                <h4 className="flex items-center gap-2 text-sm font-bold text-[#1c1b18]">
                  <span className={`rounded-lg p-1.5 ${color}`}><Icon className="h-4 w-4" /></span>
                  {title}
                </h4>
                <div className="mt-3 space-y-2 text-xs leading-5 text-[#5d5850]">{content}</div>
              </section>
            ))}
          </div>

          <section className="rounded-xl border border-[#e9e4dc] bg-[#faf8f5] p-4">
            <h4 className="flex items-center gap-2 text-sm font-bold text-[#1c1b18]">
              <ReceiptText className="h-4 w-4 text-[#23424d]" /> A typical purchase-to-sale example
            </h4>
            <ol className="mt-3 grid grid-cols-1 gap-3 text-xs leading-5 text-[#5d5850] sm:grid-cols-3">
              <li className="rounded-lg bg-white p-3">
                <span className="mb-1 flex items-center gap-1 font-bold text-[#6d28d9]"><Package className="h-3.5 w-3.5" /> 1. Buy stock</span>
                Record the products, quantities, costs, and supplier (or Unassigned Supplier).
                Stock rises; account balance stays the same.
              </li>
              <li className="rounded-lg bg-white p-3">
                <span className="mb-1 flex items-center gap-1 font-bold text-[#be123c]"><ArrowUpRight className="h-3.5 w-3.5" /> 2. Pay when ready</span>
                In Due Balance, choose the purchase, amount, and account. Paid total rises, due falls,
                and only the payment is deducted from the account.
              </li>
              <li className="rounded-lg bg-white p-3">
                <span className="mb-1 flex items-center gap-1 font-bold text-[#047857]"><ArrowDownLeft className="h-3.5 w-3.5" /> 3. Sell products</span>
                Record the order. Delivered orders feed Product Revenue and COGS; inventory stock is
                reduced by the sales workflow.
              </li>
            </ol>
          </section>

          <p className="text-[11px] leading-4 text-[#8a857b]">
            Note: COGS uses the purchase cost saved on each order item. Inventory valuation uses
            each active product’s current cost and stock, so historical order costs and current
            inventory values are separate figures.
          </p>
        </div>
      </Modal>
    </>
  );
};
