import React, { useEffect, useState } from 'react';
import { GoogleSheetDialog as GoogleOAuthSheetDialog } from './GoogleSheetDialog';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Activity, BarChart3, Building2, ChevronDown, ExternalLink, Eye, FileSpreadsheet, LogOut, Pencil, Plus, RefreshCw, Search, ShieldAlert, ShieldCheck, Trash2, UserCheck, UserPlus, UserX, Users, X } from 'lucide-react';

interface AdminUser {
  uid: string;
  name: string;
  email: string;
  phone: string;
  status: string;
  role: string;
  createdAt: string | null;
  lastLogin: string | null;
  businessName: string;
  counts: Record<string, number>;
}

interface AdminMember {
  uid: string;
  name: string;
  email: string;
  roleId: string;
  status: string;
  phone: string;
}

interface AdminMetrics {
  totalUsers: number;
  activeUsers: number;
  suspendedUsers: number;
  newUsersToday: number;
  newUsersThisWeek: number;
  newUsersThisMonth: number;
  totalProducts: number;
  totalOrders: number;
}

interface SheetConnection {
  connected: boolean;
  oauthConfigured?: boolean;
  spreadsheetId?: string;
  spreadsheetTitle?: string;
  sheetName?: string;
  googleEmail?: string;
  lastSyncedAt?: string;
  lastSyncError?: string;
}

const adminFetch = async (path: string, token: string, options?: RequestInit) => {
  const response = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options?.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Admin request failed');
  return body;
};

const formatDate = (value: string | null) => value ? new Date(value).toLocaleString() : 'Never';

export const AdminApp: React.FC = () => {
  const { user, loading, signInWithEmail, logout } = useAuth();
  const { error, success } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [adminLoginComplete, setAdminLoginComplete] = useState(false);
  const [section, setSection] = useState<'dashboard' | 'users' | 'roles' | 'admins' | 'audit'>('dashboard');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended'>('all');
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [userData, setUserData] = useState<Record<string, unknown[]> | null>(null);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [serviceError, setServiceError] = useState('');
  const [roles, setRoles] = useState<any[]>([]);
  const [admins, setAdmins] = useState<AdminMember[]>([]);
  const [canManageOwners, setCanManageOwners] = useState(false);
  const [canCreateAdmins, setCanCreateAdmins] = useState(false);
  const [canCreateRoles, setCanCreateRoles] = useState(false);
  const [canCreateCustomers, setCanCreateCustomers] = useState(false);
  const [canEditUsers, setCanEditUsers] = useState(false);
    const [canDeleteUsers, setCanDeleteUsers] = useState(false);
  const [canSuspendUsers, setCanSuspendUsers] = useState(false);
  const [sheetConnection, setSheetConnection] = useState<SheetConnection>({ connected: false });
  const [auditEntries, setAuditEntries] = useState<any[]>([]);
  const [adminForm, setAdminForm] = useState({ name: '', email: '', phone: '', password: '', roleId: 'STAFF' });
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [roleTarget, setRoleTarget] = useState<AdminMember | null>(null);
  const [assignRoleId, setAssignRoleId] = useState('STAFF');
  const [roleForm, setRoleForm] = useState({ id: '', name: '', description: '', permissions: [] as string[] });
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [customerForm, setCustomerForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [editTarget, setEditTarget] = useState<AdminMember | null>(null);
  const [editForm, setEditForm] = useState({ name: '', email: '', phone: '' });
  const [customerEditTarget, setCustomerEditTarget] = useState<AdminUser | null>(null);
  const [customerEditForm, setCustomerEditForm] = useState({ name: '', email: '', phone: '', businessName: '' });
  const [sheetDialogOpen, setSheetDialogOpen] = useState(false);
  const [spreadsheetInput, setSpreadsheetInput] = useState('');

  const refresh = async () => {
    if (!user) return;
    try {
      setBusy(true);
      setAccessDenied(false);
      setServiceError('');
      const token = await user.getIdToken(true);
      const [dashboard, userList, roleList, adminList, auditList] = await Promise.all([
        adminFetch('/api/admin?resource=dashboard', token),
        adminFetch('/api/admin?resource=users', token),
        adminFetch('/api/admin?resource=roles', token).catch(() => ({ roles: [], canCreateRoles: false })),
        adminFetch('/api/admin?resource=admins', token).catch(() => ({ admins: [] })),
        adminFetch('/api/admin?resource=audit', token).catch(() => ({ entries: [] })),
      ]);
      setMetrics(dashboard.metrics);
      setUsers(userList.users);
      setCanEditUsers(Boolean(userList.canEditUsers));
      setCanSuspendUsers(Boolean(userList.canSuspendUsers));
        setCanDeleteUsers(Boolean(userList.canDeleteUsers));
      setRoles(roleList.roles);
      setCanCreateRoles(Boolean(roleList.canCreateRoles));
      setAdmins(adminList.admins);
      setCanManageOwners(Boolean(adminList.canManageOwners));
      setCanCreateAdmins(Boolean(adminList.canCreateAdmins));
      setCanCreateCustomers(Boolean(adminList.canCreateCustomers));
      setAuditEntries(auditList.entries);
      if (adminList.canManageOwners) {
        const sheetsResult = await adminFetch('/api/admin?resource=sheets', token).catch(() => ({ connection: { connected: false } }));
        setSheetConnection(sheetsResult.connection || { connected: false });
      } else {
        setSheetConnection({ connected: false });
      }
    } catch (err: any) {
      if (err.message === 'Forbidden') setAccessDenied(true);
      if (err.message.includes('Admin service is not configured')) setServiceError(err.message);
      error(err.message === 'Forbidden' ? 'This Firebase account is not authorized for the Admin Panel.' : err.message || 'Admin data could not be loaded');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get('googleSheets');
    const connectionError = params.get('googleSheetsError');
    if (connected === 'connected') success('Google account connected; user directory sync is active.');
    if (connectionError) error(connectionError);
    if (connected || connectionError) window.history.replaceState({}, document.title, window.location.pathname);
  }, [success, error]);

  useEffect(() => {
    if (!user || adminLoginComplete) return;
    let active = true;
    const verifyAdminSession = async () => {
      try {
        const token = await user.getIdToken();
        await adminFetch('/api/admin?resource=dashboard', token);
        if (active) setAdminLoginComplete(true);
      } catch {
        // A non-admin session stays on the admin sign-in form.
      }
    };
    void verifyAdminSession();
    return () => { active = false; };
  }, [user, adminLoginComplete]);

  useEffect(() => {
    if (user && adminLoginComplete) refresh();
  }, [user, adminLoginComplete]);

  const openUser = async (adminUser: AdminUser) => {
    if (!user) return;
    try {
      setBusy(true);
      const token = await user.getIdToken();
      const result = await adminFetch(`/api/admin?resource=user&uid=${encodeURIComponent(adminUser.uid)}`, token);
      setSelectedUser(result.profile);
      setUserData(result.data);
    } catch (err: any) {
      error(err.message || 'User data could not be loaded');
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (adminUser: AdminUser, action: 'suspend' | 'activate') => {
    if (!user) return;
    if (!window.confirm(`${action === 'suspend' ? 'Suspend' : 'Activate'} ${adminUser.email}?`)) return;
    try {
      setBusy(true);
      const token = await user.getIdToken();
      await adminFetch('/api/admin', token, { method: 'POST', body: JSON.stringify({ action, uid: adminUser.uid }) });
      success(`User ${action}d`);
      await refresh();
    } catch (err: any) {
      error(err.message || 'User status could not be changed');
    } finally {
      setBusy(false);
    }
  };

  const deleteUserAccount = async (adminUser: AdminUser) => {
    if (!user || !window.confirm(`Permanently delete ${adminUser.email}? This deletes the login and all of this user's business data. This cannot be undone.`)) return;
    try {
      setBusy(true);
      const token = await user.getIdToken();
      await adminFetch('/api/admin', token, {
        method: 'POST',
        body: JSON.stringify({ action: 'deleteUser', uid: adminUser.uid }),
      });
      success('User account and business data permanently deleted');
      await refresh();
    } catch (err: any) {
      error(err.message || 'User account could not be deleted');
    } finally {
      setBusy(false);
    }
  };

  const assignRole = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user || !roleTarget) return;
    if (!canManageOwners && assignRoleId !== 'STAFF') {
      error('Managers can assign the Staff role only.');
      return;
    }
    try {
      setBusy(true);
      const token = await user.getIdToken();
      await adminFetch('/api/admin', token, {
        method: 'POST',
        body: JSON.stringify({ action: 'assignAdmin', uid: roleTarget.uid, roleId: assignRoleId }),
      });
      success(`Assigned ${assignRoleId} role`);
      setRoleTarget(null);
      await refresh();
    } catch (err: any) {
      error(err.message || 'Role could not be assigned');
    } finally {
      setBusy(false);
    }
  };

  const createCustomer = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) return;
    try {
      setBusy(true);
      const token = await user.getIdToken();
      await adminFetch('/api/admin', token, {
        method: 'POST',
        body: JSON.stringify({ action: 'createUser', user: customerForm }),
      });
      success('Customer account created');
      setCustomerForm({ name: '', email: '', phone: '', password: '' });
      setCustomerModalOpen(false);
      await refresh();
    } catch (err: any) {
      error(err.message || 'Customer account could not be created');
    } finally {
      setBusy(false);
    }
  };

  const editCustomer = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user || !customerEditTarget) return;
    try {
      setBusy(true);
      const token = await user.getIdToken();
      const result = await adminFetch('/api/admin', token, {
        method: 'POST',
        body: JSON.stringify({ action: 'editUser', uid: customerEditTarget.uid, user: customerEditForm }),
      });
      setCustomerEditTarget(null);
      await refresh();
      if (result.sheetSyncError) error(`Firebase profile saved; Google Sheets sync failed: ${result.sheetSyncError}`);
      else success('Customer profile updated');
    } catch (err: any) {
      error(err.message || 'Customer profile could not be updated');
    } finally {
      setBusy(false);
    }
  };

  const connectSheet = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user || !spreadsheetInput.trim()) return;
    try {
      setBusy(true);
      const token = await user.getIdToken();
      const result = await adminFetch('/api/admin', token, {
        method: 'POST',
        body: JSON.stringify({ action: 'beginGoogleSheetOAuth', spreadsheetId: spreadsheetInput.trim() }),
      });
      if (!result.authorizationUrl) throw new Error('Google did not return an authorization URL.');
      window.location.assign(result.authorizationUrl);
    } catch (err: any) {
      error(err.message || 'Google Sheet could not be connected');
    } finally {
      setBusy(false);
    }
  };

  const syncSheet = async () => {
    if (!user || !sheetConnection.connected) return;
    try {
      setBusy(true);
      const token = await user.getIdToken();
      const result = await adminFetch('/api/admin', token, {
        method: 'POST',
        body: JSON.stringify({ action: 'syncGoogleSheet' }),
      });
      setSheetConnection(result.connection);
      success('User directory synced');
    } catch (err: any) {
      error(err.message || 'Google Sheet could not be synced');
      const token = await user.getIdToken().catch(() => '');
      if (token) {
        const result = await adminFetch('/api/admin?resource=sheets', token).catch(() => null);
        if (result?.connection) setSheetConnection(result.connection);
      }
    } finally {
      setBusy(false);
    }
  };

  const disconnectSheet = async () => {
    if (!user || !window.confirm('Disconnect automatic user-directory sync? Firebase data will remain unchanged.')) return;
    try {
      setBusy(true);
      const token = await user.getIdToken();
      await adminFetch('/api/admin', token, { method: 'POST', body: JSON.stringify({ action: 'disconnectGoogleSheet' }) });
      setSheetConnection({ connected: false });
      success('Google Sheet disconnected');
    } catch (err: any) {
      error(err.message || 'Google Sheet could not be disconnected');
    } finally {
      setBusy(false);
    }
  };

  const createRole = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) return;
    if (!canCreateRoles) {
      error('Your administrator role does not include permission to create roles.');
      return;
    }
    try {
      setBusy(true);
      const token = await user.getIdToken();
      await adminFetch('/api/admin', token, {
        method: 'POST',
        body: JSON.stringify({ action: 'createRole', role: roleForm }),
      });
      success('Role created');
      setRoleForm({ id: '', name: '', description: '', permissions: [] });
      setRoleModalOpen(false);
      await refresh();
    } catch (err: any) {
      error(err.message || 'Role could not be created');
    } finally {
      setBusy(false);
    }
  };

  const editAdmin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user || !editTarget) return;
    try {
      setBusy(true);
      const token = await user.getIdToken();
      await adminFetch('/api/admin', token, {
        method: 'POST',
        body: JSON.stringify({ action: 'editAdmin', uid: editTarget.uid, admin: editForm }),
      });
      success('Employee profile updated');
      setEditTarget(null);
      await refresh();
    } catch (err: any) {
      error(err.message || 'Employee profile could not be updated');
    } finally {
      setBusy(false);
    }
  };

  const removeAdmin = async (member: AdminMember, permanentlyDelete = false) => {
    const action = permanentlyDelete ? 'deleteAdmin' : 'removeAdmin';
    const prompt = permanentlyDelete
      ? `Permanently delete employee ${member.email}? This deletes their login and business data. This cannot be undone.`
      : `Remove employee access for ${member.email}? Their customer login and business data will remain.`;
    if (!user || !window.confirm(prompt)) return;
    try {
      setBusy(true);
      const token = await user.getIdToken();
      await adminFetch('/api/admin', token, {
        method: 'POST',
        body: JSON.stringify({ action, uid: member.uid }),
      });
      success(permanentlyDelete ? 'Employee account and business data permanently deleted' : 'Employee access removed');
      await refresh();
    } catch (err: any) {
      error(err.message || 'Employee access could not be removed');
    } finally {
      setBusy(false);
    }
  };

  const createAdmin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) return;
    if (!canManageOwners && adminForm.roleId !== 'STAFF') {
      error('Managers can create Staff employees only.');
      return;
    }
    try {
      setBusy(true);
      const token = await user.getIdToken();
      await adminFetch('/api/admin', token, {
        method: 'POST',
        body: JSON.stringify({ action: 'createAdmin', admin: adminForm }),
      });
      success('Administrator account created in Firebase Authentication');
      setAdminForm({ name: '', email: '', phone: '', password: '', roleId: 'STAFF' });
      await refresh();
    } catch (err: any) {
      error(err.message || 'Administrator account could not be created');
    } finally {
      setBusy(false);
    }
  };

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      setAuthBusy(true);
      await signInWithEmail(email.trim(), password);
      setAdminLoginComplete(true);
    } catch (err: any) {
      error(err.message || 'Admin authentication failed');
    } finally {
      setAuthBusy(false);
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[#faf7f0] text-[#574536]">Checking admin session...</div>;

  if (user && adminLoginComplete && accessDenied) {
    return (
      <div className="min-h-screen bg-[#faf7f0] flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-[#fffdf8] border border-[#eadfcd] rounded-xl p-7 text-center space-y-4">
          <ShieldAlert className="w-10 h-10 mx-auto text-[#985a38]" />
          <h1 className="text-2xl font-bold text-[#44352c]">Admin access denied</h1>
          <p className="text-sm text-gray-500">
            The signed-in account {user.email ? `(${user.email})` : ''} is not registered as a platform administrator.
            Ask the platform owner to authorize this Firebase Auth UID:
          </p>
          <code className="block break-all rounded-md bg-[#f6f0e5] px-3 py-2 text-xs text-[#44352c]">{user.uid}</code>
          <p className="text-xs text-gray-500">
            The owner can set this UID as the server-only <code>PLATFORM_OWNER_UID</code> and restart/redeploy,
            or add an active administrator membership in Firestore under <code>platform/admins/members/{user.uid}</code>.
            Do not share your password or Firebase service-account private key.
          </p>
          <div className="flex gap-2 justify-center">
            <button onClick={() => logout()} className="px-4 py-2 rounded-md bg-[#805638] text-white font-semibold">Use another account</button>
            <a href="/" className="px-4 py-2 rounded-md border border-[#eadfcd] font-semibold text-[#574536]">Customer app</a>
          </div>
        </div>
      </div>
    );
  }

  if (user && adminLoginComplete && serviceError) {
    return (
      <div className="min-h-screen bg-[#faf7f0] flex items-center justify-center p-4">
        <div className="w-full max-w-lg bg-[#fffdf8] border border-[#eadfcd] rounded-xl p-7 space-y-4">
          <h1 className="text-2xl font-bold text-[#44352c]">Admin service is not configured</h1>
          <p className="text-sm text-gray-600">The login worked, but the server cannot connect to Firebase Admin. Add the server-only variables to `.env` locally or Vercel Environment Variables, then restart/redeploy:</p>
          <pre className="p-3 bg-[#f6f0e5] rounded-md text-xs overflow-auto">FIREBASE_PROJECT_ID{`\n`}FIREBASE_CLIENT_EMAIL{`\n`}FIREBASE_PRIVATE_KEY{`\n`}PLATFORM_OWNER_UID</pre>
          <button onClick={() => { setAdminLoginComplete(false); setServiceError(''); }} className="px-4 py-2 rounded-md bg-[#805638] text-white font-semibold">Back to admin login</button>
        </div>
      </div>
    );
  }

  if (!user || !adminLoginComplete) {
    return (
      <div className="min-h-screen bg-[#faf7f0] flex items-center justify-center p-4">
        <form onSubmit={handleLogin} className="w-full max-w-md bg-[#fffdf8] border border-[#eadfcd] rounded-xl p-7 shadow-sm space-y-4">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-[#9a7048] font-bold">Business Manager Platform</p>
            <h1 className="text-2xl font-bold text-[#44352c] mt-1">Admin Panel</h1>
            <p className="text-sm text-gray-500 mt-1">Enter your separate Firebase administrator account. An inventory customer login is not an admin login.</p>
          </div>
          {user && <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">Currently signed in to the inventory app as <strong>{user.email || user.uid}</strong>. Sign in below with the admin account to continue.</div>}
          <input type="email" required placeholder="Admin email" value={email} onChange={(event) => setEmail(event.target.value)} className="w-full px-3 py-2.5 border border-[#e4d8c6] rounded-md bg-white" />
          <input type="password" required placeholder="Password" value={password} onChange={(event) => setPassword(event.target.value)} className="w-full px-3 py-2.5 border border-[#e4d8c6] rounded-md bg-white" />
          <button disabled={authBusy} className="w-full py-2.5 rounded-md bg-[#805638] text-white font-semibold disabled:opacity-50">{authBusy ? 'Signing in...' : 'Sign in to Admin Panel'}</button>
          <a href="/" className="block text-center text-sm text-gray-500 hover:text-gray-900">Return to customer app</a>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#faf7f0] text-[#44352c]">
      <aside className="bg-[#fffdf8] border-b border-[#eadfcd]">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3 md:px-8">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 shrink-0 rounded-lg border border-[#e7d4b8] bg-[#f6ecdc] text-[#805638] grid place-items-center"><ShieldCheck className="w-5 h-5" /></div>
            <div className="min-w-0"><p className="text-sm font-bold text-[#49382b]">IvoryStock</p><p className="text-[11px] text-[#817264]">Inventory & Accounts · Admin Backend</p></div>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-md border border-[#eadfcd] bg-white px-2.5 py-1.5 text-[#675548]"><Users className="w-3.5 h-3.5" /> Customers: {metrics?.totalUsers ?? users.length}</span>
            <span className="hidden lg:inline-flex items-center gap-1.5 rounded-md border border-[#eadfcd] bg-white px-2.5 py-1.5 text-[#675548]"><ShieldCheck className="w-3.5 h-3.5" /> Employees: {admins.length}</span>
            {canManageOwners && <button onClick={sheetConnection.connected ? syncSheet : () => setSheetDialogOpen(true)} disabled={busy} className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 font-semibold disabled:opacity-50 ${sheetConnection.lastSyncError ? 'border-[#eac9be] bg-[#fbefeb] text-[#9c4b3a]' : 'border-[#eadfcd] bg-white text-[#675548] hover:bg-[#f8f2e9]'}`}><RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />{sheetConnection.lastSyncError ? 'Sync issue' : sheetConnection.connected ? 'Sync Sheet' : 'Connect Sheet'}</button>}
            <button onClick={() => logout()} title="Sign out" className="p-2 rounded-md text-[#80664f] hover:bg-[#f5eee3]"><LogOut className="w-4 h-4" /></button>
          </div>
        </div>
      </aside>

      <main className="min-w-0">
        <header className="bg-[#faf7f0] border-b border-[#eadfcd] px-4 py-4">
          <div className="mx-auto flex w-full max-w-7xl flex-col justify-between gap-3 px-4 sm:flex-row sm:items-center md:px-8">
            <div className="flex items-center gap-3"><span className="grid w-10 h-10 place-items-center rounded-lg border border-[#ead9bf] bg-[#f7eddf] text-[#815b3e]"><Users className="w-5 h-5" /></span><div><p className="text-[11px] uppercase tracking-wide text-[#94785c]">Admin Hub</p><h2 className="text-base font-bold text-[#49382b]">{selectedUser ? 'User details' : section === 'dashboard' || section === 'users' ? 'Inventory App Backend Portal' : section === 'roles' ? 'Roles & Permissions' : section === 'admins' ? 'Administrators' : 'Activity Logs'}</h2><p className="text-[11px] text-[#817264]">Manage customer accounts, access roles, and connected app information</p></div></div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="sr-only" htmlFor="admin-view-select">Admin view</label><select id="admin-view-select" value={section} onChange={(event) => { setSection(event.target.value as typeof section); setSelectedUser(null); }} className="h-9 rounded-md border border-[#e5d7c3] bg-white px-3 text-xs text-[#634c39]"><option value="dashboard">Customers</option><option value="admins">Administrators</option><option value="roles">Roles & Permissions</option><option value="audit">Activity Logs</option></select>
              <button onClick={refresh} disabled={busy} title="Refresh Firebase user data" className="grid h-9 w-9 place-items-center rounded-md border border-[#e5d7c3] bg-white text-[#634c39] hover:bg-[#f8f2e9] disabled:opacity-50"><RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} /></button>
              {canManageOwners && <button onClick={() => setSheetDialogOpen(true)} className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-[#b9d5ef] bg-[#edf6ff] text-xs font-semibold text-[#345b80] hover:bg-[#e2f0ff]"><FileSpreadsheet className="w-3.5 h-3.5" />{sheetConnection.connected ? 'Sheet connected' : 'Connect Google Sheet'}</button>}
              {canCreateCustomers && <button onClick={() => setCustomerModalOpen(true)} className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-[#805638] text-xs font-semibold text-white hover:bg-[#6f492f]"><UserPlus className="w-3.5 h-3.5" />Add User</button>}
            </div>
          </div>
        </header>
        <div className="mx-auto w-full max-w-7xl p-4 md:px-8 md:py-6">
          {selectedUser ? (
            <div className="space-y-3">{canEditUsers && <div className="flex justify-end"><button onClick={() => { setCustomerEditTarget(selectedUser); setCustomerEditForm({ name: selectedUser.name, email: selectedUser.email, phone: selectedUser.phone, businessName: selectedUser.businessName }); }} className="inline-flex items-center gap-2 rounded-md border border-[#e5d7c3] bg-white px-3 py-2 text-xs font-semibold text-[#634c39] hover:bg-[#f8f2e9]"><Pencil className="h-3.5 w-3.5" />Edit profile</button></div>}<UserDetails user={selectedUser} data={userData || {}} onBack={() => setSelectedUser(null)} /></div>
          ) : section === 'dashboard' ? (
            <AdminDashboard metrics={metrics} users={users} adminsCount={admins.length} sheetConnection={sheetConnection} canCreateCustomers={canCreateCustomers} canEditUsers={canEditUsers} canSuspendUsers={canSuspendUsers} canDeleteUsers={canDeleteUsers} search={search} onSearch={setSearch} onSearchSubmit={refresh} statusFilter={statusFilter} onStatusFilter={setStatusFilter} onOpenUser={openUser} onEditUser={(customer) => { setCustomerEditTarget(customer); setCustomerEditForm({ name: customer.name, email: customer.email, phone: customer.phone, businessName: customer.businessName }); }} onStatus={changeStatus} onDeleteUser={deleteUserAccount} onAddUser={canCreateCustomers ? () => setCustomerModalOpen(true) : undefined} />
          ) : section === 'users' ? (
            <AdminUsersTable users={users} search={search} onSearch={setSearch} onSearchSubmit={refresh} statusFilter={statusFilter} onStatusFilter={setStatusFilter} canEditUsers={canEditUsers} canSuspendUsers={canSuspendUsers} canDeleteUsers={canDeleteUsers} sheetConnection={sheetConnection} onOpenUser={openUser} onEditUser={(customer) => { setCustomerEditTarget(customer); setCustomerEditForm({ name: customer.name, email: customer.email, phone: customer.phone, businessName: customer.businessName }); }} onStatus={changeStatus} onDeleteUser={deleteUserAccount} />
          ) : section === 'roles' ? (
            <section className="space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div><h3 className="font-bold text-[#49382b]">Roles & Permissions</h3><p className="text-xs text-[#887a6c] mt-1">Role changes are recorded in the audit log.</p></div>
                {canCreateRoles && <button onClick={() => setRoleModalOpen(true)} className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-[#805638] text-xs font-semibold text-white hover:bg-[#6f492f]"><Plus className="w-3.5 h-3.5" />Create role</button>}
              </div>
              {!canCreateRoles && <p className="text-xs text-[#887a6c]">Your administrator role does not include permission to create roles.</p>}
              <AdminRecords title="Defined roles" records={roles} columns={['id', 'name', 'description', 'permissions']} />
            </section>
          ) : section === 'admins' ? (
            <div className="space-y-5"><section className="rounded-xl border border-[#eadfcd] bg-[#fffdf8] p-5"><h2 className="font-bold text-[#49382b]">Create administrator</h2><p className="mt-1 text-xs text-[#817264]">Employee and administrator accounts are managed separately from customers.</p>{canCreateAdmins ? <form onSubmit={createAdmin} className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3"><input required placeholder="Full name" value={adminForm.name} onChange={(event) => setAdminForm({ ...adminForm, name: event.target.value })} className="rounded-md border border-[#e5d7c3] px-3 py-2 text-sm" /><input required type="email" placeholder="Admin email" value={adminForm.email} onChange={(event) => setAdminForm({ ...adminForm, email: event.target.value })} className="rounded-md border border-[#e5d7c3] px-3 py-2 text-sm" /><input placeholder="Phone" value={adminForm.phone} onChange={(event) => setAdminForm({ ...adminForm, phone: event.target.value })} className="rounded-md border border-[#e5d7c3] px-3 py-2 text-sm" /><input required minLength={12} type="password" placeholder="Temporary password (12+ chars)" value={adminForm.password} onChange={(event) => setAdminForm({ ...adminForm, password: event.target.value })} className="rounded-md border border-[#e5d7c3] px-3 py-2 text-sm" /><div className="flex gap-2"><select value={adminForm.roleId} onChange={(event) => setAdminForm({ ...adminForm, roleId: event.target.value })} className="min-w-0 flex-1 rounded-md border border-[#e5d7c3] px-3 py-2 text-sm">{canManageOwners && <option value="OWNER">OWNER</option>}<option value="MANAGER">MANAGER</option><option value="STAFF">STAFF</option>{roles.filter((role) => !['OWNER', 'MANAGER', 'STAFF'].includes(role.id)).map((role) => <option key={role.id} value={role.id}>{role.name || role.id}</option>)}</select><button disabled={busy} className="rounded-md bg-[#805638] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Create</button></div></form> : <p className="mt-4 text-xs text-[#817264]">Only an Owner can create employee accounts.</p>}</section><AdminMembersTable members={admins} roles={roles} canManageOwners={canManageOwners} canCreateAdmins={canCreateAdmins} currentAdminUid={user?.uid || ''} onAssign={(member) => { setRoleTarget(member); setAssignRoleId(member.roleId || 'STAFF'); }} onEdit={(member) => { setEditTarget(member); setEditForm({ name: member.name, email: member.email, phone: member.phone || '' }); }} onRemove={removeAdmin} /></div>
          ) : (
            <AdminRecords title="Activity Logs" records={auditEntries} columns={['action', 'adminEmail', 'target', 'description', 'createdAt']} />
          )}
        </div>
      </main>
      {roleTarget && <AssignRoleDialog user={roleTarget} roles={roles} roleId={assignRoleId} canAssignOwner={canManageOwners} onRoleChange={setAssignRoleId} onClose={() => setRoleTarget(null)} onSubmit={assignRole} busy={busy} />}
      {roleModalOpen && <CreateRoleDialog role={roleForm} setRole={setRoleForm} onClose={() => setRoleModalOpen(false)} onSubmit={createRole} busy={busy} />}
      {customerModalOpen && <CreateCustomerDialog customer={customerForm} setCustomer={setCustomerForm} onClose={() => setCustomerModalOpen(false)} onSubmit={createCustomer} busy={busy} />}
      {editTarget && <EditEmployeeDialog employee={editTarget} profile={editForm} setProfile={setEditForm} onClose={() => setEditTarget(null)} onSubmit={editAdmin} busy={busy} />}
      {sheetDialogOpen && <GoogleOAuthSheetDialog connection={sheetConnection} spreadsheetInput={spreadsheetInput} setSpreadsheetInput={setSpreadsheetInput} onClose={() => setSheetDialogOpen(false)} onConnect={connectSheet} onSync={syncSheet} onDisconnect={disconnectSheet} busy={busy} />}
      {customerEditTarget && <EditCustomerDialog customer={customerEditTarget} profile={customerEditForm} setProfile={setCustomerEditForm} onClose={() => setCustomerEditTarget(null)} onSubmit={editCustomer} busy={busy} />}
    </div>
  );
};

interface AdminDashboardProps {
  metrics: AdminMetrics | null;
  users: AdminUser[];
  adminsCount: number;
  sheetConnection: SheetConnection;
  canCreateCustomers: boolean;
  canEditUsers: boolean;
  canSuspendUsers: boolean;
  canDeleteUsers: boolean;
  search: string;
  onSearch: (value: string) => void;
  onSearchSubmit: () => void;
  statusFilter: 'all' | 'active' | 'suspended';
  onStatusFilter: (value: 'all' | 'active' | 'suspended') => void;
  onOpenUser: (user: AdminUser) => void;
  onEditUser: (user: AdminUser) => void;
  onStatus: (user: AdminUser, action: 'activate' | 'suspend') => void;
  onDeleteUser: (user: AdminUser) => void;
  onAddUser?: () => void;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ metrics, users, adminsCount, sheetConnection, canCreateCustomers, canEditUsers, canSuspendUsers, canDeleteUsers, search, onSearch, onSearchSubmit, statusFilter, onStatusFilter, onOpenUser, onEditUser, onStatus, onDeleteUser, onAddUser }) => {
  const cards = [
    { label: 'Customer accounts', value: metrics?.totalUsers ?? users.length, icon: <Users className="w-4 h-4" /> },
    { label: 'Active customers', value: metrics?.activeUsers ?? 0, icon: <UserCheck className="w-4 h-4" /> },
    { label: 'New customers today', value: metrics?.newUsersToday ?? 0, icon: <UserPlus className="w-4 h-4" /> },
    { label: 'Owners & employees', value: adminsCount, icon: <Building2 className="w-4 h-4" /> },
  ];
  return (
    <div className="space-y-3">
      <section className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {cards.map((card) => (
          <div key={card.label} className="min-h-[92px] rounded-xl border border-[#eadfcd] bg-[#fffdf8] p-3.5">
            <div className="flex items-center justify-between gap-2 text-[#917659]"><p className="text-[11px] leading-4">{card.label}</p><span className="grid w-7 h-7 place-items-center rounded-md border border-[#efdfc9] bg-[#faf4ea]">{card.icon}</span></div>
            <p className="mt-2 text-2xl font-bold leading-none text-[#49382b]">{card.value}</p>
          </div>
        ))}
      </section>

      <AdminUsersTable users={users} search={search} onSearch={onSearch} onSearchSubmit={onSearchSubmit} statusFilter={statusFilter} onStatusFilter={onStatusFilter} canEditUsers={canEditUsers} canSuspendUsers={canSuspendUsers} canDeleteUsers={canDeleteUsers} sheetConnection={sheetConnection} onOpenUser={onOpenUser} onEditUser={onEditUser} onStatus={onStatus} onDeleteUser={onDeleteUser} onAddUser={onAddUser} />
    </div>
  );
};

const AdminUsersTable: React.FC<{
  users: AdminUser[];
  search: string;
  onSearch: (value: string) => void;
  onSearchSubmit: () => void;
  statusFilter: 'all' | 'active' | 'suspended';
  onStatusFilter: (value: 'all' | 'active' | 'suspended') => void;
  canEditUsers: boolean;
  canSuspendUsers: boolean;
  canDeleteUsers: boolean;
  sheetConnection: SheetConnection;
  onOpenUser: (user: AdminUser) => void;
  onEditUser: (user: AdminUser) => void;
  onStatus: (user: AdminUser, action: 'suspend' | 'activate') => void;
  onDeleteUser: (user: AdminUser) => void;
  onAddUser?: () => void;
}> = ({ users, search, onSearch, onSearchSubmit, statusFilter, onStatusFilter, canEditUsers, canSuspendUsers, canDeleteUsers, sheetConnection, onOpenUser, onEditUser, onStatus, onDeleteUser, onAddUser }) => {
  const normalizedSearch = search.trim().toLowerCase();
  const visibleUsers = users.filter((adminUser) => {
    const matchesStatus = statusFilter === 'all' || adminUser.status === statusFilter;
    const matchesSearch = !normalizedSearch || [adminUser.uid, adminUser.name, adminUser.email, adminUser.phone, adminUser.businessName].some((value) => value.toLowerCase().includes(normalizedSearch));
    return matchesStatus && matchesSearch;
  });

  return (
    <section className="space-y-3">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 rounded-xl border border-[#eadfcd] bg-[#fffdf8] p-3">
        <div className="inline-flex max-w-full overflow-x-auto rounded-md border border-[#e8dcc9] bg-[#fbf7ef] p-1">
          {([['all', `All Users (${users.length})`], ['active', `Active (${users.filter((item) => item.status === 'active').length})`], ['suspended', `Suspended (${users.filter((item) => item.status === 'suspended').length})`]] as const).map(([value, label]) => <button key={value} onClick={() => onStatusFilter(value)} className={`shrink-0 rounded px-3 py-1.5 text-[11px] font-semibold ${statusFilter === value ? 'bg-white text-[#5a402d] shadow-sm' : 'text-[#817264] hover:text-[#49382b]'}`}>{label}</button>)}
        </div>
        <form onSubmit={(event) => { event.preventDefault(); onSearchSubmit(); }} className="flex min-w-0 flex-1 gap-2">
          <div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#a58d72]" /><input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Search by name, email, ID, or business..." className="h-9 w-full rounded-md border border-[#e5d7c3] bg-white pl-9 pr-3 text-xs text-[#49382b] placeholder:text-[#a49584] focus:border-[#9c7654] focus:outline-none" /></div>
          <button className="h-9 rounded-md border border-[#e5d7c3] bg-white px-3 text-xs font-semibold text-[#634c39] hover:bg-[#f8f2e9]">Search</button>
        </form>
        <div className="flex gap-2">
          <span className="hidden sm:inline-flex h-9 items-center rounded-md border border-[#e5d7c3] bg-white px-3 text-xs text-[#634c39]">Customer</span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[#eadfcd] bg-[#fffdf8]">
        <table className="w-full min-w-[800px] text-left text-xs">
          <thead className="bg-[#f8f1e5] text-[10px] uppercase tracking-wide text-[#80674f]"><tr><th className="px-4 py-3">User account & ID</th><th className="px-3 py-3">Role & access</th><th className="px-3 py-3">Connected app info</th><th className="px-3 py-3">Status</th><th className="px-4 py-3 text-right">Admin actions</th></tr></thead>
          <tbody>
            {visibleUsers.map((adminUser) => (
              <tr key={adminUser.uid} className="border-t border-[#f0e8dc] hover:bg-[#fcf8f1]">
                <td className="px-4 py-3"><button onClick={() => onOpenUser(adminUser)} className="text-left"><strong className="block text-[#49382b]">{adminUser.name || 'Unnamed user'}</strong><span className="block text-[#796c60]">{adminUser.email}</span><span className="mt-0.5 block max-w-48 truncate font-mono text-[10px] text-[#a18f7b]">{adminUser.uid}</span></button></td>
                <td className="px-3 py-3"><span className="font-semibold text-[#5d4735]">Customer</span></td>
                <td className="px-3 py-3 text-[#75685c]">{adminUser.businessName || 'No business profile'}<span className="mt-1 block text-[10px]">{adminUser.counts.products || 0} products · {adminUser.counts.orders || 0} orders</span></td>
                <td className="px-3 py-3"><span className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-[10px] ${adminUser.status === 'suspended' ? 'border-[#eac9be] bg-[#fbefeb] text-[#9c4b3a]' : 'border-[#d8e4d0] bg-[#f1f6ed] text-[#54714d]'}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{adminUser.status}</span></td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <button onClick={() => onOpenUser(adminUser)} title="View customer profile" className="rounded p-2 text-[#8a7157] hover:bg-[#f3eadc]"><Eye className="w-4 h-4" /></button>
                    {canEditUsers && <button onClick={() => onEditUser(adminUser)} title="Edit customer profile" className="rounded p-2 text-[#8a7157] hover:bg-[#f3eadc]"><Pencil className="w-4 h-4" /></button>}
                    {canSuspendUsers && <button onClick={() => onStatus(adminUser, adminUser.status === 'suspended' ? 'activate' : 'suspend')} title={adminUser.status === 'suspended' ? 'Activate customer' : 'Suspend customer'} className="rounded p-2 text-[#8a7157] hover:bg-[#f3eadc]">{adminUser.status === 'suspended' ? <UserCheck className="w-4 h-4" /> : <UserX className="w-4 h-4" />}</button>}
                    {canDeleteUsers && <button onClick={() => onDeleteUser(adminUser)} title="Permanently delete customer account and business data" className="rounded p-2 text-[#9c4b3a] hover:bg-[#fbefeb]"><Trash2 className="w-4 h-4" /></button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visibleUsers.length === 0 && <div className="flex min-h-48 flex-col items-center justify-center gap-2 p-8 text-center text-sm text-[#887a6c]"><span className="grid h-10 w-10 place-items-center rounded-lg border border-[#ead9bf] bg-[#f7eddf] text-[#815b3e]"><Users className="h-5 w-5" /></span><strong className="text-[#49382b]">No user accounts in backend</strong><span className="max-w-sm text-xs">Customer accounts will appear here after they register.</span>{onAddUser && <button onClick={onAddUser} className="mt-1 inline-flex items-center gap-2 rounded-md bg-[#805638] px-3 py-2 text-xs font-semibold text-white hover:bg-[#6f492f]"><UserPlus className="h-3.5 w-3.5" />Add First User (Owner)</button>}</div>}
      </div>
      <div className="flex flex-col gap-1 px-3 text-[10px] text-[#897966] sm:flex-row sm:items-center sm:justify-between"><span>Showing {visibleUsers.length} of {users.length} registered accounts.</span><span>{sheetConnection.connected ? `Google Sheets auto-sync · Last updated ${sheetConnection.lastSyncedAt ? formatDate(sheetConnection.lastSyncedAt) : 'pending'}` : 'Firebase is the source of truth · Google Sheets is not connected'}</span></div>
    </section>
  );
};

type RoleFormValues = { id: string; name: string; description: string; permissions: string[] };

const CreateRoleDialog: React.FC<{
  role: RoleFormValues;
  setRole: React.Dispatch<React.SetStateAction<RoleFormValues>>;
  onClose: () => void;
  onSubmit: (event: React.FormEvent) => void;
  busy: boolean;
}> = ({ role, setRole, onClose, onSubmit, busy }) => {
  const permissions = ['users.view', 'users.edit', 'users.suspend', 'user_data.view', 'admins.view', 'admins.create', 'roles.view', 'roles.create', 'reports.view', 'audit.view'];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#35271f]/40 p-4" role="presentation">
      <section role="dialog" aria-modal="true" aria-labelledby="create-role-title" className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl border border-[#eadfcd] bg-[#fffdf8] p-5 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-4"><div><h2 id="create-role-title" className="font-bold text-[#49382b]">Create role</h2><p className="mt-1 text-xs text-[#817264]">Choose the permissions this role receives.</p></div><button onClick={onClose} aria-label="Close" className="rounded p-1 text-[#897966] hover:bg-[#f5eee3]"><X className="w-4 h-4" /></button></div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold text-[#665343]">Role ID<input required value={role.id} onChange={(event) => setRole((current) => ({ ...current, id: event.target.value }))} placeholder="SUPPORT_AGENT" className="mt-1 block w-full rounded-md border border-[#e5d7c3] bg-white px-3 py-2 text-sm font-normal" /></label><label className="text-xs font-semibold text-[#665343]">Display name<input required value={role.name} onChange={(event) => setRole((current) => ({ ...current, name: event.target.value }))} placeholder="Support Agent" className="mt-1 block w-full rounded-md border border-[#e5d7c3] bg-white px-3 py-2 text-sm font-normal" /></label></div>
          <label className="block text-xs font-semibold text-[#665343]">Description<textarea value={role.description} onChange={(event) => setRole((current) => ({ ...current, description: event.target.value }))} rows={2} className="mt-1 block w-full rounded-md border border-[#e5d7c3] bg-white px-3 py-2 text-sm font-normal" /></label>
          <fieldset><legend className="mb-2 text-xs font-semibold text-[#665343]">Permissions</legend><div className="grid gap-2 sm:grid-cols-2">{permissions.map((permission) => <label key={permission} className="flex items-center gap-2 rounded-md border border-[#eee4d5] bg-white px-2.5 py-2 text-xs text-[#5d4a39]"><input type="checkbox" checked={role.permissions.includes(permission)} onChange={() => setRole((current) => ({ ...current, permissions: current.permissions.includes(permission) ? current.permissions.filter((item) => item !== permission) : [...current.permissions, permission] }))} className="accent-[#805638]" />{permission}</label>)}</div></fieldset>
          <div className="flex justify-end gap-2 border-t border-[#eee4d5] pt-4"><button type="button" onClick={onClose} className="rounded-md border border-[#e5d7c3] px-3 py-2 text-xs font-semibold text-[#634c39]">Cancel</button><button disabled={busy} className="rounded-md bg-[#805638] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{busy ? 'Saving...' : 'Create role'}</button></div>
        </form>
      </section>
    </div>
  );
};

const AssignRoleDialog: React.FC<{
  user: AdminMember;
  roles: any[];
  roleId: string;
  canAssignOwner: boolean;
  onRoleChange: (roleId: string) => void;
  onClose: () => void;
  onSubmit: (event: React.FormEvent) => void;
  busy: boolean;
}> = ({ user, roles, roleId, canAssignOwner, onRoleChange, onClose, onSubmit, busy }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#35271f]/40 p-4" role="presentation">
    <section role="dialog" aria-modal="true" aria-labelledby="assign-role-title" className="w-full max-w-md rounded-xl border border-[#eadfcd] bg-[#fffdf8] p-5 shadow-xl">
      <div className="mb-4 flex items-start justify-between gap-4"><div><h2 id="assign-role-title" className="font-bold text-[#49382b]">Assign employee role</h2><p className="mt-1 text-xs text-[#817264]">{user.name || user.email}</p></div><button onClick={onClose} aria-label="Close" className="rounded p-1 text-[#897966] hover:bg-[#f5eee3]"><X className="w-4 h-4" /></button></div>
      <form onSubmit={onSubmit} className="space-y-4"><label className="block text-xs font-semibold text-[#665343]">Role<select value={roleId} onChange={(event) => onRoleChange(event.target.value)} className="mt-1 block w-full rounded-md border border-[#e5d7c3] bg-white px-3 py-2 text-sm">{canAssignOwner && <><option value="OWNER">Owner</option><option value="MANAGER">Manager</option>{roles.filter((role) => role.id !== 'OWNER' && !['MANAGER', 'STAFF'].includes(role.id)).map((role) => <option key={role.id} value={role.id}>{role.name || role.id}</option>)}</>}<option value="STAFF">Staff</option></select></label><div className="flex justify-end gap-2 border-t border-[#eee4d5] pt-4"><button type="button" onClick={onClose} className="rounded-md border border-[#e5d7c3] px-3 py-2 text-xs font-semibold text-[#634c39]">Cancel</button><button disabled={busy} className="rounded-md bg-[#805638] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{busy ? 'Saving...' : 'Assign role'}</button></div></form>
    </section>
  </div>
);

const EditEmployeeDialog: React.FC<{
  employee: AdminMember;
  profile: { name: string; email: string; phone: string };
  setProfile: React.Dispatch<React.SetStateAction<{ name: string; email: string; phone: string }>>;
  onClose: () => void;
  onSubmit: (event: React.FormEvent) => void;
  busy: boolean;
}> = ({ employee, profile, setProfile, onClose, onSubmit, busy }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#35271f]/40 p-4" role="presentation">
    <section role="dialog" aria-modal="true" aria-labelledby="edit-employee-title" className="w-full max-w-lg rounded-xl border border-[#eadfcd] bg-[#fffdf8] p-5 shadow-xl">
      <div className="mb-4 flex items-start justify-between gap-4"><div><h2 id="edit-employee-title" className="font-bold text-[#49382b]">Edit employee profile</h2><p className="mt-1 text-xs text-[#817264]">{employee.roleId} · {employee.uid}</p></div><button onClick={onClose} aria-label="Close" className="rounded p-1 text-[#897966] hover:bg-[#f5eee3]"><X className="w-4 h-4" /></button></div>
      <form onSubmit={onSubmit} className="space-y-3"><label className="block text-xs font-semibold text-[#665343]">Name<input required value={profile.name} onChange={(event) => setProfile((current) => ({ ...current, name: event.target.value }))} className="mt-1 block w-full rounded-md border border-[#e5d7c3] bg-white px-3 py-2 text-sm font-normal" /></label><label className="block text-xs font-semibold text-[#665343]">Email<input required type="email" value={profile.email} onChange={(event) => setProfile((current) => ({ ...current, email: event.target.value }))} className="mt-1 block w-full rounded-md border border-[#e5d7c3] bg-white px-3 py-2 text-sm font-normal" /></label><label className="block text-xs font-semibold text-[#665343]">Phone<input value={profile.phone} onChange={(event) => setProfile((current) => ({ ...current, phone: event.target.value }))} className="mt-1 block w-full rounded-md border border-[#e5d7c3] bg-white px-3 py-2 text-sm font-normal" /></label><div className="flex justify-end gap-2 border-t border-[#eee4d5] pt-4"><button type="button" onClick={onClose} className="rounded-md border border-[#e5d7c3] px-3 py-2 text-xs font-semibold text-[#634c39]">Cancel</button><button disabled={busy} className="rounded-md bg-[#805638] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{busy ? 'Saving...' : 'Save profile'}</button></div></form>
    </section>
  </div>
);

const AdminMembersTable: React.FC<{
  members: AdminMember[];
  roles: any[];
  canManageOwners: boolean;
  canCreateAdmins: boolean;
  currentAdminUid: string;
  onAssign: (member: AdminMember) => void;
  onEdit: (member: AdminMember) => void;
  onRemove: (member: AdminMember, permanentlyDelete?: boolean) => void;
}> = ({ members, roles, canManageOwners, canCreateAdmins, currentAdminUid, onAssign, onEdit, onRemove }) => (
  <section className="overflow-hidden rounded-xl border border-[#eadfcd] bg-[#fffdf8]">
    <div className="border-b border-[#eee4d5] px-4 py-3"><h2 className="text-sm font-bold text-[#49382b]">Owners & employees</h2><p className="mt-1 text-xs text-[#817264]">{members.length} administrator accounts · separate from customers</p></div>
    <div className="overflow-x-auto">
      <table className="w-full min-w-[700px] text-left text-xs">
        <thead className="bg-[#f8f1e5] text-[10px] uppercase tracking-wide text-[#80674f]"><tr><th className="px-4 py-3">Account</th><th className="px-3 py-3">Access role</th><th className="px-3 py-3">Status</th><th className="px-4 py-3 text-right">Actions</th></tr></thead>
        <tbody>{members.map((member) => (
          <tr key={member.uid} className="border-t border-[#f0e8dc]">
            <td className="px-4 py-3"><strong className="block text-[#49382b]">{member.name || member.email}</strong><span className="text-[#817264]">{member.email}</span><span className="mt-1 block text-[10px] text-[#93816d]">{member.phone || 'No phone'}</span></td>
            <td className="px-3 py-3"><span className="rounded border border-[#eadfcd] bg-[#faf4ea] px-2 py-1 text-[10px] font-semibold text-[#705841]">{roles.find((role) => role.id === member.roleId)?.name || member.roleId}</span></td>
            <td className="px-3 py-3 text-[#75685c]">{member.status}</td>
            <td className="px-4 py-3 text-right">
              {canCreateAdmins && <button onClick={() => onAssign(member)} title="Change employee role" className="rounded p-2 text-[#8a7157] hover:bg-[#f3eadc]"><ShieldCheck className="w-4 h-4" /></button>}
              {canManageOwners && <button onClick={() => onEdit(member)} title="Edit employee profile" className="rounded p-2 text-[#8a7157] hover:bg-[#f3eadc]"><Eye className="w-4 h-4" /></button>}
              {canManageOwners && member.uid !== currentAdminUid && <>
                <button onClick={() => onRemove(member)} title="Remove employee access" className="rounded p-2 text-[#9c4b3a] hover:bg-[#fbefeb]"><UserX className="w-4 h-4" /></button>
                {member.roleId !== 'OWNER' && <button onClick={() => onRemove(member, true)} title="Permanently delete employee and business data" className="rounded p-2 text-[#9c4b3a] hover:bg-[#fbefeb]"><Trash2 className="w-4 h-4" /></button>}
              </>}
            </td>
          </tr>
        ))}</tbody>
      </table>
    </div>
    {members.length === 0 && <p className="p-6 text-center text-xs text-[#887a6c]">No administrators have been created.</p>}
  </section>
);

const CreateCustomerDialog: React.FC<{
  customer: { name: string; email: string; phone: string; password: string };
  setCustomer: React.Dispatch<React.SetStateAction<{ name: string; email: string; phone: string; password: string }>>;
  onClose: () => void;
  onSubmit: (event: React.FormEvent) => void;
  busy: boolean;
}> = ({ customer, setCustomer, onClose, onSubmit, busy }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#35271f]/40 p-4" role="presentation">
    <section role="dialog" aria-modal="true" aria-labelledby="create-customer-title" className="w-full max-w-lg rounded-xl border border-[#eadfcd] bg-[#fffdf8] p-5 shadow-xl">
      <div className="mb-4 flex items-start justify-between gap-4"><div><h2 id="create-customer-title" className="font-bold text-[#49382b]">Add customer account</h2><p className="mt-1 text-xs text-[#817264]">This creates a customer login, not an employee account.</p></div><button onClick={onClose} aria-label="Close" className="rounded p-1 text-[#897966] hover:bg-[#f5eee3]"><X className="w-4 h-4" /></button></div>
      <form onSubmit={onSubmit} className="space-y-3"><label className="block text-xs font-semibold text-[#665343]">Customer name<input required value={customer.name} onChange={(event) => setCustomer((current) => ({ ...current, name: event.target.value }))} className="mt-1 block w-full rounded-md border border-[#e5d7c3] bg-white px-3 py-2 text-sm font-normal" /></label><label className="block text-xs font-semibold text-[#665343]">Email<input required type="email" value={customer.email} onChange={(event) => setCustomer((current) => ({ ...current, email: event.target.value }))} className="mt-1 block w-full rounded-md border border-[#e5d7c3] bg-white px-3 py-2 text-sm font-normal" /></label><label className="block text-xs font-semibold text-[#665343]">Phone<input value={customer.phone} onChange={(event) => setCustomer((current) => ({ ...current, phone: event.target.value }))} className="mt-1 block w-full rounded-md border border-[#e5d7c3] bg-white px-3 py-2 text-sm font-normal" /></label><label className="block text-xs font-semibold text-[#665343]">Temporary password<input required minLength={12} type="password" value={customer.password} onChange={(event) => setCustomer((current) => ({ ...current, password: event.target.value }))} className="mt-1 block w-full rounded-md border border-[#e5d7c3] bg-white px-3 py-2 text-sm font-normal" /><span className="mt-1 block font-normal text-[#817264]">Use at least 12 characters and share it with the customer securely.</span></label><div className="flex justify-end gap-2 border-t border-[#eee4d5] pt-4"><button type="button" onClick={onClose} className="rounded-md border border-[#e5d7c3] px-3 py-2 text-xs font-semibold text-[#634c39]">Cancel</button><button disabled={busy} className="rounded-md bg-[#805638] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{busy ? 'Creating...' : 'Create customer'}</button></div></form>
    </section>
  </div>
);

const EditCustomerDialog: React.FC<{
  customer: AdminUser;
  profile: { name: string; email: string; phone: string; businessName: string };
  setProfile: React.Dispatch<React.SetStateAction<{ name: string; email: string; phone: string; businessName: string }>>;
  onClose: () => void;
  onSubmit: (event: React.FormEvent) => void;
  busy: boolean;
}> = ({ customer, profile, setProfile, onClose, onSubmit, busy }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#35271f]/40 p-4" role="presentation">
    <section role="dialog" aria-modal="true" aria-labelledby="edit-customer-title" className="w-full max-w-lg rounded-xl border border-[#eadfcd] bg-[#fffdf8] p-5 shadow-xl">
      <div className="mb-4 flex items-start justify-between gap-4"><div><h2 id="edit-customer-title" className="font-bold text-[#49382b]">Edit customer profile</h2><p className="mt-1 text-xs text-[#817264]">{customer.uid}</p></div><button onClick={onClose} aria-label="Close" className="rounded p-1 text-[#897966] hover:bg-[#f5eee3]"><X className="h-4 w-4" /></button></div>
      <form onSubmit={onSubmit} className="space-y-3"><label className="block text-xs font-semibold text-[#665343]">Name<input required value={profile.name} onChange={(event) => setProfile((current) => ({ ...current, name: event.target.value }))} className="mt-1 block w-full rounded-md border border-[#e5d7c3] bg-white px-3 py-2 text-sm font-normal" /></label><label className="block text-xs font-semibold text-[#665343]">Email<input required type="email" value={profile.email} onChange={(event) => setProfile((current) => ({ ...current, email: event.target.value }))} className="mt-1 block w-full rounded-md border border-[#e5d7c3] bg-white px-3 py-2 text-sm font-normal" /></label><label className="block text-xs font-semibold text-[#665343]">Phone<input value={profile.phone} onChange={(event) => setProfile((current) => ({ ...current, phone: event.target.value }))} className="mt-1 block w-full rounded-md border border-[#e5d7c3] bg-white px-3 py-2 text-sm font-normal" /></label><label className="block text-xs font-semibold text-[#665343]">Business name<input value={profile.businessName} onChange={(event) => setProfile((current) => ({ ...current, businessName: event.target.value }))} className="mt-1 block w-full rounded-md border border-[#e5d7c3] bg-white px-3 py-2 text-sm font-normal" /></label><div className="flex justify-end gap-2 border-t border-[#eee4d5] pt-4"><button type="button" onClick={onClose} className="rounded-md border border-[#e5d7c3] px-3 py-2 text-xs font-semibold text-[#634c39]">Cancel</button><button disabled={busy} className="rounded-md bg-[#805638] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{busy ? 'Saving...' : 'Save profile'}</button></div></form>
    </section>
  </div>
);

const LegacyServiceAccountSheetDialog: React.FC<{
  connection: any;
  spreadsheetInput: string;
  setSpreadsheetInput: (value: string) => void;
  onClose: () => void;
  onConnect: (event: React.FormEvent) => void;
  onSync: () => void;
  onDisconnect: () => void;
  busy: boolean;
}> = ({ connection, spreadsheetInput, setSpreadsheetInput, onClose, onConnect, onSync, onDisconnect, busy }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#35271f]/40 p-4" role="presentation">
    <section role="dialog" aria-modal="true" aria-labelledby="sheet-dialog-title" className="w-full max-w-lg rounded-xl border border-[#eadfcd] bg-[#fffdf8] p-5 shadow-xl">
      <div className="mb-4 flex items-start justify-between gap-4"><div className="flex items-center gap-2"><span className="grid h-9 w-9 place-items-center rounded-md border border-[#b9d5ef] bg-[#edf6ff] text-[#345b80]"><FileSpreadsheet className="h-4 w-4" /></span><div><h2 id="sheet-dialog-title" className="font-bold text-[#49382b]">Google Sheets user directory</h2><p className="mt-1 text-xs text-[#817264]">Firebase remains the source of truth.</p></div></div><button onClick={onClose} aria-label="Close" className="rounded p-1 text-[#897966] hover:bg-[#f5eee3]"><X className="h-4 w-4" /></button></div>
      {connection.connected ? <div className="space-y-4"><div className="rounded-md border border-[#d8e4d0] bg-[#f1f6ed] p-3 text-xs text-[#54714d]"><strong className="block">Connected · {connection.spreadsheetTitle || 'Google Sheet'}</strong><span className="mt-1 block">Tab: {connection.sheetName || 'Users'} · Last sync: {connection.lastSyncedAt ? formatDate(connection.lastSyncedAt) : 'Not yet synced'}</span></div>{connection.lastSyncError && <p className="rounded-md border border-[#eac9be] bg-[#fbefeb] p-3 text-xs text-[#9c4b3a]">Last sync issue: {connection.lastSyncError}</p>}<div className="flex flex-wrap justify-between gap-2"><a href={`https://docs.google.com/spreadsheets/d/${connection.spreadsheetId}/edit`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-md border border-[#e5d7c3] bg-white px-3 py-2 text-xs font-semibold text-[#634c39]"><ExternalLink className="h-3.5 w-3.5" />Open sheet</a><div className="flex gap-2"><button onClick={onDisconnect} disabled={busy} className="rounded-md border border-[#eac9be] bg-white px-3 py-2 text-xs font-semibold text-[#9c4b3a]">Disconnect</button><button onClick={onSync} disabled={busy} className="inline-flex items-center gap-2 rounded-md bg-[#805638] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />Sync now</button></div></div></div> : <form onSubmit={onConnect} className="space-y-3"><label className="block text-xs font-semibold text-[#665343]">Spreadsheet URL or ID<input required value={spreadsheetInput} onChange={(event) => setSpreadsheetInput(event.target.value)} placeholder="https://docs.google.com/spreadsheets/d/..." className="mt-1 block w-full rounded-md border border-[#e5d7c3] bg-white px-3 py-2 text-sm font-normal" /></label>{connection.credentialsConfigured ? <div className="rounded-md border border-[#eee4d5] bg-[#faf7f0] p-3 text-xs text-[#665343]">Share the sheet with <strong className="select-all">{connection.serviceAccountEmail}</strong> as an Editor.</div> : <p className="rounded-md border border-[#eac9be] bg-[#fbefeb] p-3 text-xs text-[#9c4b3a]">Google Sheets sync isn’t configured on the server. Add GOOGLE_SHEETS_PROJECT_ID, GOOGLE_SHEETS_CLIENT_EMAIL, and GOOGLE_SHEETS_PRIVATE_KEY, then restart the app.</p>}<p className="text-[11px] leading-4 text-[#817264]">Only the user directory is copied: account ID, name, email, phone, role, status, dates, and business name. Orders, products, transactions, and inventory stay in Firebase.</p><div className="flex justify-end gap-2 border-t border-[#eee4d5] pt-4"><button type="button" onClick={onClose} className="rounded-md border border-[#e5d7c3] px-3 py-2 text-xs font-semibold text-[#634c39]">Cancel</button><button disabled={busy || !connection.credentialsConfigured} className="rounded-md bg-[#805638] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{busy ? 'Connecting...' : 'Connect and sync'}</button></div></form>}
    </section>
  </div>
);

const Dashboard: React.FC<{ metrics: AdminMetrics | null; users: AdminUser[]; onOpenUser: (user: AdminUser) => void }> = ({ metrics, users, onOpenUser }) => {
  const cards = metrics ? [
    ['Registered users', metrics.totalUsers], ['Active users', metrics.activeUsers], ['Suspended users', metrics.suspendedUsers], ['New today', metrics.newUsersToday], ['New this week', metrics.newUsersThisWeek], ['Products across users', metrics.totalProducts], ['Orders across users', metrics.totalOrders],
  ] : [];
  return <div className="space-y-6"><div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{cards.map(([label, value]) => <div key={label} className="bg-white rounded-xl border p-4"><p className="text-xs text-gray-500">{label}</p><p className="text-2xl font-bold mt-1">{value}</p></div>)}</div><section className="bg-white rounded-xl border"><div className="p-4 border-b"><h3 className="font-bold">Recent registrations</h3></div>{users.slice(0, 8).map((user) => <button key={user.uid} onClick={() => onOpenUser(user)} className="w-full text-left p-4 border-b last:border-0 hover:bg-gray-50 flex justify-between"><span><strong>{user.name || user.email}</strong><span className="block text-xs text-gray-500">{user.businessName || 'No business profile'}</span></span><span className="text-xs text-gray-500">{formatDate(user.createdAt)}</span></button>)}</section></div>;
};

const UsersTable: React.FC<{ users: AdminUser[]; search: string; onSearch: (value: string) => void; onOpenUser: (user: AdminUser) => void; onStatus: (user: AdminUser, action: 'suspend' | 'activate') => void }> = ({ users, search, onSearch, onOpenUser, onStatus }) => <div className="space-y-4"><div className="relative max-w-xl"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" /><input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Search name, email, phone, user ID, or business" className="w-full pl-9 pr-3 py-2.5 bg-white border rounded-lg text-sm" /></div><div className="bg-white border rounded-xl overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-gray-50 text-gray-500"><tr><th className="p-3">User</th><th className="p-3">Business</th><th className="p-3">Status</th><th className="p-3">Role</th><th className="p-3">Usage</th><th className="p-3 text-right">Actions</th></tr></thead><tbody>{users.map((user) => <tr key={user.uid} className="border-t"><td className="p-3"><strong>{user.name || 'Unnamed user'}</strong><span className="block text-xs text-gray-500">{user.email}</span><span className="block text-[10px] font-mono text-gray-400">{user.uid}</span></td><td className="p-3">{user.businessName || '—'}</td><td className="p-3"><span className={`px-2 py-1 rounded-full text-xs ${user.status === 'suspended' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>{user.status}</span></td><td className="p-3">{user.role}</td><td className="p-3 text-xs text-gray-500">{user.counts.products || 0} products · {user.counts.orders || 0} orders · {user.counts.customers || 0} customers</td><td className="p-3 text-right"><div className="inline-flex gap-1"><button onClick={() => onOpenUser(user)} title="View user" className="p-2 hover:bg-gray-100 rounded"><Eye className="w-4 h-4" /></button>{user.status === 'suspended' ? <button onClick={() => onStatus(user, 'activate')} title="Activate user" className="p-2 text-green-700 hover:bg-green-50 rounded"><UserCheck className="w-4 h-4" /></button> : <button onClick={() => onStatus(user, 'suspend')} title="Suspend user" className="p-2 text-red-700 hover:bg-red-50 rounded"><UserX className="w-4 h-4" /></button>}</div></td></tr>)}</tbody></table></div></div>;

const UserDetails: React.FC<{ user: AdminUser; data: Record<string, unknown[]>; onBack: () => void }> = ({ user, data, onBack }) => <div className="space-y-5"><button onClick={onBack} className="text-sm text-gray-500 hover:text-gray-900">← Back to users</button><section className="bg-white border rounded-xl p-5"><div className="flex flex-wrap justify-between gap-4"><div><h1 className="text-xl font-bold">{user.name || 'Unnamed user'}</h1><p className="text-sm text-gray-500">{user.email} · {user.uid}</p></div><span className="px-3 py-1 h-fit rounded-full bg-gray-100 text-sm">{user.role} · {user.status}</span></div><div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5 text-sm"><div><span className="text-gray-500">Business</span><strong className="block">{user.businessName || '—'}</strong></div><div><span className="text-gray-500">Created</span><strong className="block">{formatDate(user.createdAt)}</strong></div><div><span className="text-gray-500">Last login</span><strong className="block">{formatDate(user.lastLogin)}</strong></div><div><span className="text-gray-500">Phone</span><strong className="block">{user.phone || '—'}</strong></div></div></section><div className="grid grid-cols-2 md:grid-cols-4 gap-3">{Object.entries(user.counts).map(([key, value]) => <div key={key} className="bg-white border rounded-xl p-4"><span className="text-xs text-gray-500 capitalize">{key}</span><strong className="block text-xl">{value}</strong></div>)}</div><section className="bg-white border rounded-xl p-5"><h2 className="font-bold mb-4">Business data</h2><div className="space-y-5">{Object.entries(data).map(([key, rows]) => <ReadableRecords key={key} title={key} records={rows} />)}</div></section></div>;

const ReadableRecords: React.FC<{ title: string; records: unknown[] }> = ({ title, records }) => (
  <div className="border rounded-lg overflow-hidden">
    <div className="p-3 bg-gray-50 border-b flex justify-between"><strong className="capitalize">{title}</strong><span className="text-xs text-gray-500">{records.length} records shown</span></div>
    {records.length === 0 ? <p className="p-3 text-sm text-gray-500">No records.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-xs"><tbody>{records.slice(0, 10).map((record, index) => <tr key={index} className="border-b last:border-0 align-top"><td className="p-3 font-mono text-gray-400">{index + 1}</td><td className="p-3"><div className="grid grid-cols-1 md:grid-cols-3 gap-x-4 gap-y-2">{Object.entries((record && typeof record === 'object' ? record : { value: record }) as Record<string, unknown>).slice(0, 9).map(([field, value]) => <div key={field}><span className="block text-[10px] uppercase tracking-wide text-gray-400">{field.replace(/[A-Z]/g, (letter) => ` ${letter}`).trim()}</span><span className="block text-gray-800 break-words">{typeof value === 'object' ? JSON.stringify(value) : String(value ?? '—')}</span></div>)}</div></td></tr>)}</tbody></table></div>}
  </div>
);

const AdminRecords: React.FC<{ title: string; records: any[]; columns: string[] }> = ({ title, records, columns }) => (
  <section className="bg-white border rounded-xl overflow-x-auto">
    <div className="p-4 border-b"><h2 className="font-bold">{title}</h2><p className="text-xs text-gray-500 mt-1">{records.length} records</p></div>
    <table className="w-full text-left text-sm"><thead className="bg-gray-50 text-gray-500"><tr>{columns.map((column) => <th key={column} className="p-3 capitalize">{column}</th>)}</tr></thead><tbody>{records.map((record, index) => <tr key={record.id || record.uid || index} className="border-t">{columns.map((column) => <td key={column} className="p-3 max-w-xs truncate">{Array.isArray(record[column]) ? record[column].join(', ') : String(record[column] ?? '—')}</td>)}</tr>)}</tbody></table>
  </section>
);
