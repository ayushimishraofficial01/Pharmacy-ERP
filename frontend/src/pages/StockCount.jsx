import { useEffect, useState } from 'react';
import { stockCounts, medicines as medicinesApi, batches as batchesApi } from '../api/endpoints';
import { Card, Table, Button, ErrorBanner } from '../components/ui';

export default function StockCount() {
  const [list, setList] = useState([]);
  const [active, setActive] = useState(null);
  const [error, setError] = useState('');
  const [medicineOptions, setMedicineOptions] = useState([]);
  const [selectedMedicine, setSelectedMedicine] = useState('');
  const [batchOptions, setBatchOptions] = useState([]);
  const [pickedBatchIds, setPickedBatchIds] = useState([]);

  function reload() {
    stockCounts
      .list()
      .then(setList)
      .catch((err) => setError(err.response?.data?.message || 'Failed to load stock counts'));
  }
  useEffect(() => {
    reload();
    medicinesApi.list().then(setMedicineOptions).catch(() => {});
  }, []);

  async function loadBatchesFor(medicineId) {
    setSelectedMedicine(medicineId);
    if (!medicineId) return setBatchOptions([]);
    const b = await batchesApi.listForMedicine(medicineId);
    setBatchOptions(b);
  }

  function togglePick(batchId) {
    setPickedBatchIds((ids) => (ids.includes(batchId) ? ids.filter((i) => i !== batchId) : [...ids, batchId]));
  }

  async function createCount() {
    setError('');
    try {
      const created = await stockCounts.create({ batchIds: pickedBatchIds });
      setPickedBatchIds([]);
      setActive(created);
      reload();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create stock count');
    }
  }

  async function openCount(id) {
    const data = await stockCounts.get(id);
    setActive(data);
  }

  function updateLine(lineId, physicalQuantity) {
    setActive((a) => ({ ...a, lines: a.lines.map((l) => (l._id === lineId ? { ...l, physicalQuantity } : l)) }));
  }

  async function saveLines() {
    setError('');
    try {
      const lines = active.lines.map((l) => ({ lineId: l._id, physicalQuantity: Number(l.physicalQuantity) }));
      const updated = await stockCounts.recordLines(active._id, { lines });
      setActive(updated);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save counts');
    }
  }

  async function submit() {
    setError('');
    try {
      const updated = await stockCounts.submit(active._id);
      setActive(updated);
      reload();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to submit');
    }
  }

  async function approve() {
    setError('');
    try {
      const updated = await stockCounts.approveAndAdjust(active._id);
      setActive(updated);
      reload();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to approve — you may need ADMIN/SUPER_ADMIN role');
    }
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Stock Count / Physical Verification</h1>
      <ErrorBanner message={error} />

      {!active && (
        <Card title="Start a new count" className="mb-4">
          <div className="mb-3 flex gap-2">
            <select className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm" value={selectedMedicine} onChange={(e) => loadBatchesFor(e.target.value)}>
              <option value="">Pick a medicine to see its batches…</option>
              {medicineOptions.map((m) => (
                <option key={m._id} value={m._id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          {batchOptions.length > 0 && (
            <div className="mb-3">
              {batchOptions.map((b) => (
                <label key={b._id} className="mb-1 flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={pickedBatchIds.includes(b._id)} onChange={() => togglePick(b._id)} />
                  Batch {b.batchNumber} — system qty {b.quantity}
                </label>
              ))}
            </div>
          )}
          <Button onClick={createCount} disabled={pickedBatchIds.length === 0}>
            Create Count ({pickedBatchIds.length} batch{pickedBatchIds.length !== 1 ? 'es' : ''})
          </Button>
        </Card>
      )}

      {active && (
        <Card title={`Count ${active.countNumber} — ${active.status}`} className="mb-4">
          <Table
            columns={[
              { key: 'medicineNameSnapshot', label: 'Medicine' },
              { key: 'batchNumberSnapshot', label: 'Batch' },
              { key: 'systemQuantity', label: 'System Qty' },
              {
                key: 'physicalQuantity',
                label: 'Physical Qty',
                render: (l) =>
                  ['DRAFT', 'COUNTING'].includes(active.status) ? (
                    <input
                      type="number"
                      className="w-24 rounded-md border border-slate-300 px-2 py-1 text-sm"
                      value={l.physicalQuantity ?? ''}
                      onChange={(e) => updateLine(l._id, e.target.value)}
                    />
                  ) : (
                    l.physicalQuantity
                  ),
              },
              { key: 'variance', label: 'Variance' },
            ]}
            rows={active.lines}
            rowKey="_id"
          />
          <div className="mt-4 flex gap-2">
            {['DRAFT', 'COUNTING'].includes(active.status) && (
              <>
                <Button variant="secondary" onClick={saveLines}>
                  Save Counts
                </Button>
                <Button onClick={submit}>Submit for Approval</Button>
              </>
            )}
            {active.status === 'PENDING_APPROVAL' && <Button onClick={approve}>Approve & Adjust Stock</Button>}
            <Button variant="secondary" onClick={() => setActive(null)}>
              Close
            </Button>
          </div>
        </Card>
      )}

      <Card title="All counts">
        <Table
          columns={[
            { key: 'countNumber', label: 'Count #' },
            { key: 'status', label: 'Status' },
            { key: 'createdAt', label: 'Created', render: (r) => new Date(r.createdAt).toLocaleDateString() },
            { key: 'actions', label: '', render: (r) => <Button variant="secondary" onClick={() => openCount(r._id)}>Open</Button> },
          ]}
          rows={list}
        />
      </Card>
    </div>
  );
}
