import React from 'react';
import { ExternalLink, FileSpreadsheet, LogIn, RefreshCw, X } from 'lucide-react';

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

interface GoogleSheetDialogProps {
  connection: SheetConnection;
  spreadsheetInput: string;
  setSpreadsheetInput: (value: string) => void;
  onClose: () => void;
  onConnect: (event: React.FormEvent) => void;
  onSync: () => void;
  onDisconnect: () => void;
  busy: boolean;
}

export const GoogleSheetDialog: React.FC<GoogleSheetDialogProps> = ({
  connection,
  spreadsheetInput,
  setSpreadsheetInput,
  onClose,
  onConnect,
  onSync,
  onDisconnect,
  busy,
}) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#35271f]/40 p-4" role="presentation">
    <section role="dialog" aria-modal="true" aria-labelledby="sheet-dialog-title" className="w-full max-w-lg rounded-xl border border-[#eadfcd] bg-[#fffdf8] p-5 shadow-xl">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-md border border-[#b9d5ef] bg-[#edf6ff] text-[#345b80]"><FileSpreadsheet className="h-4 w-4" /></span>
          <div><h2 id="sheet-dialog-title" className="font-bold text-[#49382b]">Google Sheets user directory</h2><p className="mt-1 text-xs text-[#817264]">Firebase remains the source of truth.</p></div>
        </div>
        <button onClick={onClose} aria-label="Close" className="rounded p-1 text-[#897966] hover:bg-[#f5eee3]"><X className="h-4 w-4" /></button>
      </div>

      {connection.connected ? (
        <div className="space-y-4">
          <div className="rounded-md border border-[#d8e4d0] bg-[#f1f6ed] p-3 text-xs text-[#54714d]">
            <strong className="block">Connected · {connection.spreadsheetTitle || 'Google Sheet'}</strong>
            <span className="mt-1 block">Google account: {connection.googleEmail || 'Connected'}</span>
            <span className="block">Tab: {connection.sheetName || 'Users'} · Last sync: {connection.lastSyncedAt || 'Not yet synced'}</span>
          </div>
          {connection.lastSyncError && <p className="rounded-md border border-[#eac9be] bg-[#fbefeb] p-3 text-xs text-[#9c4b3a]">Last sync issue: {connection.lastSyncError}</p>}
          <div className="flex flex-wrap justify-between gap-2">
            <a href={`https://docs.google.com/spreadsheets/d/${connection.spreadsheetId}/edit`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-md border border-[#e5d7c3] bg-white px-3 py-2 text-xs font-semibold text-[#634c39]"><ExternalLink className="h-3.5 w-3.5" />Open sheet</a>
            <div className="flex gap-2">
              <button onClick={onDisconnect} disabled={busy} className="rounded-md border border-[#eac9be] bg-white px-3 py-2 text-xs font-semibold text-[#9c4b3a]">Disconnect</button>
              <button onClick={onSync} disabled={busy} className="inline-flex items-center gap-2 rounded-md bg-[#805638] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />Sync now</button>
            </div>
          </div>
        </div>
      ) : (
        <form onSubmit={onConnect} className="space-y-3">
          <label className="block text-xs font-semibold text-[#665343]">Spreadsheet URL or ID
            <input required value={spreadsheetInput} onChange={(event) => setSpreadsheetInput(event.target.value)} placeholder="https://docs.google.com/spreadsheets/d/..." className="mt-1 block w-full rounded-md border border-[#e5d7c3] bg-white px-3 py-2 text-sm font-normal" />
          </label>
          {connection.oauthConfigured
            ? <p className="rounded-md border border-[#eee4d5] bg-[#faf7f0] p-3 text-xs text-[#665343]">Continue with the Google account that can edit this spreadsheet. You’ll approve access directly with Google; no service-account sharing is needed.</p>
            : <p className="rounded-md border border-[#eac9be] bg-[#fbefeb] p-3 text-xs text-[#9c4b3a]">Google sign-in is not configured. Add GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, and GOOGLE_OAUTH_REDIRECT_URI on the server, then restart.</p>}
          <p className="text-[11px] leading-4 text-[#817264]">Only the user directory is synced: account ID, name, email, phone, role, status, dates, and business name. Orders, products, transactions, and inventory stay in Firebase.</p>
          <div className="flex justify-end gap-2 border-t border-[#eee4d5] pt-4">
            <button type="button" onClick={onClose} className="rounded-md border border-[#e5d7c3] px-3 py-2 text-xs font-semibold text-[#634c39]">Cancel</button>
            <button disabled={busy || !connection.oauthConfigured} className="inline-flex items-center gap-2 rounded-md bg-[#805638] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"><LogIn className="h-3.5 w-3.5" />{busy ? 'Opening Google...' : 'Continue with Google'}</button>
          </div>
        </form>
      )}
    </section>
  </div>
);