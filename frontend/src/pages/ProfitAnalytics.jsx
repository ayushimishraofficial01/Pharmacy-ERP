import { useState } from 'react';
import { profitAnalytics } from '../api/endpoints';
import { inr } from '../api/client';
import { Card, StatCard, Button, ErrorBanner } from '../components/ui';

function currentMonthRange() {
  const now = new Date();
  return { from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) };
}

export default function ProfitAnalytics() {
  const [range, setRange] = useState(currentMonthRange());
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  async function load() {
    setError('');
    try {
      setData(await profitAnalytics.get(range));
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load profit analytics');
    }
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Profit Analytics</h1>
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
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <StatCard label="Net Sales" value={inr(data.netSales)} />
          <StatCard label="COGS" value={inr(data.cogs)} />
          <StatCard label="Gross Profit" value={inr(data.grossProfit)} sub={`${data.grossMargin}% margin`} />
          <StatCard label="Expenses" value={inr(data.totalExpenses)} />
          <StatCard label="Net Profit" value={inr(data.netProfit)} />
          <StatCard label="Sales Count" value={data.salesCount} sub={data.itemsMissingCostData > 0 ? `${data.itemsMissingCostData} items missing cost data` : undefined} />
        </div>
      )}
    </div>
  );
}
