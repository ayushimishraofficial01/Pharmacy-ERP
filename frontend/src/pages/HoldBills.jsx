import { useEffect, useState } from 'react';
import { holdBills } from '../api/endpoints';
import { Card, Table, Button, ErrorBanner } from '../components/ui';

export default function HoldBills() {
  const [list, setList] = useState([]);
  const [error, setError] = useState('');

  function reload() {
    holdBills
      .list()
      .then(setList)
      .catch((err) => setError(err.response?.data?.message || 'Failed to load held bills'));
  }
  useEffect(reload, []);

  async function remove(id) {
    setError('');
    try {
      await holdBills.remove(id);
      reload();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to remove held bill');
    }
  }

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold">Held Bills</h1>
      <p className="mb-4 text-sm text-slate-500">Held bills never touch stock — they're a saved cart, resumed from the POS screen (Sales page).</p>
      <ErrorBanner message={error} />
      <Card>
        <Table
          columns={[
            { key: 'holdLabel', label: 'Label', render: (r) => r.holdLabel || '(unlabeled)' },
            { key: 'walkInCustomerName', label: 'Customer', render: (r) => r.walkInCustomerName || '—' },
            { key: 'items', label: 'Items', render: (r) => r.items?.length || 0 },
            { key: 'createdAt', label: 'Held Since', render: (r) => new Date(r.createdAt).toLocaleString() },
            {
              key: 'actions',
              label: '',
              render: (r) => (
                <Button variant="secondary" onClick={() => remove(r._id)}>
                  Discard
                </Button>
              ),
            },
          ]}
          rows={list}
          emptyMessage="No held bills. Hold a cart from the Sales/POS page to see it here."
        />
      </Card>
    </div>
  );
}
