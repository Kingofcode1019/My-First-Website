import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { firestoreDatabaseIdOrDefault } from './databaseId';

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

if (!projectId || !clientEmail || !privateKey) {
  throw new Error(
    'Firebase Admin requires FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY.'
  );
}

const adminApp = getApps().find((app) => app.name === 'invo-admin') ?? initializeApp(
  {
    credential: cert({ projectId, clientEmail, privateKey }),
    projectId,
  },
  'invo-admin'
);

export const adminAuth = getAuth(adminApp);
const databaseId = firestoreDatabaseIdOrDefault(
  process.env.FIREBASE_DATABASE_ID,
  'FIREBASE_DATABASE_ID'
);
export const adminDb = databaseId
  ? getFirestore(adminApp, databaseId)
  : getFirestore(adminApp);