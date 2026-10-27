import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { FirebaseConfigType } from '../../lib/firebase';
import { isRealtimeDatabaseUrl } from '../../lib/firebase/databaseId';
import {
  LogIn,
  UserPlus,
  Eye,
  EyeOff,
  CheckCircle2,
  RotateCcw,
} from 'lucide-react';

export const WorkspaceSetupView: React.FC = () => {
  const {
    firebaseConfig,
    isFirebaseConfigured,
    isCustomConfig,
    saveNewFirebaseConfig,
    resetFirebaseConfig,
    signInWithEmail,
    signUpWithEmail,
    signInWithGoogle,
  } = useAuth();
  const { success, error } = useToast();

  const [apiKey, setApiKey] = useState(firebaseConfig.apiKey || '');
  const [authDomain, setAuthDomain] = useState(firebaseConfig.authDomain || '');
  const [projectId, setProjectId] = useState(firebaseConfig.projectId || '');
  const [storageBucket, setStorageBucket] = useState(firebaseConfig.storageBucket || '');
  const [messagingSenderId, setMessagingSenderId] = useState(firebaseConfig.messagingSenderId || '');
  const [appId, setAppId] = useState(firebaseConfig.appId || '');
  const [firestoreDatabaseId, setFirestoreDatabaseId] = useState(
    firebaseConfig.firestoreDatabaseId || ''
  );

  const [showApiKey, setShowApiKey] = useState(false);
  const [authMode, setAuthMode] = useState<'idle' | 'login' | 'register'>('idle');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const isConfigured = Boolean(isFirebaseConfigured && apiKey.trim() && projectId.trim());

  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim() || !projectId.trim()) {
      error('Firebase API Key and Project ID are required');
      return;
    }
    if (isRealtimeDatabaseUrl(firestoreDatabaseId)) {
      error('This is a Realtime Database URL, not a Firestore Database ID. Leave Database ID blank to use Firestore (default).');
      return;
    }

    const newConfig: FirebaseConfigType = {
      apiKey: apiKey.trim(),
      authDomain: authDomain.trim() || `${projectId.trim()}.firebaseapp.com`,
      projectId: projectId.trim(),
      storageBucket: storageBucket.trim() || `${projectId.trim()}.appspot.com`,
      messagingSenderId: messagingSenderId.trim(),
      appId: appId.trim(),
      firestoreDatabaseId: firestoreDatabaseId.trim() || undefined,
    };

    saveNewFirebaseConfig(newConfig);
    success('Configuration saved in browser localStorage.');
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFirebaseConfigured) {
      error('Save your Firebase configuration before signing in.');
      return;
    }
    if (!email.trim() || !password.trim()) {
      error('Email and password are required');
      return;
    }

    try {
      setAuthLoading(true);
      if (authMode === 'login') {
        await signInWithEmail(email.trim(), password);
        success('Logged into connected workspace');
      } else {
        await signUpWithEmail(email.trim(), password);
        success('Account created in connected workspace');
      }
    } catch (err: any) {
      error(err.message || 'Authentication failed. Please verify credentials.');
    } finally {
      setAuthLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#fbf9f6] text-[#1c1b18] flex flex-col justify-center items-center p-4 sm:p-8 font-sans selection:bg-[#23424d] selection:text-white">
      <div className="w-full max-w-4xl space-y-6">
        {/* Top Header matching image */}
        <div className="space-y-2">
          <p className="text-xs sm:text-[13px] font-semibold tracking-widest uppercase text-[#c85a32]">
            E-COMMERCE INVENTORY & BUSINESS OS
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#1c1b18]">
            Connect your workspace first.
          </h1>
          <p className="text-xs sm:text-sm text-[#706c64] max-w-2xl leading-relaxed">
            Enter your Firebase web app configuration before creating an account or signing in. This lets
            the app use your Firebase project instead of assuming a fixed backend.
          </p>
        </div>

        {/* Status notification banner matching image */}
        {!isConfigured ? (
          <div className="p-3.5 rounded-lg bg-[#fff1f2] border border-[#fecdd3] text-[#be123c] text-xs leading-relaxed">
            Firebase configuration is missing or invalid. Add your own Firebase web app values below before signing in.
          </div>
        ) : (
          <div className="p-3.5 rounded-lg bg-[#ecfdf5] border border-[#a7f3d0] text-[#065f46] text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#059669] shrink-0" />
              <span>
                Active Firebase project: <strong>{projectId}</strong>{' '}
                {isCustomConfig ? '(Saved in this browser)' : '(Loaded from environment)'}
              </span>
            </div>
            {isCustomConfig && (
              <button
                type="button"
                onClick={resetFirebaseConfig}
                className="text-xs underline hover:text-[#047857] flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" /> Clear Configuration
              </button>
            )}
          </div>
        )}

        {/* Two Columns Grid matching image */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Card: Firebase configuration (7 cols) */}
          <div className="lg:col-span-7 bg-white border border-[#e9e4dc] rounded-2xl p-6 sm:p-7 shadow-xs space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-[#1c1b18]">
                  Firebase configuration
                </h2>
                <p className="text-xs text-[#706c64] mt-0.5">
                  Settings are saved only in this browser.
                </p>
              </div>
              <span
                className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${
                  isConfigured
                    ? 'bg-[#ecfdf5] text-[#065f46] border-[#a7f3d0]'
                    : 'bg-[#fef3c7] text-[#92400e] border-[#fde68a]'
                }`}
              >
                {isConfigured ? 'Configured' : 'Not configured'}
              </span>
            </div>

            <form onSubmit={handleSaveConfig} className="space-y-4 text-xs">
              {/* API Key */}
              <div>
                <label className="block text-[#4a4741] font-medium mb-1">Firebase API Key</label>
                <div className="flex gap-2">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    required
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="AIzaSy..."
                    className="flex-1 px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg text-[#1c1b18] font-mono focus:outline-none focus:border-[#23424d]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="px-3 py-2 bg-white border border-[#d8d3c9] hover:bg-[#f7f4ee] rounded-lg text-[#4a4741] text-xs font-medium cursor-pointer"
                  >
                    {showApiKey ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              {/* Auth Domain & Project ID */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#4a4741] font-medium mb-1">Auth Domain</label>
                  <input
                    type="text"
                    value={authDomain}
                    onChange={(e) => setAuthDomain(e.target.value)}
                    placeholder="my-project.firebaseapp.com"
                    className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg text-[#1c1b18] font-mono text-[11px] focus:outline-none focus:border-[#23424d]"
                  />
                </div>
                <div>
                  <label className="block text-[#4a4741] font-medium mb-1">Project ID</label>
                  <input
                    type="text"
                    required
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value)}
                    placeholder="my-project-id"
                    className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg text-[#1c1b18] font-mono text-[11px] focus:outline-none focus:border-[#23424d]"
                  />
                </div>
              </div>

              {/* Storage Bucket & Messaging Sender ID */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#4a4741] font-medium mb-1">Storage Bucket</label>
                  <input
                    type="text"
                    value={storageBucket}
                    onChange={(e) => setStorageBucket(e.target.value)}
                    placeholder="my-project.firebasestorage.app"
                    className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg text-[#1c1b18] font-mono text-[11px] focus:outline-none focus:border-[#23424d]"
                  />
                </div>
                <div>
                  <label className="block text-[#4a4741] font-medium mb-1">Messaging Sender ID</label>
                  <input
                    type="text"
                    value={messagingSenderId}
                    onChange={(e) => setMessagingSenderId(e.target.value)}
                    placeholder="1234567890"
                    className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg text-[#1c1b18] font-mono text-[11px] focus:outline-none focus:border-[#23424d]"
                  />
                </div>
              </div>

              {/* App ID & Firestore Database ID */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#4a4741] font-medium mb-1">App ID</label>
                  <input
                    type="text"
                    value={appId}
                    onChange={(e) => setAppId(e.target.value)}
                    placeholder="1:1234567890:web:abcdef"
                    className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg text-[#1c1b18] font-mono text-[11px] focus:outline-none focus:border-[#23424d]"
                  />
                </div>
                <div>
                  <label className="block text-[#4a4741] font-medium mb-1">Database ID (Optional)</label>
                  <input
                    type="text"
                    value={firestoreDatabaseId}
                    onChange={(e) => setFirestoreDatabaseId(e.target.value)}
                    placeholder="(default) or custom id"
                    className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg text-[#1c1b18] font-mono text-[11px] focus:outline-none focus:border-[#23424d]"
                  />
                </div>
              </div>

              {/* Save Button */}
              <div className="pt-2 flex flex-wrap items-center justify-between gap-2">
                <button
                  type="submit"
                  className="px-5 py-2.5 font-semibold text-white bg-[#23424d] hover:bg-[#1a323b] rounded-lg transition-colors cursor-pointer"
                >
                  Save Configuration
                </button>
                {isCustomConfig && (
                  <button
                    type="button"
                    onClick={resetFirebaseConfig}
                    className="text-xs text-[#706c64] hover:text-[#1c1b18] underline cursor-pointer"
                  >
                    Clear Saved Configuration
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* Right Card: Continue / Login / Register (5 cols) */}
          <div className="lg:col-span-5 bg-white border border-[#e9e4dc] rounded-2xl p-6 sm:p-7 shadow-xs flex flex-col justify-between space-y-6">
            <div className="space-y-4">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-[#1c1b18]">Continue</h2>
                <p className="text-xs text-[#706c64] mt-1 leading-relaxed">
                  After saving a valid configuration, create a new Firebase account or sign in to the
                  connected project.
                </p>
              </div>

              {/* Login & Register Buttons styled exactly as in image */}
              {authMode === 'idle' ? (
                <div className="space-y-2.5 pt-2 border-t border-[#e9e4dc]">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-[#706c64]">
                    Or Authenticate With Project
                  </p>
                  <button
                    type="button"
                    onClick={() => setAuthMode('login')}
                    disabled={!isFirebaseConfigured}
                    className="w-full py-2.5 px-4 font-semibold text-white bg-[#23424d] hover:bg-[#1a323b] rounded-lg shadow-xs transition-colors cursor-pointer text-xs"
                  >
                    Login
                  </button>

                  <button
                    type="button"
                    onClick={() => setAuthMode('register')}
                    disabled={!isFirebaseConfigured}
                    className="w-full py-2.5 px-4 font-semibold text-[#1c1b18] bg-white hover:bg-[#f7f4ee] border border-[#d8d3c9] rounded-lg transition-colors cursor-pointer text-xs"
                  >
                    Register
                  </button>

                  <button
                    type="button"
                    onClick={signInWithGoogle}
                    disabled={!isFirebaseConfigured || authLoading}
                    className="w-full py-2.5 px-4 text-xs font-semibold text-[#1c1b18] bg-[#fbf9f6] hover:bg-[#f2ece0] border border-[#e2dcd0] rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-2"
                  >
                    <span>Sign In With Google</span>
                  </button>
                </div>
              ) : (
                /* Inline Login/Register Form */
                <form onSubmit={handleAuthSubmit} className="space-y-3 pt-2 border-t border-[#e9e4dc] text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold capitalize text-[#1c1b18]">
                      {authMode === 'login' ? 'Sign In to Project' : 'Register New Account'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setAuthMode('idle')}
                      className="text-xs text-[#706c64] hover:text-[#1c1b18] underline"
                    >
                      Back
                    </button>
                  </div>

                  <div>
                    <label className="block text-[#4a4741] font-medium mb-1">Email</label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="user@example.com"
                      className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg text-[#1c1b18] focus:outline-none focus:border-[#23424d]"
                    />
                  </div>

                  <div>
                    <label className="block text-[#4a4741] font-medium mb-1">Password</label>
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-3 py-2 bg-white border border-[#d8d3c9] rounded-lg text-[#1c1b18] focus:outline-none focus:border-[#23424d]"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={authLoading}
                    className="w-full py-2.5 font-semibold text-white bg-[#23424d] hover:bg-[#1a323b] rounded-lg transition-colors cursor-pointer"
                  >
                    {authLoading ? 'Authenticating...' : authMode === 'login' ? 'Login' : 'Register'}
                  </button>
                </form>
              )}
            </div>

            {/* Footnote matching image */}
            <p className="text-[11px] text-[#706c64] leading-relaxed pt-4 border-t border-[#e9e4dc]">
              Changing the configuration here replaces the saved project for this browser. Reloading the
              page applies it to Firebase Auth.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
