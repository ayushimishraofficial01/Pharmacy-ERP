import { useEffect, useState } from 'react';
import { dayClose } from '../api/endpoints';
import { inr } from '../api/client';
import { Card, Table, Button, ErrorBanner } from '../components/ui';

export default function DayClose() {
  const [history, setHistory] = useState([]);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [preview, setPreview] = useState(null);
  const [actualCash, setActualCash] = useState('');
  const [varianceExplanation, setVarianceExplanation] = useState('');
  const [error, setError] = useState('');

  function reload() {
    dayClose.list().then(setHistory).catch(() => {});
  }
  useEffect(reload, []);

  async function loadPreview() {
    setError('');
    try {
      const data = await dayClose.preview(date);
      setPreview(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load preview');
    }
  }

  const expected = preview
    ? preview.openingCash + preview.cashSales - preview.cashExpenses - preview.cashPurchases - preview.cashRefunds
    : 0;
  const variance = actualCash !== '' ? Number(actualCash) - expected : 0;

  async function handleClose() {
    setError('');
    try {
      await dayClose.close({ ...preview, closingDate: date, actualCash: Number(actualCash), varianceExplanation });
      setPreview(null);
      setActualCash('');
      setVarianceExplanation('');
      reload();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to close day');
    }
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Day Close</h1>
      <ErrorBanner message={error} />

      <Card title="Close a day" className="mb-4">
        <div className="mb-3 flex items-center gap-2">
          <input type="date" className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" value={date} onChange={(e) => setDate(e.target.value)} />
          <Button variant="secondary" onClick={loadPreview}>
            Load Preview
          </Button>
        </div>

        {preview && (
          <div>
            <div className="mb-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              <div>Opening: {inr(preview.openingCash)}</div>
              <div>Cash Sales: {inr(preview.cashSales)}</div>
              <div>Expenses: {inr(preview.cashExpenses)}</div>
              <div>Purchases: {inr(preview.cashPurchases)}</div>
              <div className="col-span-2 font-medium">Expected Cash: {inr(expected)}</div>
            </div>
            <label className="mb-1 block text-sm font-medium text-slate-600">Actual cash counted</label>
            <input type="number" className="mb-2 w-48 rounded-md border border-slate-300 px-2 py-1.5 text-sm" value={actualCash} onChange={(e) => setActualCash(e.target.value)} />
            {actualCash !== '' && Math.abs(variance) >= 200 && (
              <div className="mb-2">
                <label className="mb-1 block text-sm font-medium text-red-600">Variance {inr(variance)} — explanation required</label>
                <input className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" value={varianceExplanation} onChange={(e) => setVarianceExplanation(e.target.value)} />
              </div>
            )}
            <Button onClick={handleClose} disabled={actualCash === ''}>
              Close Day
            </Button>
          </div>
        )}
      </Card>

      <Card title="History">
        <Table
          columns={[
            { key: 'closingDate', label: 'Date', render: (r) => new Date(r.closingDate).toLocaleDateString() },
            { key: 'expectedCash', label: 'Expected', render: (r) => inr(r.expectedCash) },
            { key: 'actualCash', label: 'Actual', render: (r) => inr(r.actualCash) },
            { key: 'difference', label: 'Variance', render: (r) => inr(r.difference) },
          ]}
          rows={history}
        />
      </Card>
    </div>
  );
}
