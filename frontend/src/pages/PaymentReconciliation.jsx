import { useState } from 'react';
import { paymentReconciliation } from '../api/endpoints';
import { inr } from '../api/client';
import { Card, StatCard, Table, Button, ErrorBanner } from '../components/ui';

function currentMonthRange() {
  const now = new Date();
  return { from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) };
}

export default function PaymentReconciliation() {
  const [range, setRange] = useState(currentMonthRange());
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  async function load() {
    setError('');
    try {
      setData(await paymentReconciliation.get(range));
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load reconciliation');
    }
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Payment Reconciliation</h1>
      <ErrorBanner message={error} />

      <Card className="mb-4">
        <div className="flex items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">From</label>
            <input type="date" className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">To</label>
            <input type="date" className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
          </div>
          <Button onClick={load}>Load</Button>
        </div>
      </Card>

      {data && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label="Sales" value={data.salesCount} />
            <StatCard label="Expected Total" value={inr(data.expectedTotal)} />
            <StatCard label="Actual Collected" value={inr(data.actualTotal)} />
            <StatCard label="Outstanding" value={inr(data.totalOutstanding)} />
          </div>
          {data.hasDiscrepancies && <ErrorBanner message="Discrepancies found — see flagged rows below." />}
          <Card title="By payment method">
            <Table
              columns={[
                { key: 'method', label: 'Method' },
                { key: 'expected', label: 'Expected', render: (r) => inr(r.expected) },
                { key: 'actual', label: 'Actual', render: (r) => inr(r.actual) },
                { key: 'discrepancy', label: 'Discrepancy', render: (r) => <span className={r.flagged ? 'font-semibold text-red-600' : ''}>{inr(r.discrepancy)}</span> },
              ]}
              rows={data.byMethod}
              rowKey="method"
            />
          </Card>
        </>
      )}
    </div>
  );
}
