import { adminAuth, adminDb } from './admin';

export type AdminPermission =
  | 'users.view'
  | 'users.create'
  | 'users.edit'
  | 'users.delete'
  | 'users.suspend'
  | 'user_data.view'
  | 'user_products.view'
  | 'user_orders.view'
  | 'user_customers.view'
  | 'user_finance.view'
  | 'user_inventory.view'
  | 'admins.view'
  | 'admins.create'
  | 'admins.edit'
  | 'admins.delete'
  | 'roles.view'
  | 'roles.create'
  | 'roles.edit'
  | 'roles.delete'
  | 'roles.assign'
  | 'settings.view'
  | 'settings.edit'
  | 'reports.view'
  | 'reports.export'
  | 'audit.view'
  | 'platform.manage';

export type AdminRoleId = 'OWNER' | 'MANAGER' | 'STAFF' | string;

export interface AdminPrincipal {
  uid: string;
  email: string | null;
  roleId: AdminRoleId;
  permissions: Set<string>;
  isOwner: boolean;
}

const ownerUid = process.env.PLATFORM_OWNER_UID;

export const ownerPermissions = new Set<AdminPermission>([
  'users.view', 'users.create', 'users.edit', 'users.delete', 'users.suspend',
  'user_data.view', 'user_products.view', 'user_orders.view', 'user_customers.view',
  'user_finance.view', 'user_inventory.view', 'admins.view', 'admins.create',
  'admins.edit', 'admins.delete', 'roles.view', 'roles.create', 'roles.edit',
  'roles.delete', 'roles.assign', 'settings.view', 'settings.edit', 'reports.view',
  'reports.export', 'audit.view', 'platform.manage',
]);

const builtInRolePermissions: Record<string, string[]> = {
  MANAGER: ['users.view', 'users.edit', 'users.suspend', 'user_data.view', 'user_products.view', 'user_orders.view', 'user_customers.view', 'user_finance.view', 'user_inventory.view', 'admins.view', 'admins.create', 'reports.view', 'audit.view'],
  STAFF: ['users.view', 'user_data.view', 'user_products.view', 'user_orders.view', 'user_customers.view', 'user_finance.view', 'user_inventory.view', 'reports.view'],
};

function tokenFromRequest(request: { headers: Record<string, unknown> }): string | null {
  const authorization = request.headers.authorization;
  if (typeof authorization === 'string' && authorization.startsWith('Bearer ')) {
    return authorization.slice('Bearer '.length).trim();
  }
  return null;
}

export async function requireAdmin(
  request: { headers: Record<string, unknown> },
  permission?: AdminPermission
): Promise<AdminPrincipal> {
  const token = tokenFromRequest(request);
  if (!token) throw new Error('UNAUTHORIZED');

  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(token, true);
  } catch {
    throw new Error('UNAUTHORIZED');
  }

  const uid = decoded.uid;
  const email = decoded.email || null;
  if (ownerUid && uid === ownerUid) {
    return { uid, email, roleId: 'OWNER', permissions: ownerPermissions, isOwner: true };
  }

  const adminSnapshot = await adminDb.collection('platform').doc('admins').collection('members').doc(uid).get();
  if (!adminSnapshot.exists) throw new Error('FORBIDDEN');
  const admin = adminSnapshot.data() || {};
  if (admin.status !== 'active') throw new Error('FORBIDDEN');

  const roleId = typeof admin.roleId === 'string' ? admin.roleId : 'STAFF';
  if (roleId === 'OWNER') {
    return { uid, email, roleId, permissions: ownerPermissions, isOwner: true };
  }
  const roleSnapshot = await adminDb.collection('platform').doc('roles').collection('definitions').doc(roleId).get();
  const role = roleSnapshot.data() || {};
  const permissions = new Set<string>(
    Array.isArray(role.permissions) ? role.permissions : builtInRolePermissions[roleId] || []
  );
  if (permission && !permissions.has(permission)) throw new Error('FORBIDDEN');

  return { uid, email, roleId, permissions, isOwner: false };
}

export async function writeAuditLog(
  principal: AdminPrincipal,
  action: string,
  target: string,
  description: string,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  await adminDb.collection('platform').doc('auditLogs').collection('entries').add({
    action,
    adminUid: principal.uid,
    adminEmail: principal.email,
    roleId: principal.roleId,
    target,
    description,
    metadata,
    createdAt: new Date().toISOString(),
  });
}

export function adminErrorStatus(error: unknown): number {
  return error instanceof Error && error.message === 'UNAUTHORIZED' ? 401 : 403;
}
