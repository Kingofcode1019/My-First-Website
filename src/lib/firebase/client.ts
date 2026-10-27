import { initializeApp, getApps, getApp } from 'firebase/app';
import { browserLocalPersistence, getAuth, setPersistence, type Auth } from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import { firestoreDatabaseIdOrDefault } from './databaseId';

export interface FirebaseConfigType {
  projectId: string;
  appId: string;
  apiKey: string;
  authDomain: string;
  firestoreDatabaseId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  measurementId?: string;
  recaptchaSiteKey?: string;
}

export const STORAGE_KEY_CUSTOM_CONFIG = 'apex_custom_firebase_config';
export const STORAGE_KEY_DIRECT_WORKSPACE = 'apex_direct_workspace_enabled';

const emptyConfig: FirebaseConfigType = {
  projectId: '',
  appId: '',
  apiKey: '',
  authDomain: '',
};

const environmentConfig: FirebaseConfigType = {
  ...emptyConfig,
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
  firestoreDatabaseId: firestoreDatabaseIdOrDefault(
    import.meta.env.VITE_FIREBASE_DATABASE_ID,
    'VITE_FIREBASE_DATABASE_ID'
  ),
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || undefined,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || undefined,
};

export function getActiveFirebaseConfig(): FirebaseConfigType {
  try {
    const custom = localStorage.getItem(STORAGE_KEY_CUSTOM_CONFIG);
    if (custom) {
      const parsed = JSON.parse(custom);
      if (parsed.projectId && parsed.apiKey) {
        return {
          ...emptyConfig,
          ...parsed,
          firestoreDatabaseId: firestoreDatabaseIdOrDefault(
            parsed.firestoreDatabaseId,
            'Saved Firestore database ID'
          ),
        };
      }
    }
  } catch (error) {
    console.warn('Failed to parse custom Firebase config', error);
  }
  return environmentConfig.apiKey && environmentConfig.projectId ? environmentConfig : emptyConfig;
}

export function isCustomConfigActive(): boolean {
  try {
    const custom = localStorage.getItem(STORAGE_KEY_CUSTOM_CONFIG);
    if (custom) {
      const parsed = JSON.parse(custom);
      return Boolean(parsed.projectId && parsed.apiKey);
    }
  } catch {
    return false;
  }
  return false;
}

export function saveCustomFirebaseConfig(config: FirebaseConfigType): void {
  localStorage.setItem(STORAGE_KEY_CUSTOM_CONFIG, JSON.stringify(config));
}

export function clearCustomFirebaseConfig(): void {
  localStorage.removeItem(STORAGE_KEY_CUSTOM_CONFIG);
}

const activeConfig = getActiveFirebaseConfig();
export const app = getApps().length > 0 ? getApp() : initializeApp(activeConfig);
export const db = activeConfig.firestoreDatabaseId
  ? getFirestore(app, activeConfig.firestoreDatabaseId)
  : getFirestore(app);
export const auth: Auth | null =
  activeConfig.apiKey && activeConfig.projectId ? getAuth(app) : null;
if (auth) {
  void setPersistence(auth, browserLocalPersistence).catch((error) => {
    console.warn('Firebase Auth persistence could not be enabled:', error);
  });
}

export function cleanObject<T extends Record<string, any>>(obj: T): T {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) result[key] = value;
  }
  return result as T;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: { providerId?: string | null; email?: string | null }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth?.currentUser?.uid,
      email: auth?.currentUser?.email,
      emailVerified: auth?.currentUser?.emailVerified,
      isAnonymous: auth?.currentUser?.isAnonymous,
      tenantId: auth?.currentUser?.tenantId,
      providerInfo: auth?.currentUser?.providerData.map((provider) => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testConnection(): Promise<boolean> {
  const uid = auth?.currentUser?.uid;
  if (!uid) return false;
  try {
    await getDocFromServer(doc(db, `users/${uid}/settings/general`));
    return true;
  } catch {
    return false;
  }
}