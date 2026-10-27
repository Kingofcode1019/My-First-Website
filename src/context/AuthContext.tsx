import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from 'firebase/auth';
import {
  auth,
  testConnection,
  getActiveFirebaseConfig,
  saveCustomFirebaseConfig,
  clearCustomFirebaseConfig,
  isCustomConfigActive,
  FirebaseConfigType,
  STORAGE_KEY_DIRECT_WORKSPACE,
} from '../lib/firebase';
import { inBuildStorage, StorageMode } from '../lib/inBuildStorage';

interface AuthContextType {
  user: User | null;
  effectiveUid: string;
  isDirectWorkspace: boolean;
  loading: boolean;
  storageMode: StorageMode;
  setStorageMode: (mode: StorageMode) => void;
  firebaseConfig: FirebaseConfigType;
  isFirebaseConfigured: boolean;
  isCustomConfig: boolean;
  enterDirectWorkspace: () => void;
  exitDirectWorkspace: () => void;
  saveNewFirebaseConfig: (config: FirebaseConfigType) => void;
  resetFirebaseConfig: () => void;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, pass: string) => Promise<void>;
  signUpWithEmail: (email: string, pass: string) => Promise<void>;
  logout: () => Promise<void>;
  exportBackupJSON: () => void;
  importBackupJSON: (jsonStr: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [storageMode, setStorageModeState] = useState<StorageMode>(() =>
    inBuildStorage.getStorageMode()
  );

  const [isDirectWorkspace, setIsDirectWorkspace] = useState<boolean>(() => {
    localStorage.setItem(STORAGE_KEY_DIRECT_WORKSPACE, 'true');
    return true;
  });

  const [firebaseConfig, setFirebaseConfig] = useState<FirebaseConfigType>(getActiveFirebaseConfig);
  const [isCustomConfig, setIsCustomConfig] = useState<boolean>(isCustomConfigActive);

  // Persistent unique personal storage ID
  const [directUid] = useState<string>(() => {
    const existing = localStorage.getItem('apex_personal_storage_uid');
    if (existing) return existing;
    const generated = 'merchant_' + Math.random().toString(36).substring(2, 10);
    localStorage.setItem('apex_personal_storage_uid', generated);
    return generated;
  });

  const setStorageMode = (mode: StorageMode) => {
    inBuildStorage.setStorageMode(mode);
    setStorageModeState(mode);
  };

  useEffect(() => {
    const hasFirebaseConfig = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);
    if (!hasFirebaseConfig || !auth) {
      setUser(null);
      setLoading(false);
      if (storageMode !== 'in-build') setStorageMode('in-build');
      setIsDirectWorkspace(true);
      localStorage.setItem(STORAGE_KEY_DIRECT_WORKSPACE, 'true');
      return;
    }

    if (storageMode === 'firebase') testConnection();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser && inBuildStorage.getStorageMode() === 'firebase') {
        setStorageMode('in-build');
      }
      const useCloudWorkspace =
        Boolean(currentUser) && inBuildStorage.getStorageMode() === 'firebase';
      setIsDirectWorkspace(!useCloudWorkspace);
      if (useCloudWorkspace) {
        localStorage.removeItem(STORAGE_KEY_DIRECT_WORKSPACE);
      } else {
        localStorage.setItem(STORAGE_KEY_DIRECT_WORKSPACE, 'true');
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [firebaseConfig.apiKey, firebaseConfig.projectId, storageMode]);

  const enterDirectWorkspace = () => {
    localStorage.setItem(STORAGE_KEY_DIRECT_WORKSPACE, 'true');
    setIsDirectWorkspace(true);
    setStorageMode('in-build');
  };

  const exitDirectWorkspace = () => {
    enterDirectWorkspace();
  };

  const saveNewFirebaseConfig = (config: FirebaseConfigType) => {
    saveCustomFirebaseConfig(config);
    setFirebaseConfig(config);
    setIsCustomConfig(true);
    setStorageMode('firebase');
    window.location.reload();
  };

  const resetFirebaseConfig = () => {
    clearCustomFirebaseConfig();
    setIsCustomConfig(false);
    setStorageMode('in-build');
    window.location.reload();
  };

  const signInWithGoogle = async () => {
    if (!auth) throw new Error('Configure Firebase before connecting a cloud account.');
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
    setIsDirectWorkspace(false);
    setStorageMode('firebase');
    localStorage.removeItem(STORAGE_KEY_DIRECT_WORKSPACE);
  };

  const signInWithEmail = async (email: string, pass: string) => {
    if (!auth) throw new Error('Configure Firebase before connecting a cloud account.');
    await signInWithEmailAndPassword(auth, email, pass);
    setIsDirectWorkspace(false);
    setStorageMode('firebase');
    localStorage.removeItem(STORAGE_KEY_DIRECT_WORKSPACE);
  };

  const signUpWithEmail = async (email: string, pass: string) => {
    if (!auth) throw new Error('Configure Firebase before connecting a cloud account.');
    await createUserWithEmailAndPassword(auth, email, pass);
    setIsDirectWorkspace(false);
    setStorageMode('firebase');
    localStorage.removeItem(STORAGE_KEY_DIRECT_WORKSPACE);
  };

  const logout = async () => {
    if (user && auth) {
      await firebaseSignOut(auth);
    }
    enterDirectWorkspace();
  };

  const exportBackupJSON = () => {
    const dataStr = inBuildStorage.exportAllDataJSON();
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `store-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const importBackupJSON = (jsonStr: string): boolean => {
    const success = inBuildStorage.importAllDataJSON(jsonStr);
    if (success) {
      setTimeout(() => window.location.reload(), 300);
    }
    return success;
  };

  // If authenticated user exists, use their UID. Otherwise use local direct UID.
  const effectiveUid =
    storageMode === 'firebase' && user ? user.uid : directUid || 'local_merchant';

  return (
    <AuthContext.Provider
      value={{
        user,
        effectiveUid,
        isDirectWorkspace,
        loading,
        storageMode,
        setStorageMode,
        firebaseConfig,
        isFirebaseConfigured: Boolean(firebaseConfig.apiKey && firebaseConfig.projectId),
        isCustomConfig,
        enterDirectWorkspace,
        exitDirectWorkspace,
        saveNewFirebaseConfig,
        resetFirebaseConfig,
        signInWithGoogle,
        signInWithEmail,
        signUpWithEmail,
        logout,
        exportBackupJSON,
        importBackupJSON,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
