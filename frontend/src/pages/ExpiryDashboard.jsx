import { useEffect, useState } from 'react';
import { expiry } from '../api/endpoints';
import { inr } from '../api/client';
import { Card, StatCard, Table, ErrorBanner } from '../components/ui';

export default function ExpiryDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    expiry
      .dashboard()
      .then(setData)
      .catch((err) => setError(err.response?.data?.message || 'Failed to load expiry dashboard'));
  }, []);

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Expiry Dashboard</h1>
      <ErrorBanner message={error} />

      {data && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-5">
            {data.summary.map((b) => (
              <StatCard key={b.key} label={b.label} value={b.count} sub={`${b.totalQuantity} units, ${inr(b.totalCostValue)}`} />
            ))}
          </div>

          {data.summary.map((b) => (
            <Card key={b.key} title={b.label} className="mb-4">
              <Table
                columns={[
                  { key: 'medicine', label: 'Medicine', render: (r) => r.medicine?.name || '—' },
                  { key: 'batchNumber', label: 'Batch' },
                  { key: 'expiryDate', label: 'Expiry', render: (r) => new Date(r.expiryDate).toLocaleDateString() },
                  { key: 'quantity', label: 'Qty' },
                  { key: 'costValue', label: 'Cost Value', render: (r) => inr(r.costValue) },
                ]}
                rows={data.buckets[b.key]}
                rowKey="batch"
                emptyMessage="Nothing in this window."
              />
            </Card>
          ))}
        </>
      )}
    </div>
  );
}
