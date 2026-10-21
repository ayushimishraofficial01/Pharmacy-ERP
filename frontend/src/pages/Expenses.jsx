import { useEffect, useState } from 'react';
import { expenses as expensesApi, expenseCategories } from '../api/endpoints';
import { inr } from '../api/client';
import { Card, Table, Button, ErrorBanner } from '../components/ui';

export default function Expenses() {
  const [list, setList] = useState([]);
  const [categories, setCategories] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10), category: '', description: '', amount: 0, paymentMethod: 'CASH', vendor: '', referenceNumber: '', notes: '' });
  const [error, setError] = useState('');

  useEffect(() => {
    expensesApi.list().then(setList).catch((err) => setError(err.response?.data?.message || 'Failed to load expenses'));
    expenseCategories.list().then((loaded) => {
      if (loaded.length > 0) return setCategories(loaded);
      expenseCategories.seedDefaults().then(setCategories).catch(() => {});
    }).catch(() => {});
  }, []);

  async function createExpense(e) {
    e.preventDefault();
    setError('');
    try {
      await expensesApi.create({ ...form, amount: Number(form.amount) });
      setShowForm(false);
      setForm({ date: new Date().toISOString().slice(0, 10), category: '', description: '', amount: 0, paymentMethod: 'CASH', vendor: '', referenceNumber: '', notes: '' });
      expensesApi.list().then(setList);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create expense');
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Expenses</h1>
        <Button onClick={() => setShowForm((v) => !v)}>{showForm ? 'Cancel' : '+ Add Expense'}</Button>
      </div>
      <ErrorBanner message={error} />
      {showForm && (
        <Card title="New Expense" className="mb-4">
          <form onSubmit={createExpense} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <input type="date" className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} required />
            <select className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} required>
              <option value="">Category…</option>
              {categories.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
            </select>
            <input placeholder="Description" className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} required />
            <input type="number" placeholder="Amount" className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} min="0" required />
            <input placeholder="Vendor" className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" value={form.vendor} onChange={(e) => setForm((f) => ({ ...f, vendor: e.target.value }))} />
            <select className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" value={form.paymentMethod} onChange={(e) => setForm((f) => ({ ...f, paymentMethod: e.target.value }))}>
              {['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'CHEQUE'].map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <div className="col-span-full"><Button type="submit">Save Expense</Button></div>
          </form>
        </Card>
      )}
      <Card>
        <Table
          columns={[
            { key: 'expenseNumber', label: 'Expense #' },
            { key: 'date', label: 'Date', render: (r) => new Date(r.date).toLocaleDateString() },
            { key: 'category', label: 'Category', render: (r) => r.category?.name || '—' },
            { key: 'amount', label: 'Amount', render: (r) => inr(r.amount) },
            { key: 'status', label: 'Status' },
          ]}
          rows={list}
        />
      </Card>
    </div>
  );
}
