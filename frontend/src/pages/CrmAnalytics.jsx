import { useEffect, useState } from 'react';
import { crmAnalytics } from '../api/endpoints';
import { inr } from '../api/client';
import { Card, StatCard, Table, ErrorBanner } from '../components/ui';

export default function CrmAnalytics() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    crmAnalytics
      .segments()
      .then(setData)
      .catch((err) => setError(err.response?.data?.message || 'Failed to load CRM analytics'));
  }, []);

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">CRM Analytics</h1>
      <ErrorBanner message={error} />

      {data && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-5">
            {Object.entries(data.segmentCounts).map(([segment, count]) => (
              <StatCard key={segment} label={segment.replace('_', ' ')} value={count} />
            ))}
          </div>
          <Card>
            <Table
              columns={[
                { key: 'customer', label: 'Customer', render: (r) => r.customer.name },
                { key: 'segment', label: 'Segment' },
                { key: 'totalSpend', label: 'Total Spend', render: (r) => inr(r.totalSpend) },
                { key: 'purchaseFrequency', label: 'Purchases' },
                { key: 'averageBillValue', label: 'Avg Bill', render: (r) => inr(r.averageBillValue) },
                { key: 'outstanding', label: 'Outstanding', render: (r) => inr(r.outstanding) },
                { key: 'lastPurchase', label: 'Last Purchase', render: (r) => (r.lastPurchase ? new Date(r.lastPurchase).toLocaleDateString() : '—') },
              ]}
              rows={data.customers}
              rowKey={(r) => r.customer._id}
            />
          </Card>
        </>
      )}
    </div>
  );
}
