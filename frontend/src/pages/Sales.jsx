import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { sales as salesApi, medicines as medicinesApi, batches as batchesApi, holdBills, doctors as doctorsApi } from '../api/endpoints';
import { inr } from '../api/client';
import { Card, Table, Button, ErrorBanner } from '../components/ui';
import { subscribe as subscribeSyncEngine } from '../offline/syncEngine';
import { getCachedBatchesForMedicine, computeLocalInvoicePreview, queueOfflineSale } from '../offline/offlineBilling';
import { offlineDb } from '../offline/db';

export default function Sales() {
  const [list, setList] = useState([]);
  const [medicineOptions, setMedicineOptions] = useState([]);
  const [doctorOptions, setDoctorOptions] = useState([]);
  const [cart, setCart] = useState([]);
  const [customerName, setCustomerName] = useState('');
  const [doctorId, setDoctorId] = useState('');
  const [doctorName, setDoctorName] = useState('');
  const [payments, setPayments] = useState([{ method: 'CASH', amount: 0 }]);
  const [error, setError] = useState('');
  const [showBilling, setShowBilling] = useState(false);
  const [connection, setConnection] = useState(navigator.onLine ? 'ONLINE' : 'OFFLINE');
  const [lastOfflineBill, setLastOfflineBill] = useState(null);

  function reload() {
    salesApi
      .list()
      .then(setList)
      .catch((err) => setError(err.response?.data?.message || 'Failed to load sales'));
  }

  useEffect(() => {
    reload();
    medicinesApi.list().then(setMedicineOptions).catch(() => {});
    doctorsApi.list().then(setDoctorOptions).catch(() => {});
    const unsub = subscribeSyncEngine((state) => setConnection(state.connection));
    return unsub;
  }, []);

  function addCartLine() {
    setCart((c) => [...c, { medicine: '', quantity: 1, discountType: 'PERCENTAGE', discountValue: 0 }]);
  }
  function updateCartLine(idx, patch) {
    setCart((c) => c.map((line, i) => (i === idx ? { ...line, ...patch } : line)));
  }
  function removeCartLine(idx) {
    setCart((c) => c.filter((_, i) => i !== idx));
  }

  const isOffline = connection === 'OFFLINE';

  async function handleCheckout() {
    setError('');
    setLastOfflineBill(null);

    if (isOffline) {
      // Feature 2, requirement 1: billing must ACTUALLY WORK offline, not
      // just show a disabled "Offline Mode" message. Resolve each cart line
      // against the IndexedDB cache (FEFO batch, cached price/GST), compute
      // a local preview, and queue the bill in the outbox for auto-sync.
      try {
        const taxConfig = await offlineDb.getTaxConfig();
        if (!taxConfig) {
          setError('No offline data cached yet — connect to the internet at least once before going offline.');
          return;
        }
        const resolvedLines = [];
        for (const line of cart) {
          if (!line.medicine || !Number(line.quantity)) continue;
          const medicine = await offlineDb.get(offlineDb.STORES.medicines, line.medicine);
          const batches = await getCachedBatchesForMedicine(line.medicine);
          if (!medicine || batches.length === 0) {
            setError(`No cached stock available offline for ${medicine?.name || 'this item'}.`);
            return;
          }
          resolvedLines.push({ medicine, batch: batches[0], quantity: Number(line.quantity), discountType: line.discountType, discountValue: Number(line.discountValue) || 0 });
        }
        if (resolvedLines.length === 0) {
          setError('Add at least one item.');
          return;
        }

        const preview = await computeLocalInvoicePreview(resolvedLines, { taxConfig });
        const saleBody = {
          walkInCustomerName: customerName || undefined,
          referringDoctor: doctorId || undefined,
          referringDoctorName: doctorName || undefined,
          items: resolvedLines.map((l) => ({ medicine: l.medicine._id, batchId: l.batch._id, quantity: l.quantity, discountType: l.discountType, discountValue: l.discountValue })),
          payments: payments.filter((p) => Number(p.amount) > 0),
        };
        const entry = await queueOfflineSale({ saleBody, customerState: taxConfig.state });

        setLastOfflineBill({ ...preview, localTransactionId: entry.localTransactionId });
        setCart([]);
        setPayments([{ method: 'CASH', amount: 0 }]);
        setShowBilling(false);
      } catch (err) {
        setError(err.message || 'Could not create offline bill');
      }
      return;
    }

    try {
      await salesApi.create({
        walkInCustomerName: customerName || undefined,
        referringDoctor: doctorId || undefined,
        referringDoctorName: doctorName || undefined,
        items: cart.map((l) => ({ medicine: l.medicine, quantity: Number(l.quantity), discountType: l.discountType, discountValue: Number(l.discountValue) || 0 })),
        payments: payments.filter((p) => Number(p.amount) > 0),
        idempotencyKey: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      });
      setCart([]);
      setPayments([{ method: 'CASH', amount: 0 }]);
      setCustomerName('');
      setDoctorId('');
      setDoctorName('');
      setShowBilling(false);
      reload();
    } catch (err) {
      setError(err.response?.data?.message || 'Sale failed');
    }
  }

  async function handleHold() {
    setError('');
    try {
      const items = [];
      for (const line of cart) {
        if (!line.medicine || !Number(line.quantity)) continue;
        const batches = await batchesApi.listForMedicine(line.medicine);
        const batch = batches.find((candidate) => Number(candidate.availableQuantity ?? candidate.quantity) >= Number(line.quantity));
        if (!batch) {
          setError(`No available batch for ${medicineOptions.find((medicine) => medicine._id === line.medicine)?.name || 'this medicine'}.`);
          return;
        }
        items.push({ medicine: line.medicine, batch: batch._id, quantity: Number(line.quantity) });
      }
      if (items.length === 0) {
        setError('Add at least one item.');
        return;
      }
      await holdBills.create({ holdLabel: `Counter Sale - ${new Date().toLocaleTimeString()}`, items });
      setCart([]);
      setPayments([{ method: 'CASH', amount: 0 }]);
      setCustomerName('');
      setDoctorId('');
      setDoctorName('');
      setShowBilling(false);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not hold bill');
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Sales / POS</h1>
        <div className="flex items-center gap-2">
          {isOffline && <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700">OFFLINE — billing still works, will sync automatically</span>}
          <Button onClick={() => setShowBilling((v) => !v)}>{showBilling ? 'Cancel' : '+ New Sale'}</Button>
        </div>
      </div>
      <ErrorBanner message={error} />

      {lastOfflineBill && (
        <Card title="Offline Bill Created (queued for sync)" className="mb-4">
          <div className="text-sm">
            <div>Local Bill ID: {lastOfflineBill.localTransactionId}</div>
            <div>Taxable Amount: {inr(lastOfflineBill.taxableAmount)}</div>
            <div>GST: {inr(lastOfflineBill.cgst + lastOfflineBill.sgst + lastOfflineBill.igst)}</div>
            <div className="font-semibold">Grand Total: {inr(lastOfflineBill.grandTotal)}</div>
            <div className="mt-1 text-xs text-slate-400">This total is a local estimate for the printed receipt — it's recalculated authoritatively on the server when this bill syncs. Check the <Link className="underline" to="/sync-center">Sync Center</Link> for status.</div>
          </div>
        </Card>
      )}

      {showBilling && (
        <Card title="New Sale" className="mb-4">
          <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" placeholder="Customer name (optional)" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
            <input className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" placeholder="Doctor name (optional)" value={doctorName} onChange={(e) => setDoctorName(e.target.value)} />
            <select className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
              <option value="">Doctor (optional)</option>
              {doctorOptions.map((doctor) => <option key={doctor._id} value={doctor._id}>{doctor.name}</option>)}
            </select>
          </div>
          {cart.map((line, idx) => (
            <div key={idx} className="mb-2 flex items-center gap-2">
              <select className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm" value={line.medicine} onChange={(e) => updateCartLine(idx, { medicine: e.target.value })}>
                <option value="">Select medicine…</option>
                {medicineOptions.map((m) => (
                  <option key={m._id} value={m._id}>
                    {m.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="1"
                className="w-20 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                value={line.quantity}
                onChange={(e) => updateCartLine(idx, { quantity: e.target.value })}
              />
              <select
                className="w-32 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                value={line.discountType || 'PERCENTAGE'}
                onChange={(e) => updateCartLine(idx, { discountType: e.target.value })}
                aria-label="Discount type"
              >
                <option value="PERCENTAGE">Discount %</option>
                <option value="FIXED_AMOUNT">Discount ₹</option>
              </select>
              <input
                type="number"
                min="0"
                step="0.01"
                className="w-24 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                value={line.discountValue ?? 0}
                onChange={(e) => updateCartLine(idx, { discountValue: e.target.value })}
                aria-label="Discount value"
              />
              <button onClick={() => removeCartLine(idx)} className="text-sm text-red-500">
                Remove
              </button>
            </div>
          ))}
          <Button variant="secondary" onClick={addCartLine} className="mb-4">
            + Add item
          </Button>

          <div className="mb-4 flex items-center gap-2">
            <span className="text-sm text-slate-500">Payment (CASH)</span>
            <input
              type="number"
              className="w-32 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              value={payments[0].amount}
              onChange={(e) => setPayments([{ method: 'CASH', amount: e.target.value }])}
            />
            <span className="text-xs text-slate-400">For credit sales, enter either a registered customer or a manual customer name.</span>
          </div>

          <div className="flex gap-2">
            <Button variant="secondary" onClick={handleHold} disabled={cart.length === 0}>
              Hold Bill
            </Button>
            <Button onClick={handleCheckout} disabled={cart.length === 0}>
              Complete Sale
            </Button>
          </div>
        </Card>
      )}

      <Card>
        <Table
          columns={[
            { key: 'invoiceNumber', label: 'Invoice #' },
            { key: 'saleDate', label: 'Date', render: (r) => new Date(r.saleDate).toLocaleDateString() },
            { key: 'grandTotal', label: 'Total', render: (r) => inr(r.grandTotal) },
            { key: 'paymentStatus', label: 'Payment' },
            { key: 'status', label: 'Status' },
            { key: 'invoice', label: 'Invoice', render: (r) => <Link className="text-brand-600 underline" to={`/invoices/${r._id}`}>Print</Link> },
          ]}
          rows={list}
        />
      </Card>
    </div>
  );
}

