import { useEffect, useState } from 'react';
import { businessAnalytics } from '../api/endpoints';
import { inr } from '../api/client';
import { StatCard, ErrorBanner } from '../components/ui';

function currentMonthRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const to = now.toISOString().slice(0, 10);
  return { from, to };
}

export default function Dashboard() {
  const [range] = useState(currentMonthRange());
  const [kpis, setKpis] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    businessAnalytics
      .dashboard(range)
      .then(setKpis)
      .catch((err) => setError(err.response?.data?.message || 'Failed to load dashboard'));
  }, [range]);

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold">Dashboard</h1>
      <p className="mb-4 text-sm text-slate-500">
        {range.from} to {range.to}
      </p>
      <ErrorBanner message={error} />
      {!kpis && !error && <div className="text-sm text-slate-400">Loading…</div>}
      {kpis && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <StatCard label="Revenue" value={inr(kpis.revenue)} />
          <StatCard label="Gross Profit" value={inr(kpis.grossProfit)} sub={`${kpis.grossMargin}% margin`} />
          <StatCard label="Net Profit" value={inr(kpis.netProfit)} />
          <StatCard label="Bills" value={kpis.numberOfBills} sub={`Avg ${inr(kpis.averageBillValue)}`} />
          <StatCard label="Inventory Value" value={inr(kpis.inventoryValue)} sub={`Turnover ${kpis.inventoryTurnover}x`} />
          <StatCard label="Outstanding" value={inr(kpis.outstanding)} />
          <StatCard label="Expenses" value={inr(kpis.expenses)} />
        </div>
      )}
    </div>
  );
}
