import { NavLink, Outlet } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { startOfflineSupport } from '../offline/bootstrap';
import { subscribe as subscribeSyncEngine, syncNow } from '../offline/syncEngine';

// Nav grouped roughly by merge stage, so it's obvious where a feature came
// from if something needs debugging against MERGE_NOTES.md later.
const NAV_SECTIONS = [
  {
    label: 'Overview',
    items: [{ to: '/', label: 'Dashboard' }],
  },
  {
    label: 'Pharmacy',
    items: [
      { to: '/medicines', label: 'Medicines' },
      { to: '/sales', label: 'Sales / POS' },
      { to: '/sales-returns', label: 'Sales Returns' },
      { to: '/hold-bills', label: 'Held Bills' },
      { to: '/suppliers', label: 'Suppliers' },
      { to: '/customers', label: 'Customers' },
    ],
  },
  {
    label: 'Clinic',
    items: [
      { to: '/patients', label: 'Patients' },
      { to: '/appointments', label: 'Appointments' },
      { to: '/consultations', label: 'Consultations' },
      { to: '/doctors', label: 'Doctors' },
    ],
  },
  {
    label: 'Finance',
    items: [
      { to: '/expenses', label: 'Expenses' },
      { to: '/day-close', label: 'Day Close' },
      { to: '/accounting', label: 'Accounting' },
      { to: '/gst-returns', label: 'GST Returns' },
    ],
  },
  {
    label: 'WhatsApp',
    items: [{ to: '/whatsapp-orders', label: 'Orders' }],
  },
  {
    label: 'Insights',
    items: [
      { to: '/inventory-automation', label: 'Reorder & Stock' },
      { to: '/expiry', label: 'Expiry' },
      { to: '/stock-count', label: 'Stock Count' },
      { to: '/stock-movement', label: 'Slow/Dead/Fast Stock' },
      { to: '/analytics', label: 'Business Analytics' },
      { to: '/profit-analytics', label: 'Profit Analytics' },
      { to: '/crm-analytics', label: 'CRM Analytics' },
      { to: '/payment-reconciliation', label: 'Payment Reconciliation' },
      { to: '/alerts', label: 'Alerts' },
    ],
  },
  {
    label: 'Admin',
    items: [
      { to: '/backups', label: 'Backups' },
      { to: '/sync-center', label: 'Sync Center' },
      { to: '/business-settings', label: 'Invoice Settings' },
    ],
  },
];

const CONNECTION_BADGE = {
  ONLINE: 'bg-green-100 text-green-700',
  OFFLINE: 'bg-slate-200 text-slate-700',
  SYNCING: 'bg-blue-100 text-blue-700',
  SYNC_COMPLETE: 'bg-green-100 text-green-700',
  SYNC_FAILED: 'bg-red-100 text-red-700',
  CONFLICTS_FOUND: 'bg-amber-100 text-amber-700',
};

export default function AppShell() {
  const { user, logout } = useAuth();
  const [syncState, setSyncState] = useState(null);

  useEffect(() => {
    startOfflineSupport();
    const unsub = subscribeSyncEngine(setSyncState);
    return unsub;
  }, []);

  return (
    <div className="flex h-screen bg-slate-50">
      <aside className="w-60 shrink-0 overflow-y-auto border-r border-slate-200 bg-white p-4">
        <div className="mb-6 text-lg font-semibold text-brand-700">Pharmacy ERP</div>
        {NAV_SECTIONS.map((section) => (
          <div key={section.label} className="mb-5">
            <div className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{section.label}</div>
            {section.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `block rounded-md px-2 py-1.5 text-sm ${isActive ? 'bg-brand-50 font-medium text-brand-700' : 'text-slate-600 hover:bg-slate-100'}`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        ))}
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
          <div className="text-sm text-slate-500">{user?.role?.replace('_', ' ')}</div>
          <div className="flex items-center gap-3">
            {syncState && (
              <button
                onClick={() => syncNow()}
                title={syncState.pendingCount > 0 ? `${syncState.pendingCount} bill(s) waiting to sync — click to sync now` : 'All offline bills synced'}
                className={`rounded-full px-3 py-1 text-xs font-medium ${CONNECTION_BADGE[syncState.connection] || 'bg-slate-100 text-slate-600'}`}
              >
                {syncState.connection.replace('_', ' ')}
                {syncState.pendingCount > 0 ? ` (${syncState.pendingCount})` : ''}
              </button>
            )}
            <span className="text-sm font-medium">{user?.name}</span>
            <button onClick={logout} className="rounded-md border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100">
              Log out
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
