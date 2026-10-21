import { useEffect, useState } from 'react';
import { purchases as purchasesApi, suppliers as suppliersApi, medicines as medicinesApi } from '../api/endpoints';
import { inr } from '../api/client';
import { Card, Table, Button, ErrorBanner } from '../components/ui';

const EMPTY_ITEM = { medicine: '', batchNumber: '', expiryDate: '', quantity: 1, freeQuantity: 0, purchaseRate: 0, mrp: 0, sellingRate: 0, gstRate: 12, discountType: 'PERCENTAGE', discountValue: 0 };

export default function Purchases() {
  const [list, setList] = useState([]);
  const [supplierOptions, setSupplierOptions] = useState([]);
  const [medicineOptions, setMedicineOptions] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');

  const [supplier, setSupplier] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [purchaseType, setPurchaseType] = useState('CASH');
  const [items, setItems] = useState([{ ...EMPTY_ITEM }]);

  function reload() {
    purchasesApi
      .list()
      .then(setList)
      .catch((err) => setError(err.response?.data?.message || 'Failed to load purchases'));
  }
  useEffect(() => {
    reload();
    suppliersApi.list().then(setSupplierOptions).catch(() => {});
    medicinesApi.list().then(setMedicineOptions).catch(() => {});
  }, []);

  function updateItem(idx, patch) {
    setItems((its) => its.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }
  function addItem() {
    setItems((its) => [...its, { ...EMPTY_ITEM }]);
  }
  function removeItem(idx) {
    setItems((its) => its.filter((_, i) => i !== idx));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      await purchasesApi.create({
        supplier,
        invoiceNumber,
        invoiceDate,
        purchaseType,
        items: items.map((it) => ({
          ...it,
          quantity: Number(it.quantity),
          freeQuantity: Number(it.freeQuantity),
          purchaseRate: Number(it.purchaseRate),
          mrp: Number(it.mrp),
          sellingRate: Number(it.sellingRate),
          gstRate: Number(it.gstRate),
          discountValue: Number(it.discountValue),
        })),
      });
      setShowForm(false);
      setItems([{ ...EMPTY_ITEM }]);
      setInvoiceNumber('');
      reload();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to record purchase');
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Purchases</h1>
        <Button onClick={() => setShowForm((v) => !v)}>{showForm ? 'Cancel' : '+ New Purchase'}</Button>
      </div>
      <ErrorBanner message={error} />

      {showForm && (
        <Card title="New Purchase" className="mb-4">
          <form onSubmit={handleSubmit}>
            <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Supplier</label>
                <select className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" value={supplier} onChange={(e) => setSupplier(e.target.value)} required>
                  <option value="">Select…</option>
                  {supplierOptions.map((s) => (
                    <option key={s._id} value={s._id}>
                      {s.supplierName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Invoice #</label>
                <input className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} required />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Invoice Date</label>
                <input type="date" className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} required />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Type</label>
                <select className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" value={purchaseType} onChange={(e) => setPurchaseType(e.target.value)}>
                  <option value="CASH">Cash</option>
                  <option value="CREDIT">Credit</option>
                </select>
              </div>
            </div>

            <div className="mb-2 text-xs font-semibold uppercase text-slate-400">Items</div>
            {items.map((it, idx) => (
              <div key={idx} className="mb-2 grid grid-cols-2 gap-2 rounded-md border border-slate-100 p-2 sm:grid-cols-5">
                <select className="rounded-md border border-slate-300 px-2 py-1 text-sm sm:col-span-2" value={it.medicine} onChange={(e) => updateItem(idx, { medicine: e.target.value })} required>
                  <option value="">Medicine…</option>
                  {medicineOptions.map((m) => (
                    <option key={m._id} value={m._id}>
                      {m.name}
                    </option>
                  ))}
                </select>
                <input placeholder="Batch #" className="rounded-md border border-slate-300 px-2 py-1 text-sm" value={it.batchNumber} onChange={(e) => updateItem(idx, { batchNumber: e.target.value })} required />
                <input type="date" className="rounded-md border border-slate-300 px-2 py-1 text-sm" value={it.expiryDate} onChange={(e) => updateItem(idx, { expiryDate: e.target.value })} required />
                <input type="number" placeholder="Qty" className="rounded-md border border-slate-300 px-2 py-1 text-sm" value={it.quantity} onChange={(e) => updateItem(idx, { quantity: e.target.value })} />
                <input type="number" placeholder="Purchase Rate" className="rounded-md border border-slate-300 px-2 py-1 text-sm" value={it.purchaseRate} onChange={(e) => updateItem(idx, { purchaseRate: e.target.value })} />
                <input type="number" placeholder="MRP" className="rounded-md border border-slate-300 px-2 py-1 text-sm" value={it.mrp} onChange={(e) => updateItem(idx, { mrp: e.target.value })} />
                <input type="number" placeholder="Selling Rate" className="rounded-md border border-slate-300 px-2 py-1 text-sm" value={it.sellingRate} onChange={(e) => updateItem(idx, { sellingRate: e.target.value })} />
                <input type="number" placeholder="GST %" className="rounded-md border border-slate-300 px-2 py-1 text-sm" value={it.gstRate} onChange={(e) => updateItem(idx, { gstRate: e.target.value })} />
                <button type="button" onClick={() => removeItem(idx)} className="text-sm text-red-500">
                  Remove
                </button>
              </div>
            ))}
            <Button type="button" variant="secondary" onClick={addItem} className="mb-3">
              + Add item
            </Button>
            <div>
              <Button type="submit">Record Purchase</Button>
            </div>
          </form>
        </Card>
      )}

      <Card>
        <Table
          columns={[
            { key: 'purchaseNumber', label: 'Purchase #' },
            { key: 'supplier', label: 'Supplier', render: (r) => r.supplier?.supplierName || '—' },
            { key: 'invoiceNumber', label: 'Invoice #' },
            { key: 'grandTotal', label: 'Total', render: (r) => inr(r.grandTotal) },
            { key: 'paymentStatus', label: 'Payment' },
          ]}
          rows={list}
        />
      </Card>
    </div>
  );
}
