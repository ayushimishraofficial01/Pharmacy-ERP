import { useEffect, useState } from 'react';
import { salesReturns, sales as salesApi } from '../api/endpoints';
import { inr } from '../api/client';
import { Card, Table, Button, ErrorBanner } from '../components/ui';

const DISPOSITIONS = ['RESTOCK', 'DAMAGED', 'EXPIRED', 'NON_RESTOCKABLE'];

export default function SalesReturns() {
  const [list, setList] = useState([]);
  const [saleOptions, setSaleOptions] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [selectedSale, setSelectedSale] = useState(null);
  const [lines, setLines] = useState({});
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  function reload() {
    salesReturns
      .list()
      .then(setList)
      .catch((err) => setError(err.response?.data?.message || 'Failed to load sales returns'));
  }
  useEffect(() => {
    reload();
    salesApi.list().then(setSaleOptions).catch(() => {});
  }, []);

  async function selectSale(id) {
    if (!id) return setSelectedSale(null);
    const data = await salesApi.get(id);
    setSelectedSale(data);
    setLines({});
  }

  function updateLine(itemId, patch) {
    setLines((l) => ({ ...l, [itemId]: { ...l[itemId], ...patch } }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const items = Object.entries(lines)
      .filter(([, v]) => Number(v.returnQuantity) > 0)
      .map(([saleItem, v]) => ({ saleItem, returnQuantity: Number(v.returnQuantity), disposition: v.disposition || 'RESTOCK' }));
    if (items.length === 0) return setError('Enter a return quantity for at least one item');
    try {
      await salesReturns.create({ sale: selectedSale._id, items, reason });
      setShowForm(false);
      setSelectedSale(null);
      setLines({});
      setReason('');
      reload();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to record sales return');
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Sales Returns</h1>
        <Button onClick={() => setShowForm((v) => !v)}>{showForm ? 'Cancel' : '+ New Return'}</Button>
      </div>
      <ErrorBanner message={error} />

      {showForm && (
        <Card title="New Sales Return" className="mb-4">
          <div className="mb-3">
            <label className="mb-1 block text-xs font-medium text-slate-500">Original Sale</label>
            <select className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" onChange={(e) => selectSale(e.target.value)} defaultValue="">
              <option value="">Select…</option>
              {saleOptions.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.invoiceNumber} ({inr(s.grandTotal)})
                </option>
              ))}
            </select>
          </div>

          {selectedSale && (
            <form onSubmit={handleSubmit}>
              {selectedSale.items.map((it) => (
                <div key={it._id} className="mb-2 flex items-center gap-3 text-sm">
                  <span className="flex-1">
                    {it.medicineNameSnapshot} — batch {it.batchNumberSnapshot} (sold {it.quantity}, already returned {it.returnedQuantity})
                  </span>
                  <input
                    type="number"
                    min="0"
                    max={it.quantity - it.returnedQuantity}
                    className="w-20 rounded-md border border-slate-300 px-2 py-1 text-sm"
                    value={lines[it._id]?.returnQuantity || ''}
                    onChange={(e) => updateLine(it._id, { returnQuantity: e.target.value })}
                  />
                  <select className="rounded-md border border-slate-300 px-2 py-1 text-sm" value={lines[it._id]?.disposition || 'RESTOCK'} onChange={(e) => updateLine(it._id, { disposition: e.target.value })}>
                    {DISPOSITIONS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
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
            { key: 'originalInvoiceNumber', label: 'Original Invoice' },
            { key: 'totalRefundAmount', label: 'Refund', render: (r) => inr(r.totalRefundAmount) },
          ]}
          rows={list}
        />
      </Card>
    </div>
  );
}
