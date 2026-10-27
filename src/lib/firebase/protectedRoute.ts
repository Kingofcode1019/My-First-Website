import type { IncomingMessage, ServerResponse } from 'node:http';
import { adminAuth, adminDb } from './admin';

const allowedResources = new Set([
  'accounts',
  'customers',
  'inventoryMovements',
  'orders',
  'products',
  'purchases',
  'settings',
  'suppliers',
  'transactions',
  'expenses',
]);

function readSessionCookie(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  const entry = cookieHeader.split(';').map((part) => part.trim()).find((part) => part.startsWith('__session='));
  if (!entry) return null;
  const value = entry.slice('__session='.length);
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function sendJson(response: ServerResponse, statusCode: number, body: Record<string, unknown>): void {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'private, no-store, max-age=0');
  response.end(JSON.stringify(body));
}

export async function handleProtectedRoute(
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    sendJson(response, 405, { error: 'Method not allowed' });
    return;
  }

  const authorization = request.headers.authorization;
  const bearerToken = typeof authorization === 'string' && authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length).trim()
    : null;
  const sessionCookie = readSessionCookie(request.headers.cookie);
  const token = bearerToken || sessionCookie;

  if (!token) {
    sendJson(response, 401, { error: 'Unauthorized' });
    return;
  }

  let uid: string;
  try {
    if (bearerToken) {
      uid = (await adminAuth.verifyIdToken(bearerToken, true)).uid;
    } else {
      try {
        uid = (await adminAuth.verifySessionCookie(token, true)).uid;
      } catch {
        uid = (await adminAuth.verifyIdToken(token, true)).uid;
      }
    }
  } catch {
    sendJson(response, 401, { error: 'Unauthorized' });
    return;
  }

  const url = new URL(request.url || '/', 'http://localhost');
  const resource = url.searchParams.get('resource') || 'products';
  if (!allowedResources.has(resource)) {
    sendJson(response, 400, { error: 'Unsupported resource' });
    return;
  }

  try {
    const snapshot = await adminDb
      .collection('users')
      .doc(uid)
      .collection(resource)
      .limit(100)
      .get();

    sendJson(response, 200, {
      items: snapshot.docs.map((document) => ({ id: document.id, ...document.data() })),
    });
  } catch (error) {
    console.error('Protected Firebase read failed:', error);
    sendJson(response, 500, { error: 'Unable to load requested data' });
  }
}