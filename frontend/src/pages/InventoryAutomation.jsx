import { useEffect, useState } from 'react';
import { inventoryAutomation } from '../api/endpoints';
import { Card, Table, ErrorBanner } from '../components/ui';

export default function InventoryAutomation() {
  const [status, setStatus] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([inventoryAutomation.status(), inventoryAutomation.smartReorder()])
      .then(([s, r]) => {
        setStatus(s);
        setRecommendations(r);
      })
      .catch((err) => setError(err.response?.data?.message || 'Failed to load inventory data'));
  }, []);

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Reorder & Stock</h1>
      <ErrorBanner message={error} />

      <Card title="Smart Reorder Recommendations (review before purchasing)" className="mb-4">
        <Table
          columns={[
            { key: 'medicine', label: 'Medicine', render: (r) => r.medicine.name },
            { key: 'currentStock', label: 'Current Stock' },
            { key: 'suggestedQuantity', label: 'Suggested Qty' },
            { key: 'supplier', label: 'Supplier', render: (r) => r.supplier?.supplierName || '—' },
            { key: 'reason', label: 'Reason' },
          ]}
          rows={recommendations}
          emptyMessage="No reorder recommendations right now."
        />
      </Card>

      <Card title="Full Inventory Status">
        <Table
          columns={[
            { key: 'medicine', label: 'Medicine', render: (r) => r.medicine.name },
            { key: 'currentStock', label: 'Current' },
            { key: 'reservedStock', label: 'Reserved' },
            { key: 'availableStock', label: 'Available' },
            { key: 'belowReorderLevel', label: 'Below Reorder?', render: (r) => (r.belowReorderLevel ? 'Yes' : 'No') },
          ]}
          rows={status}
        />
      </Card>
    </div>
  );
}
