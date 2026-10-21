import { useState } from 'react';
import { businessAnalytics, aiInsights } from '../api/endpoints';
import { inr } from '../api/client';
import { Card, StatCard, Button, ErrorBanner } from '../components/ui';

function currentMonthRange() {
  const now = new Date();
  return { from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) };
}

export default function BusinessAnalytics() {
  const [range, setRange] = useState(currentMonthRange());
  const [kpis, setKpis] = useState(null);
  const [insight, setInsight] = useState(null);
  const [error, setError] = useState('');

  async function load() {
    setError('');
    try {
      const data = await businessAnalytics.dashboard(range);
      setKpis(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load analytics');
    }
  }

  async function loadInsight() {
    setError('');
    try {
      const data = await aiInsights.get(range);
      setInsight(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load AI insight');
    }
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Business Analytics</h1>
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
          <Button variant="secondary" onClick={loadInsight}>
            AI Insight (optional)
          </Button>
        </div>
      </Card>

      {kpis && (
        <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="Revenue" value={inr(kpis.revenue)} />
          <StatCard label="Gross Profit" value={inr(kpis.grossProfit)} sub={`${kpis.grossMargin}%`} />
          <StatCard label="Net Profit" value={inr(kpis.netProfit)} />
          <StatCard label="Bills" value={kpis.numberOfBills} />
          <StatCard label="Inventory Value" value={inr(kpis.inventoryValue)} />
          <StatCard label="Turnover" value={`${kpis.inventoryTurnover}x`} />
          <StatCard label="Outstanding" value={inr(kpis.outstanding)} />
          <StatCard label="Expenses" value={inr(kpis.expenses)} />
        </div>
      )}

      {insight && (
        <Card title={insight.label || 'AI Business Insight'}>
          {insight.enabled === false ? <p className="text-sm text-slate-500">{insight.message}</p> : <p className="whitespace-pre-wrap text-sm">{insight.insight}</p>}
        </Card>
      )}
    </div>
  );
}
