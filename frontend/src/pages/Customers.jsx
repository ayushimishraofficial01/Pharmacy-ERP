import { useEffect, useState } from 'react';
import { customers as customersApi, exportsApi } from '../api/endpoints';
import { inr } from '../api/client';
import { Card, Table, Button, ErrorBanner } from '../components/ui';

const EMPTY_FORM = {
  name: '',
  mobile: '',
  address: '',
  doctorName: '',
  state: '',
  gstin: '',
  creditLimit: 0,
};

export default function Customers() {
  const [list, setList] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');

  function reload() {
    customersApi
      .list()
      .then(setList)
      .catch((err) => setError(err.response?.data?.message || 'Failed to load customers'));
  }

  useEffect(reload, []);

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    try {
      await customersApi.create(form);
      setForm(EMPTY_FORM);
      setShowForm(false);
      reload();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create customer');
    }
  }

  async function exportCustomers() {
    setError('');
    try {
      const response = await exportsApi.xlsx('customers');
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'customers.xlsx';
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to export customers');
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Customers</h1>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={exportCustomers}>Export Excel</Button>
          <Button onClick={() => setShowForm((v) => !v)}>{showForm ? 'Cancel' : '+ Add Customer'}</Button>
        </div>
      </div>
      <ErrorBanner message={error} />

      {showForm && (
        <Card title="New Customer" className="mb-4">
          <form onSubmit={handleCreate} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {Object.keys(EMPTY_FORM).map((key) => (
              <div key={key}>
                <label className="mb-1 block text-xs font-medium text-slate-500">{key}</label>
                <input
                  className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  type={key === 'creditLimit' ? 'number' : 'text'}
                  value={form[key]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: key === 'creditLimit' ? Number(e.target.value) : e.target.value }))}
                  required={key === 'name'}
                />
              </div>
            ))}
            <div className="col-span-full">
              <Button type="submit">Save Customer</Button>
            </div>
          </form>
        </Card>
      )}

      <Card>
        <Table
          columns={[
            { key: 'name', label: 'Name' },
            { key: 'mobile', label: 'Mobile' },
            { key: 'address', label: 'Address' },
            { key: 'doctorName', label: 'Doctor' },
            { key: 'outstandingBalance', label: 'Outstanding', render: (r) => inr(r.outstandingBalance) },
          ]}
          rows={list}
        />
      </Card>
    </div>
  );
}
