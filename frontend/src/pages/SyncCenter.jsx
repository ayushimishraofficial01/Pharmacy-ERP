import { useEffect, useState } from 'react';
import { offlineSync as offlineSyncApi } from '../api/endpoints';
import { Card, Table, Button, ErrorBanner, StatCard } from '../components/ui';
import { subscribe, syncNow } from '../offline/syncEngine';

const STATUS_BADGE = {
  ONLINE: 'bg-green-100 text-green-700',
  OFFLINE: 'bg-slate-200 text-slate-700',
  SYNCING: 'bg-blue-100 text-blue-700',
  SYNC_COMPLETE: 'bg-green-100 text-green-700',
  SYNC_FAILED: 'bg-red-100 text-red-700',
  CONFLICTS_FOUND: 'bg-amber-100 text-amber-700',
};

export default function SyncCenter() {
  const [engineState, setEngineState] = useState(null);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');
  const [resolving, setResolving] = useState(null);

  function reload() {
    offlineSyncApi
      .status()
      .then(setStatus)
      .catch((err) => setError(err.response?.data?.message || 'Failed to load sync status'));
  }

  useEffect(() => {
    const unsub = subscribe(setEngineState);
    reload();
    return unsub;
  }, []);

  async function handleSyncNow() {
    setError('');
    const result = await syncNow();
    if (result.error) setError(result.error);
    reload();
  }

  async function handleRetry(id) {
    try {
      await offlineSyncApi.retry(id);
      reload();
    } catch (err) {
      setError(err.response?.data?.message || 'Retry failed');
    }
  }

  async function handleResolveConflict(id, resolution) {
    setResolving(id);
    try {
      await offlineSyncApi.resolveConflict(id, { resolution, notes: `Resolved via Sync Center: ${resolution}` });
      reload();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not resolve conflict');
    } finally {
      setResolving(null);
    }
  }

  const counts = status?.counts || { pending: 0, syncing: 0, synced: 0, failed: 0, conflicts: 0 };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Sync Center</h1>
        <div className="flex items-center gap-3">
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_BADGE[engineState?.connection] || 'bg-slate-100 text-slate-600'}`}>{(engineState?.connection || 'ONLINE').replace('_', ' ')}</span>
          <Button onClick={handleSyncNow}>Sync Now</Button>
        </div>
      </div>
      <ErrorBanner message={error} />

      <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-5">
        <StatCard label="Pending" value={counts.pending} />
        <StatCard label="Syncing" value={counts.syncing} />
        <StatCard label="Synced" value={counts.synced} />
        <StatCard label="Failed" value={counts.failed} />
        <StatCard label="Conflicts" value={counts.conflicts} />
      </div>

      {status?.lastSuccessfulSync && <div className="mb-4 text-xs text-slate-500">Last successful sync: {new Date(status.lastSuccessfulSync).toLocaleString()}</div>}

      {counts.conflicts > 0 && (
        <Card title="Stock Conflicts — need admin resolution" className="mb-4">
          <Table
            columns={[
              { key: 'localTransactionId', label: 'Offline Bill' },
              { key: 'medicine', label: 'Medicine', render: (r) => r.conflict?.medicine?.name || '—' },
              { key: 'batch', label: 'Batch', render: (r) => r.conflict?.batch?.batchNumber || '—' },
              { key: 'offlineQty', label: 'Sold Offline', render: (r) => r.conflict?.offlineSaleQuantity },
              { key: 'serverStock', label: 'Server Stock at Sync', render: (r) => r.conflict?.serverStockAtSync },
              {
                key: 'actions',
                label: 'Resolve',
                render: (r) => (
                  <div className="flex gap-2">
                    <Button variant="secondary" disabled={resolving === r._id} onClick={() => handleResolveConflict(r._id, 'REJECT_ITEM')}>
                      Reject
                    </Button>
                    <Button variant="secondary" disabled={resolving === r._id} onClick={() => handleResolveConflict(r._id, 'FORCE_APPLY')}>
                      Force Apply
                    </Button>
                  </div>
                ),
              },
            ]}
            rows={status.conflicts}
            rowKey="_id"
          />
        </Card>
      )}

      <Card title="Recent Offline Transactions">
        <Table
          columns={[
            { key: 'localTransactionId', label: 'Offline Bill' },
            { key: 'deviceId', label: 'Device', render: (r) => r.deviceId?.slice(0, 14) },
            { key: 'status', label: 'Status', render: (r) => <span className={`rounded px-2 py-0.5 text-xs ${STATUS_BADGE[r.status] || 'bg-slate-100'}`}>{r.status}</span> },
            { key: 'attempts', label: 'Attempts' },
            { key: 'lastError', label: 'Error', render: (r) => r.lastError || '—' },
            {
              key: 'actions',
              label: '',
              render: (r) => (r.status === 'FAILED' ? <Button variant="secondary" onClick={() => handleRetry(r._id)}>Retry</Button> : null),
            },
          ]}
          rows={status?.recent || []}
          rowKey="_id"
        />
      </Card>
    </div>
  );
}
