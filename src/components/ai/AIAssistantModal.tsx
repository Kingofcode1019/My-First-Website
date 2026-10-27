import React, { useState, useRef, useEffect } from 'react';
import { useBusiness } from '../../context/BusinessContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { formatCurrency } from '../../lib/utils';
import {
  Sparkles,
  X,
  Send,
  Loader2,
  CheckCircle,
  ArrowRight,
} from 'lucide-react';
import { financeService } from '../../services/finance.service';
import { productsService } from '../../services/products.service';
import { auth } from '../../lib/firebase';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  proposedAction?: {
    actionType: string;
    data: any;
    executed?: boolean;
  };
}

interface AIAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AIAssistantModal: React.FC<AIAssistantModalProps> = ({ isOpen, onClose }) => {
  const { effectiveUid } = useAuth();
  const { products, orders, lowStockProducts, accounts, metrics, settings, refreshAll } =
    useBusiness();
  const { success, error: toastError } = useToast();

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: `Hello! I am your **Apex Operations AI**. I have live access to your catalog, orders, and wallets.

You can ask me questions like:
- *"How much revenue and profit did I make?"*
- *"Show my low stock items."*
- *"How much balance is in bKash?"*
- *"Record an expense of ৳500 for packaging"*
- *"Add 15 units of stock to Oxford Cotton Shirt"*`,
    },
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  if (!isOpen) return null;

  const handleSend = async (textToSend?: string) => {
    const query = textToSend || input;
    if (!query.trim() || loading) return;

    const userMsg: Message = {
      id: Math.random().toString(),
      role: 'user',
      content: query.trim(),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInput('');
    setLoading(true);

    try {
      // Build real-time context for prompt
      const context = {
        totalProducts: products.length,
        totalRevenue: metrics.totalRevenue,
        totalProfit: metrics.totalProfit,
        totalExpenses: metrics.totalExpenses,
        currency: `${settings.currency} (${settings.currencySymbol})`,
        lowStockProducts: lowStockProducts.map((p) => ({
          id: p.id,
          name: p.name,
          sku: p.sku,
          stock: p.currentStock,
          minStock: p.minStockLevel,
        })),
        recentOrders: orders.slice(0, 5).map((o) => ({
          orderNumber: o.orderNumber,
          customer: o.customerName,
          amount: o.totalAmount,
          status: o.orderStatus,
        })),
        accounts: accounts.map((a) => ({
          name: a.name,
          type: a.type,
          balance: a.currentBalance,
        })),
      };

      const idToken = await auth?.currentUser?.getIdToken();
      if (!idToken) throw new Error('Please sign in before using the AI assistant.');

      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          message: query.trim(),
          history: messages.slice(-6),
          context,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'AI service error');
      }

      const botMsg: Message = {
        id: Math.random().toString(),
        role: 'assistant',
        content: data.reply,
        proposedAction: data.proposedAction,
      };

      setMessages((prev) => [...prev, botMsg]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: Math.random().toString(),
          role: 'assistant',
          content: `Sorry, I encountered an issue connecting to the AI agent: ${err.message}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleExecuteAction = async (msgId: string, action: { actionType: string; data: any }) => {
    if (!effectiveUid) return;
    try {
      setLoading(true);

      if (action.actionType === 'recordExpense') {
        const defaultAcc = accounts[0];
        if (!defaultAcc) throw new Error('No financial accounts found to pay expense from.');

        await financeService.recordExpense(effectiveUid, {
          amount: Number(action.data.amount) || 0,
          accountId: defaultAcc.id,
          category: action.data.category || 'General Expense',
          date: new Date().toISOString(),
          note: action.data.note || 'Recorded via AI Assistant',
        });
        success(`Recorded expense of ${formatCurrency(action.data.amount, settings.currencySymbol)}!`);
      } else if (action.actionType === 'adjustStock') {
        // Find matching product
        const prod =
          products.find(
            (p) =>
              p.id === action.data.productId ||
              p.name.toLowerCase().includes(String(action.data.productName || '').toLowerCase()) ||
              p.sku.toLowerCase() === String(action.data.sku || '').toLowerCase()
          ) || products[0];

        if (!prod) throw new Error('Product not found in catalog');
        const qty = Number(action.data.quantity) || 1;
        await productsService.adjustStock(
          effectiveUid,
          prod.id,
          qty,
          'stock_in',
          action.data.reason || 'Restocked via AI Assistant'
        );
        success(`Added ${qty} units to ${prod.name}!`);
      }

      await refreshAll();

      // Mark executed
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId && m.proposedAction
            ? { ...m, proposedAction: { ...m.proposedAction, executed: true } }
            : m
        )
      );
    } catch (err: any) {
      toastError(err.message || 'Action failed');
    } finally {
      setLoading(false);
    }
  };

  const quickChips = [
    'How much revenue & profit did I make?',
    'Show my low-stock products',
    'How much money is in bKash?',
    'Record an expense of ৳450 for boxes',
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/40 backdrop-blur-xs">
      <div className="w-full max-w-lg bg-white border border-[#e9e4dc] rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col h-[85vh] sm:h-[600px] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#e9e4dc] bg-[#faf8f5]">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-[#23424d] text-white">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#1c1b18]">Apex Business AI</h3>
              <p className="text-[11px] text-[#706c64]">Powered by Gemini 3.8 Flash</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-[#706c64] hover:text-[#1c1b18] hover:bg-[#eae5dc] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Message Stream */}
        <div className="flex-1 p-4 overflow-y-auto space-y-3.5 text-xs bg-[#fbf9f6]">
          {messages.map((m) => {
            const isUser = m.role === 'user';
            return (
              <div
                key={m.id}
                className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl p-3.5 leading-relaxed whitespace-pre-wrap shadow-2xs ${
                    isUser
                      ? 'bg-[#23424d] text-white rounded-br-xs'
                      : 'bg-white border border-[#e9e4dc] text-[#1c1b18] rounded-bl-xs'
                  }`}
                >
                  {m.content}
                </div>

                {/* Proposed Action Confirmation Box */}
                {m.proposedAction && (
                  <div className="mt-2 p-3.5 bg-white border border-[#23424d]/30 rounded-2xl text-xs space-y-2 max-w-[85%] shadow-xs">
                    <div className="flex items-center gap-1.5 text-[#23424d] font-bold">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Proposed Action: {m.proposedAction.actionType}</span>
                    </div>
                    <pre className="p-2 bg-[#faf8f5] border border-[#e9e4dc] rounded-lg font-mono text-[10px] text-[#1c1b18] overflow-x-auto">
                      {JSON.stringify(m.proposedAction.data, null, 2)}
                    </pre>

                    {m.proposedAction.executed ? (
                      <span className="flex items-center gap-1 text-[#047857] font-semibold text-[11px]">
                        <CheckCircle className="w-3.5 h-3.5" /> Executed successfully
                      </span>
                    ) : (
                      <button
                        onClick={() => handleExecuteAction(m.id, m.proposedAction!)}
                        disabled={loading}
                        className="w-full py-2 px-3 bg-[#23424d] hover:bg-[#1a323b] font-semibold text-white rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5 text-xs shadow-xs"
                      >
                        <span>Confirm & Execute Action</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {loading && (
            <div className="flex items-center gap-2 text-[#706c64] text-xs p-2">
              <Loader2 className="w-4 h-4 animate-spin text-[#23424d]" />
              <span>Analyzing business data...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Quick Suggestion Chips */}
        <div className="px-3 py-2 bg-[#f6f3eb] border-t border-[#e9e4dc] overflow-x-auto flex items-center gap-1.5">
          {quickChips.map((chip, idx) => (
            <button
              key={idx}
              onClick={() => handleSend(chip)}
              className="px-2.5 py-1 text-[11px] text-[#706c64] hover:text-[#1c1b18] bg-white hover:bg-[#faf8f5] border border-[#d8d3c9] rounded-lg whitespace-nowrap transition-colors cursor-pointer shadow-2xs"
            >
              {chip}
            </button>
          ))}
        </div>

        {/* Input Bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="p-3 bg-white border-t border-[#e9e4dc] flex items-center gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about revenue, stock, or execute an action..."
            className="flex-1 px-3.5 py-2 bg-[#faf8f5] border border-[#d8d3c9] rounded-xl text-xs text-[#1c1b18] placeholder-[#8a857b] focus:outline-none focus:border-[#23424d]"
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="p-2 bg-[#23424d] hover:bg-[#1a323b] disabled:opacity-50 text-white rounded-xl transition-colors cursor-pointer shrink-0 shadow-xs"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
