import React, { useState, useEffect } from 'react';
import { useBusiness } from '../../context/BusinessContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  Settings,
  Save,
  HardDrive,
  Copy,
  Check,
  ShieldCheck,
  Key,
} from 'lucide-react';
import { PersonalStorageModal } from '../layout/PersonalStorageModal';

export const SettingsView: React.FC = () => {
  const { settings, updateSettings } = useBusiness();
  const { effectiveUid, isCustomConfig, isFirebaseConfigured } = useAuth();
  const { success, error } = useToast();

  const [businessName, setBusinessName] = useState(settings.businessName);
  const [phone, setPhone] = useState(settings.phone);
  const [email, setEmail] = useState(settings.email);
  const [address, setAddress] = useState(settings.address);
  const [currency, setCurrency] = useState(settings.currency);
  const [currencySymbol, setCurrencySymbol] = useState(settings.currencySymbol);
  const [defaultDeliveryCharge, setDefaultDeliveryCharge] = useState(settings.defaultDeliveryCharge);
  const [orderPrefix, setOrderPrefix] = useState(settings.orderPrefix);
  const [defaultMinStockLevel, setDefaultMinStockLevel] = useState(settings.defaultMinStockLevel);
  const [saving, setSaving] = useState(false);

  const [copiedUid, setCopiedUid] = useState(false);
  const [isStorageModalOpen, setIsStorageModalOpen] = useState(false);

  useEffect(() => {
    setBusinessName(settings.businessName);
    setPhone(settings.phone);
    setEmail(settings.email);
    setAddress(settings.address);
    setCurrency(settings.currency);
    setCurrencySymbol(settings.currencySymbol);
    setDefaultDeliveryCharge(settings.defaultDeliveryCharge);
    setOrderPrefix(settings.orderPrefix);
    setDefaultMinStockLevel(settings.defaultMinStockLevel);
  }, [settings]);

  const handleCopyUid = () => {
    navigator.clipboard.writeText(effectiveUid);
    setCopiedUid(true);
    success('Storage UID copied to clipboard');
    setTimeout(() => setCopiedUid(false), 2000);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      await updateSettings({
        businessName: businessName.trim(),
        phone: phone.trim(),
        email: email.trim(),
        address: address.trim(),
        currency: currency.trim(),
        currencySymbol: currencySymbol.trim(),
        defaultDeliveryCharge: Number(defaultDeliveryCharge) || 0,
        orderPrefix: orderPrefix.trim(),
        defaultMinStockLevel: Number(defaultMinStockLevel) || 5,
      });
      success('Business settings successfully saved');
    } catch (err: any) {
      error(err.message || 'Failed to update settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Title */}
      <div>
        <h2 className="text-lg font-bold text-[#1c1b18] tracking-tight">System & Business Settings</h2>
        <p className="text-xs text-[#706c64] mt-0.5">
          Configure business details, personal storage partition, currency defaults, and fulfillment charges
        </p>
      </div>

      {/* Personal Storage Partition Banner */}
      <div className="p-5 bg-white border border-[#e9e4dc] rounded-2xl shadow-2xs space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#e9e4dc] pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#f6f3eb] text-[#c85a32]">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#1c1b18]">Personal Storage & Database Partition</h3>
              <p className="text-[11px] text-[#706c64]">
                Multi-tenant isolated data space with browser-persistent partition UID
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold rounded-full bg-[#ecfdf5] text-[#065f46] border border-[#a7f3d0]">
              <ShieldCheck className="w-3.5 h-3.5" /> Isolated Partition
            </span>
            <button
              type="button"
              onClick={() => setIsStorageModalOpen(true)}
              className="px-3 py-1.5 text-xs font-semibold text-[#1c1b18] bg-[#f6f3eb] hover:bg-[#eae4d9] border border-[#e5dfd2] rounded-lg transition-colors cursor-pointer"
            >
              Configure Storage
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div>
            <label className="block text-[#706c64] text-[11px] font-medium mb-1">
              Active Storage Identifier (UID):
            </label>
            <div className="flex items-center gap-2">
              <span className="flex-1 px-3 py-2 bg-[#faf8f5] border border-[#d8d3c9] rounded-lg font-mono text-[11px] text-[#1c1b18] truncate select-all">
                {effectiveUid}
              </span>
              <button
                type="button"
                onClick={handleCopyUid}
                className="flex items-center gap-1 px-3 py-2 bg-white border border-[#d8d3c9] hover:bg-[#f7f4ee] rounded-lg text-[#1c1b18] font-semibold transition-colors cursor-pointer"
              >
                {copiedUid ? <Check className="w-3.5 h-3.5 text-[#047857]" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedUid ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-[#706c64] text-[11px] font-medium mb-1">
              Connected Cloud Storage:
            </label>
            <div className="px-3 py-2 bg-[#faf8f5] border border-[#d8d3c9] rounded-lg font-mono text-[11px] text-[#1c1b18] truncate flex items-center justify-between">
              <span>{isCustomConfig ? 'Custom cloud connection' : 'System cloud connection'}</span>
              <span className="text-[10px] font-sans font-semibold text-[#706c64]">
                {isCustomConfig ? 'Custom' : isFirebaseConfigured ? 'Connected' : 'Not connected'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Settings Form */}
      <form onSubmit={handleSave} className="space-y-6 text-xs">
        {/* Business Profile */}
        <div className="p-5 bg-white border border-[#e9e4dc] rounded-2xl shadow-2xs space-y-4">
          <h3 className="text-sm font-bold text-[#1c1b18] border-b border-[#e9e4dc] pb-2">
            Store Profile & Branding
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[#4a4741] font-medium mb-1">Business Name *</label>
              <input
                type="text"
                required
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg text-[#1c1b18] focus:outline-none focus:border-[#23424d]"
              />
            </div>

            <div>
              <label className="block text-[#4a4741] font-medium mb-1">Official Contact Phone</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg text-[#1c1b18] font-mono focus:outline-none focus:border-[#23424d]"
              />
            </div>

            <div>
              <label className="block text-[#4a4741] font-medium mb-1">Contact Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg text-[#1c1b18] focus:outline-none focus:border-[#23424d]"
              />
            </div>

            <div>
              <label className="block text-[#4a4741] font-medium mb-1">Office / Warehouse Address</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg text-[#1c1b18] focus:outline-none focus:border-[#23424d]"
              />
            </div>
          </div>
        </div>

        {/* Currency & Financial Defaults */}
        <div className="p-5 bg-white border border-[#e9e4dc] rounded-2xl shadow-2xs space-y-4">
          <h3 className="text-sm font-bold text-[#1c1b18] border-b border-[#e9e4dc] pb-2">
            Currency & Fulfillment Defaults
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-[#4a4741] font-medium mb-1">Currency Code *</label>
              <input
                type="text"
                required
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                placeholder="BDT, USD, EUR"
                className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg text-[#1c1b18] font-mono focus:outline-none focus:border-[#23424d]"
              />
            </div>

            <div>
              <label className="block text-[#4a4741] font-medium mb-1">Currency Symbol *</label>
              <input
                type="text"
                required
                value={currencySymbol}
                onChange={(e) => setCurrencySymbol(e.target.value)}
                placeholder="৳, $, €"
                className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg text-[#1c1b18] font-mono focus:outline-none focus:border-[#23424d]"
              />
            </div>

            <div>
              <label className="block text-[#4a4741] font-medium mb-1">Default Delivery Charge</label>
              <input
                type="number"
                min="0"
                value={defaultDeliveryCharge}
                onChange={(e) => setDefaultDeliveryCharge(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg text-[#1c1b18] font-mono focus:outline-none focus:border-[#23424d]"
              />
            </div>

            <div>
              <label className="block text-[#4a4741] font-medium mb-1">Order ID Prefix</label>
              <input
                type="text"
                value={orderPrefix}
                onChange={(e) => setOrderPrefix(e.target.value)}
                placeholder="ORD"
                className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg text-[#1c1b18] font-mono focus:outline-none focus:border-[#23424d]"
              />
            </div>

            <div>
              <label className="block text-[#4a4741] font-medium mb-1">
                Default Low Stock Alert Threshold
              </label>
              <input
                type="number"
                min="1"
                value={defaultMinStockLevel}
                onChange={(e) => setDefaultMinStockLevel(parseInt(e.target.value) || 5)}
                className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg text-[#1c1b18] font-mono focus:outline-none focus:border-[#23424d]"
              />
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 font-semibold text-white bg-[#23424d] hover:bg-[#1a323b] rounded-lg shadow-xs transition-colors cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Saving...' : 'Save Settings'}</span>
          </button>
        </div>
      </form>

      <PersonalStorageModal
        isOpen={isStorageModalOpen}
        onClose={() => setIsStorageModalOpen(false)}
      />
    </div>
  );
};
