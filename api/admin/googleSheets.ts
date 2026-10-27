import { randomBytes } from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import { adminAuth, adminDb } from '../../src/lib/firebase/admin';

const integrationRef = adminDb.collection('platform').doc('settings').collection('integrations').doc('googleSheets');
const headers = ['UID', 'Name', 'Email', 'Phone', 'Role', 'Status', 'Created At', 'Last Login', 'Business Name'];
const oauthStateCollection = adminDb.collection('platform').doc('settings').collection('googleSheetsOAuthStates');
const scopes = ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/spreadsheets'];

export interface GoogleSheetConnection {
  connected: boolean;
  oauthConfigured?: boolean;
  spreadsheetId?: string;
  spreadsheetTitle?: string;
  sheetName?: string;
  googleEmail?: string;
  lastSyncedAt?: string;
  lastSyncError?: string;
}

function normalizeSpreadsheetId(input: string): string {
  const value = input.trim();
  const urlMatch = value.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  const spreadsheetId = urlMatch?.[1] || value;
  if (!/^[a-zA-Z0-9_-]{20,}$/.test(spreadsheetId)) {
    throw new Error('Enter a valid Google Sheets URL or spreadsheet ID.');
  }
  return spreadsheetId;
}

function isGoogleOAuthConfigured(): boolean {
  return Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET && process.env.GOOGLE_OAUTH_REDIRECT_URI);
}

function createOAuthClient(): OAuth2Client {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Google sign-in is not configured on the server. Set GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, and GOOGLE_OAUTH_REDIRECT_URI.');
  }
  return new OAuth2Client(clientId, clientSecret, redirectUri);
}

async function getSheetsClient(): Promise<OAuth2Client> {
  const connectionSnapshot = await integrationRef.get();
  const refreshToken = connectionSnapshot.data()?.refreshToken;
  if (!refreshToken) throw new Error('Connect a Google account before syncing this spreadsheet.');
  const client = createOAuthClient();
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}

async function requestSheets<T>(spreadsheetId: string, path: string, method: 'GET' | 'POST' | 'PUT', data?: unknown): Promise<T> {
  const client = await getSheetsClient();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}${path}`;
  const response = await client.request<T>({ url, method, data });
  return response.data;
}

async function getDirectoryRows(): Promise<string[][]> {
  const users = [];
  let pageToken: string | undefined;
  do {
    const page = await adminAuth.listUsers(1000, pageToken);
    users.push(...page.users);
    pageToken = page.pageToken;
  } while (pageToken);

  return Promise.all(users.map(async (user) => {
    const [profileSnapshot, settingsSnapshot, adminSnapshot] = await Promise.all([
      adminDb.collection('platform').doc('users').collection('profiles').doc(user.uid).get(),
      adminDb.collection('users').doc(user.uid).collection('settings').doc('general').get(),
      adminDb.collection('platform').doc('admins').collection('members').doc(user.uid).get(),
    ]);
    const profile = profileSnapshot.data() || {};
    const settings = settingsSnapshot.data() || {};
    const member = adminSnapshot.data() || {};
    const role = user.uid === process.env.PLATFORM_OWNER_UID ? 'OWNER' : member.roleId || (adminSnapshot.exists ? 'STAFF' : 'CUSTOMER');
    return [
      user.uid,
      String(profile.name || user.displayName || ''),
      String(user.email || ''),
      String(profile.phone || user.phoneNumber || ''),
      String(role),
      String(profile.status || (user.disabled ? 'suspended' : 'active')),
      user.metadata.creationTime || '',
      user.metadata.lastSignInTime || '',
      String(settings.businessName || ''),
    ];
  }));
}

function quotedRange(sheetName: string): string {
  return `'${sheetName.replaceAll("'", "''")}'!A:I`;
}

async function writeDirectory(spreadsheetId: string, sheetName: string): Promise<{ title: string; lastSyncedAt: string }> {
  const metadata = await requestSheets<{ properties?: { title?: string }; sheets?: { properties?: { title?: string } }[] }>(
    spreadsheetId,
    '?fields=properties.title,sheets.properties.title',
    'GET'
  );
  const existingSheets = (metadata.sheets || []).map((sheet) => sheet.properties?.title || '');
  if (!existingSheets.includes(sheetName)) {
    await requestSheets(spreadsheetId, ':batchUpdate', 'POST', { requests: [{ addSheet: { properties: { title: sheetName } } }] });
  }

  const range = quotedRange(sheetName);
  const encodedRange = encodeURIComponent(range);
  const previous = await requestSheets<{ values?: string[][] }>(spreadsheetId, `/values/${encodedRange}`, 'GET');
  const values = [headers, ...(await getDirectoryRows())];
  await requestSheets(spreadsheetId, `/values/${encodedRange}?valueInputOption=RAW`, 'PUT', {
    range,
    majorDimension: 'ROWS',
    values,
  });
  const previousRowCount = previous.values?.length || 0;
  if (previousRowCount > values.length) {
    const trailingRange = encodeURIComponent(`'${sheetName.replaceAll("'", "''")}'!A${values.length + 1}:I${previousRowCount}`);
    await requestSheets(spreadsheetId, `/values/${trailingRange}:clear`, 'POST', {});
  }
  return { title: metadata.properties?.title || 'Google Sheet', lastSyncedAt: new Date().toISOString() };
}

export async function getGoogleSheetConnection(): Promise<GoogleSheetConnection> {
  const oauthConfigured = isGoogleOAuthConfigured();
  const snapshot = await integrationRef.get();
  if (!snapshot.exists) return { connected: false, oauthConfigured };
  const data = snapshot.data() || {};
  return {
    connected: Boolean(data.spreadsheetId),
    oauthConfigured,
    spreadsheetId: data.spreadsheetId,
    spreadsheetTitle: data.spreadsheetTitle,
    sheetName: data.sheetName,
    googleEmail: data.googleEmail,
    lastSyncedAt: data.lastSyncedAt,
    lastSyncError: data.lastSyncError,
  };
}

export async function beginGoogleSheetOAuth(input: string, actorUid: string): Promise<string> {
  if (!isGoogleOAuthConfigured()) {
    throw new Error('Google sign-in is not configured on the server. Set GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, and GOOGLE_OAUTH_REDIRECT_URI.');
  }
  const spreadsheetId = normalizeSpreadsheetId(input);
  const state = randomBytes(32).toString('hex');
  await oauthStateCollection.doc(state).create({ actorUid, spreadsheetId, expiresAt: Date.now() + 10 * 60 * 1000 });
  return createOAuthClient().generateAuthUrl({
    access_type: 'offline',
    include_granted_scopes: true,
    prompt: 'consent',
    scope: scopes,
    state,
  });
}

export async function completeGoogleSheetOAuth(code: string, state: string): Promise<GoogleSheetConnection> {
  if (!code || !state) throw new Error('Google OAuth callback is missing its code or state.');
  const stateRef = oauthStateCollection.doc(state);
  const stateSnapshot = await stateRef.get();
  if (!stateSnapshot.exists) throw new Error('Google authorization expired or was already used. Please connect again.');
  const stateData = stateSnapshot.data() || {};
  await stateRef.delete();
  if (Number(stateData.expiresAt) < Date.now()) throw new Error('Google authorization expired. Please connect again.');

  const actorUid = String(stateData.actorUid || '');
  const isPlatformOwner = actorUid && actorUid === process.env.PLATFORM_OWNER_UID;
  const memberSnapshot = actorUid
    ? await adminDb.collection('platform').doc('admins').collection('members').doc(actorUid).get()
    : null;
  if (!isPlatformOwner && memberSnapshot?.data()?.roleId !== 'OWNER') {
    throw new Error('Only a current platform Owner may connect Google Sheets.');
  }

  const client = createOAuthClient();
  const tokenResponse = await client.getToken(code);
  const tokens = tokenResponse.tokens;
  if (!tokens.refresh_token) throw new Error('Google did not provide a refresh token. Reconnect and approve offline access.');
  if (!tokens.id_token) throw new Error('Google did not return an account identity. Reconnect and try again.');
  const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: process.env.GOOGLE_OAUTH_CLIENT_ID });
  const googleEmail = ticket.getPayload()?.email;
  if (!googleEmail) throw new Error('Could not identify the Google account used for Sheets access.');

  client.setCredentials(tokens);
  await integrationRef.set({
    connected: false,
    spreadsheetId: String(stateData.spreadsheetId),
    sheetName: 'Users',
    googleEmail,
    refreshToken: tokens.refresh_token,
    connectedBy: actorUid,
    updatedAt: new Date().toISOString(),
  });
  const result = await writeDirectory(String(stateData.spreadsheetId), 'Users');
  const connection: GoogleSheetConnection = {
    connected: true,
    oauthConfigured: true,
    spreadsheetId: String(stateData.spreadsheetId),
    spreadsheetTitle: result.title,
    sheetName: 'Users',
    googleEmail,
    lastSyncedAt: result.lastSyncedAt,
  };
  await integrationRef.set({ ...connection, refreshToken: tokens.refresh_token, connectedBy: actorUid, updatedAt: result.lastSyncedAt });
  return connection;
}

export async function disconnectGoogleSheet(): Promise<void> {
  await integrationRef.delete();
}

export async function syncConnectedGoogleSheet(): Promise<string | null> {
  const snapshot = await integrationRef.get();
  if (!snapshot.exists) return null;
  const config = snapshot.data() || {};
  try {
    const result = await writeDirectory(String(config.spreadsheetId), String(config.sheetName || 'Users'));
    await integrationRef.set({ ...config, ...result, connected: true, lastSyncError: null, updatedAt: result.lastSyncedAt });
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Google Sheets sync failed';
    await integrationRef.set({ ...config, connected: true, lastSyncError: message, updatedAt: new Date().toISOString() });
    return message;
  }
}