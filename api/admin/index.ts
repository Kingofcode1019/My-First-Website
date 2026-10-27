import type { IncomingMessage, ServerResponse } from 'node:http';
import { adminAuth, adminDb } from '../../src/lib/firebase/admin';
import { adminErrorStatus, ownerPermissions, requireAdmin, writeAuditLog } from '../../src/lib/firebase/adminAuthorization';
import { beginGoogleSheetOAuth, disconnectGoogleSheet, getGoogleSheetConnection, syncConnectedGoogleSheet } from './googleSheets';

const collectionNames = ['products', 'inventoryMovements', 'orders', 'customers', 'suppliers', 'transactions', 'purchases', 'accounts'];

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'private, no-store');
  response.end(JSON.stringify(body));
}

async function listAllUsers() {
  const users = [];
  let pageToken: string | undefined;
  do {
    const result = await adminAuth.listUsers(1000, pageToken);
    users.push(...result.users);
    pageToken = result.pageToken;
  } while (pageToken);
  return users;
}

async function deleteUserData(uid: string): Promise<void> {
  await adminDb.recursiveDelete(adminDb.collection('users').doc(uid));
  await adminDb.collection('platform').doc('users').collection('profiles').doc(uid).delete();
}

async function userSummary(user: Awaited<ReturnType<typeof listAllUsers>>[number]) {
  const profileSnapshot = await adminDb.collection('platform').doc('users').collection('profiles').doc(user.uid).get();
  const profile = profileSnapshot.data() || {};
  const settingsSnapshot = await adminDb.collection('users').doc(user.uid).collection('settings').doc('general').get();
  const settings = settingsSnapshot.data() || {};
  const adminSnapshot = await adminDb.collection('platform').doc('admins').collection('members').doc(user.uid).get();
  const counts = await Promise.all(collectionNames.map(async (name) => [name, (await adminDb.collection('users').doc(user.uid).collection(name).get()).size] as const));

  return {
    uid: user.uid,
    name: profile.name || user.displayName || '',
    email: user.email || '',
    phone: profile.phone || user.phoneNumber || '',
    status: profile.status || (user.disabled ? 'suspended' : 'active'),
    role: user.uid === process.env.PLATFORM_OWNER_UID
      ? 'OWNER'
      : adminSnapshot.exists ? adminSnapshot.data()?.roleId || 'STAFF' : 'CUSTOMER',
    createdAt: user.metadata.creationTime || null,
    lastLogin: user.metadata.lastSignInTime || null,
    businessName: settings.businessName || '',
    counts: Object.fromEntries(counts),
  };
}

async function handleGet(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const principal = await requireAdmin(request, 'users.view');
  const url = new URL(request.url || '/', 'http://localhost');
  const resource = url.searchParams.get('resource') || 'dashboard';

  if (resource === 'dashboard') {
    const users = await listAllUsers();
    const summaries = (await Promise.all(users.map(userSummary))).filter((user) => user.role === 'CUSTOMER');
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const newToday = summaries.filter((user) => user.createdAt && new Date(user.createdAt).getTime() >= startOfDay.getTime()).length;
    const newWeek = summaries.filter((user) => user.createdAt && now - new Date(user.createdAt).getTime() <= 7 * day).length;
    const newMonth = summaries.filter((user) => user.createdAt && now - new Date(user.createdAt).getTime() <= 30 * day).length;
    const totals = summaries.reduce((result, user) => {
      result.products += user.counts.products || 0;
      result.orders += user.counts.orders || 0;
      return result;
    }, { products: 0, orders: 0 });
    await writeAuditLog(principal, 'admin.dashboard.viewed', 'platform', 'Administrator viewed the platform dashboard.');
    sendJson(response, 200, {
      metrics: {
        totalUsers: summaries.length,
        activeUsers: summaries.filter((user) => user.status === 'active').length,
        suspendedUsers: summaries.filter((user) => user.status === 'suspended').length,
        newUsersToday: newToday,
        newUsersThisWeek: newWeek,
        newUsersThisMonth: newMonth,
        totalProducts: totals.products,
        totalOrders: totals.orders,
      },
      recentUsers: summaries.slice(-10).reverse(),
    });
    return;
  }

  if (resource === 'users') {
    const search = (url.searchParams.get('search') || '').toLowerCase();
    const status = url.searchParams.get('status') || 'all';
    const summaries = (await Promise.all((await listAllUsers()).map(userSummary)))
      .filter((user) => user.role === 'CUSTOMER');
    const filtered = summaries.filter((user) => {
      const matchesSearch = !search || [user.uid, user.name, user.email, user.phone, user.businessName].some((value) => value.toLowerCase().includes(search));
      return matchesSearch && (status === 'all' || user.status === status || user.role === status);
    });
    sendJson(response, 200, {
      users: filtered,
      canEditUsers: principal.permissions.has('users.edit'),
      canSuspendUsers: principal.permissions.has('users.suspend'),
      canDeleteUsers: principal.permissions.has('users.delete'),
    });
    return;
  }

  if (resource === 'user') {
    const uid = url.searchParams.get('uid');
    if (!uid) { sendJson(response, 400, { error: 'User ID is required' }); return; }
    const user = (await listAllUsers()).find((item) => item.uid === uid);
    if (!user) { sendJson(response, 404, { error: 'User not found' }); return; }
    await writeAuditLog(principal, 'user.viewed', uid, `Administrator viewed user ${uid}.`);
    const data = await Promise.all(collectionNames.map(async (name) => {
      const snapshot = await adminDb.collection('users').doc(uid).collection(name).orderBy('createdAt', 'desc').limit(100).get().catch(() => adminDb.collection('users').doc(uid).collection(name).limit(100).get());
      return [name, snapshot.docs.map((document) => ({ id: document.id, ...document.data() }))] as const;
    }));
    sendJson(response, 200, { profile: await userSummary(user), data: Object.fromEntries(data) });
    return;
  }

  if (resource === 'roles') {
    const principal = await requireAdmin(request, 'roles.view');
    const snapshot = await adminDb.collection('platform').doc('roles').collection('definitions').get();
    const storedRoles = snapshot.docs.map((document) => ({ id: document.id, ...document.data() }));
    const builtInRoles = [
      { id: 'OWNER', name: 'Owner', description: 'Full platform control, including users, billing status, administrators, roles, settings, and audit access.', permissions: [...ownerPermissions] },
      { id: 'MANAGER', name: 'Manager', description: 'Broad administrative access without owner control.', permissions: ['users.view', 'users.edit', 'users.suspend', 'user_data.view', 'admins.view', 'admins.create', 'reports.view', 'audit.view'] },
      { id: 'STAFF', name: 'Staff', description: 'Read-only administrative access by default.', permissions: ['users.view', 'user_data.view', 'reports.view'] },
    ];
    const editableRoles = storedRoles.filter((role) => role.id !== 'OWNER');
    const knownIds = new Set(editableRoles.map((role) => role.id));
    const visibleBuiltIns = principal.isOwner ? builtInRoles : builtInRoles.filter((role) => role.id !== 'OWNER');
    sendJson(response, 200, {
      roles: [...visibleBuiltIns.filter((role) => !knownIds.has(role.id)), ...editableRoles],
      canCreateRoles: principal.permissions.has('roles.create'),
    });
    return;
  }

  if (resource === 'admins') {
    const principal = await requireAdmin(request, 'admins.view');
    const snapshot = await adminDb.collection('platform').doc('admins').collection('members').get();
    const admins: { uid: string; roleId: string; status: string; email: string; name: string; phone: string }[] = await Promise.all(snapshot.docs.map(async (document) => {
      const member = document.data();
      const authUser = await adminAuth.getUser(document.id).catch(() => null);
      return {
        uid: document.id,
        ...member,
        roleId: member.roleId || 'STAFF',
        status: member.status || (authUser?.disabled ? 'suspended' : 'active'),
        email: authUser?.email || member.email || '',
        name: authUser?.displayName || member.name || '',
        phone: authUser?.phoneNumber || member.phone || '',
      };
    }));
    const ownerUid = process.env.PLATFORM_OWNER_UID;
    if (ownerUid && !admins.some((admin) => admin.uid === ownerUid)) {
      const owner = await adminAuth.getUser(ownerUid).catch(() => null);
      if (owner) admins.unshift({ uid: owner.uid, roleId: 'OWNER', status: owner.disabled ? 'suspended' : 'active', email: owner.email || '', name: owner.displayName || '', phone: owner.phoneNumber || '' });
    }
    const visibleAdmins = principal.isOwner
      ? admins
      : admins.filter((admin) => admin.roleId !== 'OWNER' && admin.uid !== ownerUid);
    sendJson(response, 200, {
      admins: visibleAdmins,
      canManageOwners: principal.isOwner,
      canCreateAdmins: principal.permissions.has('admins.create'),
      canCreateCustomers: principal.permissions.has('users.create'),
    });
    return;
  }

  if (resource === 'audit') {
    await requireAdmin(request, 'audit.view');
    const snapshot = await adminDb.collection('platform').doc('auditLogs').collection('entries').orderBy('createdAt', 'desc').limit(100).get();
    sendJson(response, 200, { entries: snapshot.docs.map((document) => ({ id: document.id, ...document.data() })) });
    return;
  }

  if (resource === 'sheets') {
    const sheetPrincipal = await requireAdmin(request, 'admins.view');
    if (!sheetPrincipal.isOwner) { sendJson(response, 403, { error: 'Only the Owner can manage directory sync.' }); return; }
    sendJson(response, 200, { connection: await getGoogleSheetConnection() });
    return;
  }

  sendJson(response, 400, { error: 'Unsupported admin resource' });
}

async function handlePost(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const principal = await requireAdmin(request);
  const parsedBody = (request as IncomingMessage & { body?: unknown }).body;
  let raw = '';
  if (!parsedBody) {
    for await (const chunk of request) raw += chunk.toString();
  }
  const body = (parsedBody || JSON.parse(raw || '{}')) as {
    action?: string;
    uid?: string;
    roleId?: string;
    spreadsheetId?: string;
    role?: { id?: string; name?: string; description?: string; permissions?: unknown };
    user?: { email?: string; password?: string; name?: string; phone?: string; businessName?: string };
    admin?: { email?: string; password?: string; name?: string; roleId?: string; phone?: string };
  };
  if (!body.action) { sendJson(response, 400, { error: 'Action is required' }); return; }

  if (['beginGoogleSheetOAuth', 'syncGoogleSheet', 'disconnectGoogleSheet'].includes(body.action)) {
    if (!principal.isOwner) { sendJson(response, 403, { error: 'Only the Owner can manage directory sync.' }); return; }
    try {
      if (body.action === 'beginGoogleSheetOAuth') {
        const authorizationUrl = await beginGoogleSheetOAuth(String(body.spreadsheetId || ''), principal.uid);
        await writeAuditLog(principal, 'directory_sheet.oauth.started', 'platform', 'Owner started Google Sheets authorization.');
        sendJson(response, 200, { ok: true, authorizationUrl });
      } else if (body.action === 'syncGoogleSheet') {
        const error = await syncConnectedGoogleSheet();
        if (error) { sendJson(response, 503, { error }); return; }
        const connection = await getGoogleSheetConnection();
        await writeAuditLog(principal, 'directory_sheet.synced', connection.spreadsheetId || '', 'Owner synced the Firebase user directory to Google Sheets.');
        sendJson(response, 200, { ok: true, connection });
      } else {
        const connection = await getGoogleSheetConnection();
        await disconnectGoogleSheet();
        await writeAuditLog(principal, 'directory_sheet.disconnected', connection.spreadsheetId || '', 'Owner disconnected the user directory from Google Sheets.');
        sendJson(response, 200, { ok: true });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Google Sheets request failed';
      sendJson(response, 503, { error: message });
    }
    return;
  }
  if (['suspend', 'activate', 'deleteUser', 'assignAdmin', 'editAdmin', 'editUser', 'removeAdmin', 'deleteAdmin'].includes(body.action) && !body.uid) {
    sendJson(response, 400, { error: 'User ID is required' });
    return;
  }

  if (body.action === 'suspend' || body.action === 'activate') {
    if (!principal.permissions.has('users.suspend')) throw new Error('FORBIDDEN');
    if (body.uid === process.env.PLATFORM_OWNER_UID) throw new Error('FORBIDDEN');
    const uid = body.uid;
    if (!uid) { sendJson(response, 400, { error: 'User ID is required' }); return; }
    const adminRecord = await adminDb.collection('platform').doc('admins').collection('members').doc(uid).get();
    if (adminRecord.data()?.roleId === 'OWNER' && !principal.isOwner) throw new Error('FORBIDDEN');
    const disabled = body.action === 'suspend';
    await adminAuth.updateUser(uid, { disabled });
    await adminDb.collection('platform').doc('users').collection('profiles').doc(uid).set({ status: disabled ? 'suspended' : 'active', updatedAt: new Date().toISOString() }, { merge: true });
    await writeAuditLog(principal, `user.${body.action}d`, uid, `Administrator ${body.action}d user ${uid}.`);
    sendJson(response, 200, { ok: true, sheetSyncError: await syncConnectedGoogleSheet() });
    return;
  }

  if (body.action === 'deleteUser') {
    if (!principal.permissions.has('users.delete')) throw new Error('FORBIDDEN');
    const uid = body.uid;
    if (!uid || uid === principal.uid || uid === process.env.PLATFORM_OWNER_UID) {
      sendJson(response, 400, { error: 'The active administrator cannot be deleted' });
      return;
    }
    const member = await adminDb.collection('platform').doc('admins').collection('members').doc(uid).get();
    if (member.exists) {
      sendJson(response, 400, { error: 'Employee accounts must be deleted from the Administrators section' });
      return;
    }
    await adminAuth.updateUser(uid, { disabled: true });
    const profileRef = adminDb.collection('platform').doc('users').collection('profiles').doc(uid);
    await profileRef.set({ status: 'suspended', updatedAt: new Date().toISOString() }, { merge: true });
    await deleteUserData(uid);
    await adminAuth.deleteUser(uid);
    await writeAuditLog(principal, 'user.deleted', uid, `Administrator permanently deleted user ${uid} and their business data.`);
    sendJson(response, 200, { ok: true, sheetSyncError: await syncConnectedGoogleSheet() });
    return;
  }

  if (body.action === 'createUser') {
    if (!principal.permissions.has('users.create')) throw new Error('FORBIDDEN');
    const userData = body.user;
    const email = String(userData?.email || '').trim().toLowerCase();
    const password = String(userData?.password || '');
    const name = String(userData?.name || '').trim();
    const phone = String(userData?.phone || '').trim();
    if (!email || !password || !name) { sendJson(response, 400, { error: 'Name, email, and password are required' }); return; }
    if (password.length < 12) { sendJson(response, 400, { error: 'User passwords must be at least 12 characters' }); return; }
    const authUser = await adminAuth.createUser({ email, password, displayName: name, emailVerified: false });
    await adminDb.collection('platform').doc('users').collection('profiles').doc(authUser.uid).set({
      name,
      email,
      phone,
      status: 'active',
      createdAt: new Date().toISOString(),
      createdBy: principal.uid,
    });
    await writeAuditLog(principal, 'user.created', authUser.uid, `Administrator created customer account ${email}.`);
    sendJson(response, 201, { ok: true, uid: authUser.uid, email, sheetSyncError: await syncConnectedGoogleSheet() });
    return;
  }

  if (body.action === 'editUser') {
    if (!principal.permissions.has('users.edit')) throw new Error('FORBIDDEN');
    const uid = body.uid;
    const userData = body.user;
    if (!uid) { sendJson(response, 400, { error: 'User ID is required' }); return; }
    const memberSnapshot = await adminDb.collection('platform').doc('admins').collection('members').doc(uid).get();
    if (memberSnapshot.exists || uid === process.env.PLATFORM_OWNER_UID) {
      sendJson(response, 400, { error: 'Employee profiles must be edited from the Administrators section' });
      return;
    }
    const name = String(userData?.name || '').trim();
    const email = String(userData?.email || '').trim().toLowerCase();
    const phone = String(userData?.phone || '').trim();
    const businessName = String(userData?.businessName || '').trim();
    if (!name || !email) { sendJson(response, 400, { error: 'Name and email are required' }); return; }
    const authUpdates: { displayName: string; email: string; phoneNumber?: string } = { displayName: name, email };
    if (phone) authUpdates.phoneNumber = phone;
    await adminAuth.updateUser(uid, authUpdates);
    await adminDb.collection('platform').doc('users').collection('profiles').doc(uid).set({ name, email, phone, updatedAt: new Date().toISOString(), updatedBy: principal.uid }, { merge: true });
    if (userData?.businessName !== undefined) {
      await adminDb.collection('users').doc(uid).collection('settings').doc('general').set({ businessName, updatedAt: new Date().toISOString() }, { merge: true });
    }
    await writeAuditLog(principal, 'user.profile.updated', uid, `Administrator updated customer profile for ${email}.`);
    sendJson(response, 200, { ok: true, sheetSyncError: await syncConnectedGoogleSheet() });
    return;
  }

  if (body.action === 'createRole') {
    if (!principal.permissions.has('roles.create')) throw new Error('FORBIDDEN:roles.create');
    const role = body.role as { id?: string; name?: string; description?: string; permissions?: unknown };
    const roleId = String(role?.id || '').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
    const permissions = Array.isArray(role?.permissions) ? role.permissions.filter((item): item is string => typeof item === 'string') : [];
    if (!roleId || !role?.name) { sendJson(response, 400, { error: 'Role ID and name are required' }); return; }
    if (!principal.isOwner && permissions.some((permission) => permission === 'platform.manage' || permission.startsWith('admins.') || permission.startsWith('roles.'))) {
      throw new Error('FORBIDDEN:role.permissions');
    }
    await adminDb.collection('platform').doc('roles').collection('definitions').doc(roleId).set({
      name: role.name,
      description: role.description || '',
      permissions,
      createdBy: principal.uid,
      createdAt: new Date().toISOString(),
    }, { merge: false });
    await writeAuditLog(principal, 'role.created', roleId, `Administrator created role ${roleId}.`, { permissions });
    sendJson(response, 201, { ok: true, roleId });
    return;
  }

  if (body.action === 'assignAdmin') {
    if (!principal.permissions.has('admins.create')) throw new Error('FORBIDDEN');
    const roleId = String(body.roleId || '').trim();
    if (!body.uid || !roleId) { sendJson(response, 400, { error: 'User ID and role are required' }); return; }
    if (!principal.isOwner && roleId !== 'STAFF') throw new Error('FORBIDDEN');
    if (body.uid === process.env.PLATFORM_OWNER_UID && roleId !== 'OWNER') throw new Error('FORBIDDEN');
    if (!principal.isOwner && roleId === 'OWNER') throw new Error('FORBIDDEN');
    const currentMembership = await adminDb.collection('platform').doc('admins').collection('members').doc(body.uid).get();
    if (!principal.isOwner && currentMembership.data()?.roleId === 'OWNER') throw new Error('FORBIDDEN');
    const roleSnapshot = await adminDb.collection('platform').doc('roles').collection('definitions').doc(roleId).get();
    if (!roleSnapshot.exists && !['OWNER', 'MANAGER', 'STAFF'].includes(roleId)) { sendJson(response, 400, { error: 'Role does not exist' }); return; }
    await adminDb.collection('platform').doc('admins').collection('members').doc(body.uid).set({ roleId, status: 'active', createdAt: new Date().toISOString(), createdBy: principal.uid }, { merge: true });
    await writeAuditLog(principal, 'admin.assigned', body.uid, `Administrator assigned role ${roleId} to ${body.uid}.`);
    sendJson(response, 200, { ok: true, sheetSyncError: await syncConnectedGoogleSheet() });
    return;
  }

  if (body.action === 'editAdmin') {
    if (!principal.isOwner) throw new Error('FORBIDDEN');
    const uid = body.uid;
    const adminData = body.admin;
    const name = String(adminData?.name || '').trim();
    const email = String(adminData?.email || '').trim().toLowerCase();
    const phone = String(adminData?.phone || '').trim();
    if (!uid || !name || !email) { sendJson(response, 400, { error: 'User ID, name, and email are required' }); return; }
    const update: { displayName: string; email: string; phoneNumber?: string } = { displayName: name, email };
    if (phone) update.phoneNumber = phone;
    await adminAuth.updateUser(uid, update);
    await adminDb.collection('platform').doc('admins').collection('members').doc(uid).set({ name, email, phone, updatedAt: new Date().toISOString(), updatedBy: principal.uid }, { merge: true });
    await writeAuditLog(principal, 'admin.profile.updated', uid, `Owner updated administrator profile for ${email}.`);
    sendJson(response, 200, { ok: true, sheetSyncError: await syncConnectedGoogleSheet() });
    return;
  }

  if (body.action === 'removeAdmin') {
    if (!principal.isOwner) throw new Error('FORBIDDEN');
    const uid = body.uid;
    if (!uid || uid === principal.uid || uid === process.env.PLATFORM_OWNER_UID) {
      sendJson(response, 400, { error: 'The active platform owner cannot be removed' });
      return;
    }
    const memberRef = adminDb.collection('platform').doc('admins').collection('members').doc(uid);
    const member = await memberRef.get();
    if (!member.exists) { sendJson(response, 404, { error: 'Administrator not found' }); return; }
    await memberRef.delete();
    await writeAuditLog(principal, 'admin.access.removed', uid, `Owner removed administrator access for ${uid}.`);
    sendJson(response, 200, { ok: true, sheetSyncError: await syncConnectedGoogleSheet() });
    return;
  }

  if (body.action === 'deleteAdmin') {
    if (!principal.isOwner) throw new Error('FORBIDDEN');
    const uid = body.uid;
    if (!uid || uid === principal.uid || uid === process.env.PLATFORM_OWNER_UID) {
      sendJson(response, 400, { error: 'The active platform owner cannot be deleted' });
      return;
    }
    const memberRef = adminDb.collection('platform').doc('admins').collection('members').doc(uid);
    const member = await memberRef.get();
    if (!member.exists) { sendJson(response, 404, { error: 'Employee not found' }); return; }
    if (member.data()?.roleId === 'OWNER') {
      sendJson(response, 400, { error: 'Owner accounts cannot be permanently deleted here' });
      return;
    }
    await adminAuth.updateUser(uid, { disabled: true });
    await memberRef.set({ status: 'suspended', updatedAt: new Date().toISOString() }, { merge: true });
    await deleteUserData(uid);
    await adminAuth.deleteUser(uid);
    await memberRef.delete();
    await writeAuditLog(principal, 'admin.deleted', uid, `Owner permanently deleted employee ${uid} and their business data.`);
    sendJson(response, 200, { ok: true, sheetSyncError: await syncConnectedGoogleSheet() });
    return;
  }

  if (body.action === 'createAdmin') {
    if (!principal.permissions.has('admins.create')) throw new Error('FORBIDDEN:admins.create');
    const adminData = body.admin as { email?: string; password?: string; name?: string; roleId?: string; phone?: string };
    const email = String(adminData?.email || '').trim().toLowerCase();
    const password = String(adminData?.password || '');
    const name = String(adminData?.name || '').trim();
    const phone = String(adminData?.phone || '').trim();
    const roleId = String(adminData?.roleId || '').trim();
    if (!email || !password || !name || !roleId) { sendJson(response, 400, { error: 'Name, email, password, and role are required' }); return; }
    if (password.length < 12) { sendJson(response, 400, { error: 'Admin passwords must be at least 12 characters' }); return; }
    if (!principal.isOwner && roleId !== 'STAFF') throw new Error('FORBIDDEN:admin-role');
    const roleSnapshot = await adminDb.collection('platform').doc('roles').collection('definitions').doc(roleId).get();
    if (!roleSnapshot.exists && !['OWNER', 'MANAGER', 'STAFF'].includes(roleId)) { sendJson(response, 400, { error: 'Role does not exist' }); return; }

    const authUser = await adminAuth.createUser({ email, password, displayName: name, phoneNumber: phone || undefined, emailVerified: false });
    await adminDb.collection('platform').doc('admins').collection('members').doc(authUser.uid).set({
      roleId,
      status: 'active',
      name,
      email,
      phone,
      createdAt: new Date().toISOString(),
      createdBy: principal.uid,
    });
    await writeAuditLog(principal, 'admin.created', authUser.uid, `Administrator created ${email} with role ${roleId}.`);
    sendJson(response, 201, { ok: true, uid: authUser.uid, email, roleId, sheetSyncError: await syncConnectedGoogleSheet() });
    return;
  }

  sendJson(response, 400, { error: 'Unsupported admin action' });
}

export default async function handler(request: IncomingMessage, response: ServerResponse): Promise<void> {
  try {
    if (request.method === 'GET') await handleGet(request, response);
    else if (request.method === 'POST') await handlePost(request, response);
    else { response.setHeader('Allow', 'GET, POST'); sendJson(response, 405, { error: 'Method not allowed' }); }
  } catch (error) {
    console.error('Admin API error:', error);
    const message = error instanceof Error ? error.message : '';
    if (message.includes('Firebase Admin requires')) {
      sendJson(response, 503, { error: 'Admin service is not configured. Set Firebase Admin server environment variables.' });
      return;
    }
    const permissionMessages: Record<string, string> = {
      'roles.create': 'Your administrator role does not include permission to create roles.',
      'admins.create': 'Your administrator role does not include permission to create employees.',
      'role.permissions': 'Your role cannot grant administrator or platform permissions.',
      'admin-role': 'Managers can create Staff employees only. An Owner must create or assign elevated roles.',
    };
    const permission = message.startsWith('FORBIDDEN:') ? message.slice('FORBIDDEN:'.length) : '';
    sendJson(response, adminErrorStatus(error), {
      error: adminErrorStatus(error) === 401 ? 'Unauthorized' : permissionMessages[permission] || 'Forbidden',
    });
  }
}
