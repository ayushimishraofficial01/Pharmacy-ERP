import { useEffect, useState } from 'react';
import { alerts as alertsApi } from '../api/endpoints';
import { Card, Table, Button, ErrorBanner } from '../components/ui';

export default function Alerts() {
  const [list, setList] = useState([]);
  const [error, setError] = useState('');

  function reload() {
    alertsApi
      .list()
      .then(setList)
      .catch((err) => setError(err.response?.data?.message || 'Failed to load alerts'));
  }
  useEffect(reload, []);

  async function runChecks() {
    setError('');
    try {
      await alertsApi.run();
      reload();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to run alert checks');
    }
  }

  async function markRead(id) {
    await alertsApi.markRead(id);
    reload();
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Alerts</h1>
        <Button onClick={runChecks}>Run Checks Now</Button>
      </div>
      <ErrorBanner message={error} />
      <Card>
        <Table
          columns={[
            { key: 'type', label: 'Type' },
            { key: 'message', label: 'Message' },
            { key: 'createdAt', label: 'When', render: (r) => new Date(r.createdAt).toLocaleString() },
            {
              key: 'actions',
              label: '',
              render: (r) =>
                !r.isRead && (
                  <Button variant="secondary" onClick={() => markRead(r._id)}>
                    Mark read
                  </Button>
                ),
            },
          ]}
          rows={list}
          emptyMessage="No alerts. Try 'Run Checks Now'."
        />
      </Card>
    </div>
  );
}
