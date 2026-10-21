import { useEffect, useState } from 'react';
import { backups as backupsApi } from '../api/endpoints';
import { Card, Table, Button, ErrorBanner } from '../components/ui';

export default function Backups() {
  const [list, setList] = useState([]);
  const [error, setError] = useState('');

  function reload() {
    backupsApi
      .list()
      .then(setList)
      .catch((err) => setError(err.response?.data?.message || 'Failed to load backups'));
  }
  useEffect(reload, []);

  async function authorizeRestore(id) {
    const notes = window.prompt('Notes for this restore authorization (optional):') || '';
    setError('');
    try {
      await backupsApi.authorizeRestore(id, notes);
      reload();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to authorize restore');
    }
  }

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold">Backups</h1>
      <p className="mb-4 text-sm text-slate-500">
        This page shows backup status/history and records restore authorization. It does not itself run backups or
        restores — your ops process (mongodump, etc.) posts records here after actually running.
      </p>
      <ErrorBanner message={error} />
      <Card>
        <Table
          columns={[
            { key: 'status', label: 'Status' },
            { key: 'startedAt', label: 'Started', render: (r) => new Date(r.startedAt).toLocaleString() },
            { key: 'sizeBytes', label: 'Size', render: (r) => (r.sizeBytes ? `${(r.sizeBytes / 1e6).toFixed(1)} MB` : '—') },
            { key: 'restoredAt', label: 'Restore', render: (r) => (r.restoredAt ? `Authorized ${new Date(r.restoredAt).toLocaleDateString()}` : '—') },
            {
              key: 'actions',
              label: '',
              render: (r) =>
                !r.restoredAt && r.status === 'SUCCESS' ? (
                  <Button variant="secondary" onClick={() => authorizeRestore(r._id)}>
                    Authorize Restore
                  </Button>
                ) : null,
            },
          ]}
          rows={list}
          emptyMessage="No backups recorded yet."
        />
      </Card>
    </div>
  );
}
