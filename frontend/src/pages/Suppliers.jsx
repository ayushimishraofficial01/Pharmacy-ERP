import { useEffect, useState } from 'react';
import { suppliers as suppliersApi } from '../api/endpoints';
import { Card, Table, Button, ErrorBanner } from '../components/ui';

const EMPTY_FORM = {
  supplierName: '',
  contactPerson: '',
  phone: '',
  email: '',
  state: '',
  stateCode: '',
  city: '',
  address: '',
  gstin: '',
  paymentTerms: 'NET_30',
  creditLimit: 0,
};

export default function Suppliers() {
  const [list, setList] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');

  function reload() {
    suppliersApi
      .list()
      .then(setList)
      .catch((err) => setError(err.response?.data?.message || 'Failed to load suppliers'));
  }

  useEffect(reload, []);

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    try {
      await suppliersApi.create(form);
      setForm(EMPTY_FORM);
      setShowForm(false);
      reload();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create supplier');
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Suppliers</h1>
        <Button onClick={() => setShowForm((v) => !v)}>{showForm ? 'Cancel' : '+ Add Supplier'}</Button>
      </div>
      <ErrorBanner message={error} />

      {showForm && (
        <Card title="New Supplier" className="mb-4">
          <form onSubmit={handleCreate} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {Object.keys(EMPTY_FORM).map((key) => (
              <div key={key}>
                <label className="mb-1 block text-xs font-medium text-slate-500">{key}</label>
                <input
                  className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  type={key === 'creditLimit' ? 'number' : 'text'}
                  value={form[key]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: key === 'creditLimit' ? Number(e.target.value) : e.target.value }))}
                  required={['supplierName', 'phone', 'state', 'stateCode'].includes(key)}
                />
              </div>
            ))}
            <div className="col-span-full">
              <Button type="submit">Save Supplier</Button>
            </div>
          </form>
        </Card>
      )}

      <Card>
        <Table
          columns={[
            { key: 'supplierCode', label: 'Code' },
            { key: 'supplierName', label: 'Name' },
            { key: 'phone', label: 'Phone' },
            { key: 'state', label: 'State' },
            { key: 'currentBalance', label: 'Balance Owed' },
          ]}
          rows={list}
        />
      </Card>
    </div>
  );
}
