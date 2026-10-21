import { useEffect, useState } from 'react';
import { stockMovement } from '../api/endpoints';
import { inr } from '../api/client';
import { Card, Table, ErrorBanner } from '../components/ui';

export default function StockMovement() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    stockMovement
      .report(90)
      .then(setData)
      .catch((err) => setError(err.response?.data?.message || 'Failed to load stock movement report'));
  }, []);

  const columns = [
    { key: 'medicine', label: 'Medicine', render: (r) => r.medicine.name },
    { key: 'currentStock', label: 'Current Stock' },
    { key: 'salesVelocity', label: 'Units/day' },
    { key: 'stockValue', label: 'Stock Value', render: (r) => inr(r.stockValue) },
    { key: 'lastSaleDate', label: 'Last Sale', render: (r) => (r.lastSaleDate ? new Date(r.lastSaleDate).toLocaleDateString() : 'Never') },
    { key: 'suggestedAction', label: 'Suggested Action' },
  ];

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Slow / Dead / Fast Moving Stock</h1>
      <ErrorBanner message={error} />
      {data && (
        <>
          <Card title="Dead Stock (no sales in 90 days)" className="mb-4">
            <Table columns={columns} rows={data.deadStock} rowKey={(r) => r.medicine._id} emptyMessage="No dead stock." />
          </Card>
          <Card title="Slow Moving" className="mb-4">
            <Table columns={columns} rows={data.slowMoving} rowKey={(r) => r.medicine._id} emptyMessage="Nothing slow moving." />
          </Card>
          <Card title="Fast Moving">
            <Table columns={columns} rows={data.fastMoving} rowKey={(r) => r.medicine._id} emptyMessage="Nothing classified as fast moving yet." />
          </Card>
        </>
      )}
    </div>
  );
}
