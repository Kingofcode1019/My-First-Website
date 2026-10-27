import React, { useState, useRef } from 'react';
import { Modal } from '../common/Modal';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { useToast } from '../../context/ToastContext';
import {
  HardDrive,
  Database,
  User,
  Copy,
  Check,
  Download,
  Upload,
  ShieldCheck,
  Cloud,
} from 'lucide-react';

interface PersonalStorageModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PersonalStorageModal: React.FC<PersonalStorageModalProps> = ({
  isOpen,
  onClose,
}) => {
  const {
    user,
    effectiveUid,
    storageMode,
    setStorageMode,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    logout,
    exportBackupJSON,
    importBackupJSON,
  } = useAuth();

  const { products, orders, customers, suppliers, accounts, refreshAll } = useBusiness();
  const { success, error, info } = useToast();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<'storage' | 'account'>('storage');
  const [copied, setCopied] = useState(false);

  // Optional Login state
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const handleCopyUid = () => {
    navigator.clipboard.writeText(effectiveUid);
    setCopied(true);
    success('Storage ID copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      error('Please enter email and password');
      return;
    }
    try {
      setAuthLoading(true);
      if (authMode === 'login') {
        await signInWithEmail(email.trim(), password);
        success('Signed in to cloud account');
      } else {
        await signUpWithEmail(email.trim(), password);
        success('Cloud account created and linked');
      }
    } catch (err: any) {
      error(err.message || 'Authentication failed');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      setAuthLoading(true);
      await signInWithGoogle();
      success('Connected Google Cloud account');
    } catch (err: any) {
      error(err.message || 'Google sign-in was cancelled or failed');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        const ok = importBackupJSON(content);
        if (ok) {
          success('Database restored successfully from backup file!');
        } else {
          error('Invalid backup JSON format');
        }
      }
    };
    reader.readAsText(file);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Storage & Database Architecture"
      subtitle="Manage cloud storage, backup files, and account access"
      maxWidth="2xl"
    >
      <div className="space-y-5 text-xs">
        {/* Cloud storage connection */}
        <div className="p-3.5 rounded-2xl bg-[#faf8f5] border border-[#e9e4dc] space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-bold text-[#1c1b18] text-xs flex items-center gap-1.5">
              <Cloud className="w-4 h-4 text-[#0284c7]" />
              Cloud Database
            </span>
            <span
              className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                storageMode === 'in-build'
                  ? 'bg-[#ecfdf5] text-[#065f46] border border-[#a7f3d0]'
                  : 'bg-[#eff6ff] text-[#1e40af] border border-[#bfdbfe]'
              }`}
            >
              Active: {storageMode === 'in-build' ? 'Browser Storage' : 'Cloud Storage'}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-2">
            <button
              type="button"
              onClick={() => {
                if (!user) {
                  setTab('account');
                  info('Sign in to your account before using cloud storage.');
                  return;
                }
                setStorageMode('firebase');
                success('Switched to cloud storage.');
                refreshAll();
              }}
              className={`p-3 text-left rounded-xl border transition-all cursor-pointer flex items-start gap-2.5 ${
                storageMode === 'firebase'
                  ? 'bg-white border-[#23424d] ring-2 ring-[#23424d]/10 shadow-xs'
                  : 'bg-[#f6f3eb] border-[#e7e1d5] hover:bg-white text-[#706c64]'
              }`}
            >
              <Cloud
                className={`w-4 h-4 shrink-0 mt-0.5 ${
                  storageMode === 'firebase' ? 'text-[#0284c7]' : 'text-[#8a857b]'
                }`}
              />
              <div>
                <p className="font-bold text-[#1c1b18]">Cloud Database</p>
                <p className="text-[11px] text-[#706c64] mt-0.5 leading-snug">
                  Connected to Cloud Firestore for real-time multi-device sync and shared team access.
                </p>
              </div>
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-[#f4efe6] rounded-xl border border-[#e5dfd2]">
          <button
            type="button"
            onClick={() => setTab('storage')}
            className={`flex-1 py-2 px-3 rounded-lg font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
              tab === 'storage'
                ? 'bg-white text-[#1c1b18] shadow-2xs'
                : 'text-[#706c64] hover:text-[#1c1b18]'
            }`}
          >
            <HardDrive className="w-3.5 h-3.5 text-[#c85a32]" />
            <span>Store Management & Backup</span>
          </button>

          <button
            type="button"
            onClick={() => setTab('account')}
            className={`flex-1 py-2 px-3 rounded-lg font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
              tab === 'account'
                ? 'bg-white text-[#1c1b18] shadow-2xs'
                : 'text-[#706c64] hover:text-[#1c1b18]'
            }`}
          >
            <User className="w-3.5 h-3.5 text-[#047857]" />
            <span>Cloud Account (Optional)</span>
          </button>
        </div>

        {/* Tab 1: Storage Management & Backup */}
        {tab === 'storage' && (
          <div className="space-y-4">
            {/* Partition UID Card */}
            <div className="p-4 rounded-2xl bg-white border border-[#e9e4dc] space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-[#1c1b18] flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-[#047857]" />
                  Active Storage Partition
                </span>
                <span className="text-[11px] text-[#706c64]">
                  {storageMode === 'in-build' ? 'Local Standalone Mode' : 'Cloud Partition'}
                </span>
              </div>

              <div className="space-y-2">
                <label className="block text-[#706c64] font-medium text-[11px]">
                  Your Unique Storage Identifier (UID):
                </label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 px-3 py-2 bg-[#faf8f5] border border-[#d8d3c9] rounded-lg font-mono text-[11px] text-[#1c1b18] select-all truncate">
                    {effectiveUid}
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyUid}
                    className="flex items-center gap-1 px-3 py-2 bg-white border border-[#d8d3c9] hover:bg-[#f7f4ee] rounded-lg text-[#1c1b18] font-semibold transition-colors cursor-pointer"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-[#047857]" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              </div>

              {/* Document Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-2 border-t border-[#e9e4dc]">
                <div className="p-2.5 bg-[#faf8f5] border border-[#e9e4dc] rounded-xl text-center">
                  <span className="text-[10px] text-[#706c64]">Products</span>
                  <p className="text-base font-bold font-mono text-[#1c1b18]">{products.length}</p>
                </div>
                <div className="p-2.5 bg-[#faf8f5] border border-[#e9e4dc] rounded-xl text-center">
                  <span className="text-[10px] text-[#706c64]">Orders</span>
                  <p className="text-base font-bold font-mono text-[#1c1b18]">{orders.length}</p>
                </div>
                <div className="p-2.5 bg-[#faf8f5] border border-[#e9e4dc] rounded-xl text-center">
                  <span className="text-[10px] text-[#706c64]">Customers</span>
                  <p className="text-base font-bold font-mono text-[#1c1b18]">{customers.length}</p>
                </div>
                <div className="p-2.5 bg-[#faf8f5] border border-[#e9e4dc] rounded-xl text-center">
                  <span className="text-[10px] text-[#706c64]">Suppliers</span>
                  <p className="text-base font-bold font-mono text-[#1c1b18]">{suppliers.length}</p>
                </div>
                <div className="p-2.5 bg-[#faf8f5] border border-[#e9e4dc] rounded-xl text-center">
                  <span className="text-[10px] text-[#706c64]">Wallets</span>
                  <p className="text-base font-bold font-mono text-[#1c1b18]">{accounts.length}</p>
                </div>
              </div>
            </div>

            {/* Backup & Restore (JSON) */}
            <div className="p-4 rounded-xl bg-white border border-[#e9e4dc] space-y-3">
              <div>
                <h4 className="font-bold text-[#1c1b18] flex items-center gap-1.5">
                  <Database className="w-4 h-4 text-[#23424d]" />
                  Backup & Portability
                </h4>
                <p className="text-[11px] text-[#706c64] mt-0.5 leading-relaxed">
                  Export your database (products, inventory, orders, customers, and finances) as a portable JSON file for safekeeping or transfer.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={exportBackupJSON}
                  className="flex items-center gap-1.5 py-2 px-3 text-xs font-semibold text-[#1c1b18] bg-[#f6f3eb] hover:bg-[#eae4d9] border border-[#e5dfd2] rounded-lg transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-[#23424d]" />
                  <span>Download Backup (JSON)</span>
                </button>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 py-2 px-3 text-xs font-semibold text-[#1c1b18] bg-[#f6f3eb] hover:bg-[#eae4d9] border border-[#e5dfd2] rounded-lg transition-colors cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5 text-[#047857]" />
                  <span>Restore from Backup (JSON)</span>
                </button>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={handleImportFile}
                  className="hidden"
                />
              </div>
            </div>

          </div>
        )}

        {/* Tab 3: Cloud Account (Optional) */}
        {tab === 'account' && (
          <div className="space-y-4">
            {user ? (
              <div className="p-4 rounded-2xl bg-white border border-[#e9e4dc] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#1c1b18]">Currently Signed In</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#ecfdf5] text-[#065f46]">
                    Active Cloud Session
                  </span>
                </div>
                <div className="space-y-1 text-xs">
                  <p className="text-[#1c1b18] font-semibold">{user.displayName || 'Cloud User'}</p>
                  <p className="text-[#706c64] font-mono">{user.email || 'Anonymous Authentication'}</p>
                  <p className="text-[#8a857b] font-mono text-[10px]">UID: {user.uid}</p>
                </div>
                <button
                  type="button"
                  onClick={logout}
                  className="mt-2 px-3 py-1.5 text-xs font-semibold text-[#be123c] bg-[#fff1f2] hover:bg-[#ffe4e6] border border-[#fecdd3] rounded-lg transition-colors cursor-pointer"
                >
                  Sign Out from Cloud
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-3.5 rounded-xl bg-[#faf8f5] border border-[#e9e4dc] text-[11px] text-[#706c64]">
                  Cloud authentication is completely optional. If you sign in, your data will sync across any device where you log in.
                </div>

                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={authLoading}
                  className="w-full py-2.5 px-4 bg-white hover:bg-[#f7f4ee] border border-[#d8d3c9] text-[#1c1b18] font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-2xs"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                  <span>Continue with Google</span>
                </button>

                <div className="relative flex py-2 items-center">
                  <div className="flex-grow border-t border-[#e9e4dc]"></div>
                  <span className="flex-shrink mx-4 text-[10px] uppercase font-bold text-[#8a857b]">
                    Or Email
                  </span>
                  <div className="flex-grow border-t border-[#e9e4dc]"></div>
                </div>

                <form onSubmit={handleAuthSubmit} className="space-y-3">
                  <div>
                    <label className="block text-[#1c1b18] font-semibold mb-1">Email Address</label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="merchant@example.com"
                      className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg text-xs text-[#1c1b18] focus:outline-none focus:border-[#23424d]"
                    />
                  </div>

                  <div>
                    <label className="block text-[#1c1b18] font-semibold mb-1">Password</label>
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg text-xs text-[#1c1b18] focus:outline-none focus:border-[#23424d]"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <button
                      type="button"
                      onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}
                      className="text-xs text-[#23424d] font-semibold hover:underline cursor-pointer"
                    >
                      {authMode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
                    </button>

                    <button
                      type="submit"
                      disabled={authLoading}
                      className="px-4 py-2 text-xs font-semibold text-white bg-[#23424d] hover:bg-[#1a323b] rounded-lg shadow-xs transition-colors cursor-pointer"
                    >
                      {authLoading ? 'Connecting...' : authMode === 'login' ? 'Sign In' : 'Create Account'}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};
