import { useEffect, useState } from 'react';
import { purchaseReturns, purchases as purchasesApi } from '../api/endpoints';
import { inr } from '../api/client';
import { Card, Table, Button, ErrorBanner } from '../components/ui';

export default function PurchaseReturns() {
  const [list, setList] = useState([]);
  const [purchaseOptions, setPurchaseOptions] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [selectedPurchase, setSelectedPurchase] = useState(null);
  const [lines, setLines] = useState({});
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  function reload() {
    purchaseReturns
      .list()
      .then(setList)
      .catch((err) => setError(err.response?.data?.message || 'Failed to load purchase returns'));
  }
  useEffect(() => {
    reload();
    purchasesApi.list().then(setPurchaseOptions).catch(() => {});
  }, []);

  async function selectPurchase(id) {
    if (!id) return setSelectedPurchase(null);
    const data = await purchasesApi.get(id);
    setSelectedPurchase(data);
    setLines({});
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const items = Object.entries(lines)
      .filter(([, qty]) => Number(qty) > 0)
      .map(([purchaseItem, returnQuantity]) => ({ purchaseItem, returnQuantity: Number(returnQuantity) }));
    if (items.length === 0) return setError('Enter a return quantity for at least one item');
    try {
      await purchaseReturns.create({ purchase: selectedPurchase.purchase._id, items, reason });
      setShowForm(false);
      setSelectedPurchase(null);
      setLines({});
      setReason('');
      reload();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to record purchase return');
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Purchase Returns</h1>
        <Button onClick={() => setShowForm((v) => !v)}>{showForm ? 'Cancel' : '+ New Return'}</Button>
      </div>
      <ErrorBanner message={error} />

      {showForm && (
        <Card title="New Purchase Return" className="mb-4">
          <div className="mb-3">
            <label className="mb-1 block text-xs font-medium text-slate-500">Original Purchase</label>
            <select className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" onChange={(e) => selectPurchase(e.target.value)} defaultValue="">
              <option value="">Select…</option>
              {purchaseOptions.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.purchaseNumber} — {p.supplier?.supplierName} ({inr(p.grandTotal)})
                </option>
              ))}
            </select>
          </div>

          {selectedPurchase && (
            <form onSubmit={handleSubmit}>
              {selectedPurchase.items.map((it) => (
                <div key={it._id} className="mb-2 flex items-center gap-3 text-sm">
                  <span className="flex-1">
                    {it.medicineName} — batch {it.batchNumber} (purchased {it.quantity}, already returned {it.returnedQuantity})
                  </span>
                  <input
                    type="number"
                    min="0"
                    max={it.quantity - it.returnedQuantity}
                    className="w-24 rounded-md border border-slate-300 px-2 py-1 text-sm"
                    value={lines[it._id] || ''}
                    onChange={(e) => setLines((l) => ({ ...l, [it._id]: e.target.value }))}
                  />
                </div>
              ))}
              <div className="my-3">
                <label className="mb-1 block text-xs font-medium text-slate-500">Reason</label>
                <input className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" value={reason} onChange={(e) => setReason(e.target.value)} />
              </div>
              <Button type="submit">Record Return</Button>
            </form>
          )}
        </Card>
      )}

      <Card>
        <Table
          columns={[
            { key: 'returnNumber', label: 'Return #' },
            { key: 'supplier', label: 'Supplier', render: (r) => r.supplier?.supplierName || '—' },
            { key: 'grandTotal', label: 'Value', render: (r) => inr(r.grandTotal) },
            { key: 'settlementType', label: 'Settlement' },
          ]}
          rows={list}
        />
      </Card>
    </div>
  );
}
