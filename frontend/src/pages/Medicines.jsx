import { useEffect, useState } from 'react';
import { medicines, batches, exportsApi } from '../api/endpoints';
import { Card, Table, Button, ErrorBanner } from '../components/ui';

const EMPTY_FORM = { name: '', batchNumber: '', unit: 'STRIP', hsnCode: '', gstRate: 12, defaultDiscountType: 'PERCENTAGE', defaultDiscountValue: 0, defaultRate: 0, defaultQuantity: 0, defaultMrp: 0, defaultExpiryDate: '' };
const FIELD_LABELS = { name: 'Product Name', batchNumber: 'Batch No', unit: 'Unit', hsnCode: 'HSN Code', gstRate: 'GST %', defaultDiscountType: 'Discount Type', defaultDiscountValue: 'Discount', defaultRate: 'Rate', defaultQuantity: 'Stock Quantity', defaultMrp: 'MRP', defaultExpiryDate: 'Expiry Date' };

export default function Medicines() {
  const [list, setList] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');

  function reload() {
    medicines
      .list()
      .then(async (medicineList) => {
        const enriched = await Promise.all(
          medicineList.map(async (medicine) => {
            const medicineBatches = await batches.listForMedicine(medicine._id).catch(() => []);
            const batch = medicineBatches[0];
            if (!batch) return medicine;
            return {
              ...medicine,
              batchNumber: medicine.batchNumber || batch.batchNumber,
              defaultRate: medicine.defaultRate || batch.sellingRate,
              defaultQuantity: batch.availableQuantity ?? batch.quantity ?? medicine.defaultQuantity,
              defaultMrp: medicine.defaultMrp || batch.mrp,
              defaultExpiryDate: medicine.defaultExpiryDate || batch.expiryDate,
            };
          })
        );
        setList(enriched);
      })
      .catch((err) => setError(err.response?.data?.message || 'Failed to load medicines'));
  }

  useEffect(reload, []);

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    try {
      if (editingId) {
        await medicines.update(editingId, form);
      } else {
        await medicines.create(form);
      }
      setForm(EMPTY_FORM);
      setEditingId(null);
      setShowForm(false);
      reload();
    } catch (err) {
      setError(err.response?.data?.message || `Failed to ${editingId ? 'update' : 'create'} medicine`);
    }
  }

  function startEdit(medicine) {
    setEditingId(medicine._id);
    setForm(Object.fromEntries(Object.keys(EMPTY_FORM).map((key) => [
      key,
      key === 'defaultExpiryDate' && medicine[key]
        ? new Date(medicine[key]).toISOString().slice(0, 10)
        : medicine[key] ?? EMPTY_FORM[key],
    ])));
    setShowForm(true);
    setError('');
  }

  function cancelForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(false);
    setError('');
  }

  async function exportMedicines() {
    setError('');
    try {
      const response = await exportsApi.xlsx('medicines');
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'medicines.xlsx';
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to export medicines');
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Medicines</h1>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={exportMedicines}>Export Excel</Button>
          <Button onClick={() => (showForm ? cancelForm() : setShowForm(true))}>{showForm ? 'Cancel' : '+ Add Medicine'}</Button>
        </div>
      </div>
      <ErrorBanner message={error} />

      {showForm && (
          <Card title={editingId ? 'Edit Medicine' : 'New Medicine'} className="mb-4">
          <form onSubmit={handleCreate} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {Object.keys(EMPTY_FORM).map((key) => (
              <div key={key}>
                <label className="mb-1 block text-xs font-medium text-slate-500">{FIELD_LABELS[key]}</label>
                {key === 'defaultDiscountType' ? (
                  <select className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}>
                    <option value="PERCENTAGE">Percentage</option>
                    <option value="FIXED_AMOUNT">Fixed Amount</option>
                  </select>
                ) : (
                  <input
                    className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                    type={key === 'defaultExpiryDate' ? 'date' : ['gstRate', 'defaultDiscountValue', 'defaultRate', 'defaultQuantity', 'defaultMrp'].includes(key) ? 'number' : 'text'}
                    min={['defaultDiscountValue', 'defaultRate', 'defaultQuantity', 'defaultMrp'].includes(key) ? '0' : undefined}
                    step={['defaultDiscountValue', 'defaultRate', 'defaultMrp'].includes(key) ? '0.01' : undefined}
                    value={form[key]}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    required={key === 'name'}
                  />
                )}
              </div>
            ))}
            <div className="col-span-full">
              <Button type="submit">{editingId ? 'Update Medicine' : 'Save Medicine'}</Button>
            </div>
          </form>
        </Card>
      )}

      <Card>
        <Table
          columns={[
            { key: 'medicineCode', label: 'Code' },
            { key: 'name', label: 'Product Name' },
            { key: 'batchNumber', label: 'Batch No' },
            { key: 'hsnCode', label: 'HSN' },
            { key: 'defaultDiscountValue', label: 'Discount' },
            { key: 'defaultRate', label: 'Rate', render: (r) => r.defaultRate ? `₹${r.defaultRate}` : '—' },
            { key: 'defaultQuantity', label: 'Stock', render: (r) => r.defaultQuantity ?? '—' },
            { key: 'defaultMrp', label: 'MRP', render: (r) => r.defaultMrp ? `₹${r.defaultMrp}` : '—' },
            { key: 'defaultExpiryDate', label: 'Default Expiry', render: (r) => r.defaultExpiryDate ? new Date(r.defaultExpiryDate).toLocaleDateString('en-IN') : '—' },
            { key: 'gstRate', label: 'GST %' },
            { key: 'actions', label: 'Actions', render: (r) => <Button variant="secondary" onClick={() => startEdit(r)}>Edit</Button> },
          ]}
          rows={list}
        />
      </Card>
    </div>
  );
}
