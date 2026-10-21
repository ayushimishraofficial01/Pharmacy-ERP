import { useEffect, useState } from 'react';
import { doctors as doctorsApi } from '../api/endpoints';
import { Card, Table, Button, ErrorBanner } from '../components/ui';

const EMPTY_FORM = {
  name: '',
  specialization: 'General Medicine',
  qualification: '',
  registrationNumber: '',
  mobile: '',
  email: '',
  consultationFee: 500,
};

export default function Doctors() {
  const [list, setList] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');

  function reload() {
    doctorsApi
      .list()
      .then(setList)
      .catch((err) => setError(err.response?.data?.message || 'Failed to load doctors'));
  }

  useEffect(reload, []);

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    try {
      await doctorsApi.create(form);
      setForm(EMPTY_FORM);
      setShowForm(false);
      reload();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create doctor');
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Doctors</h1>
        <Button onClick={() => setShowForm((v) => !v)}>{showForm ? 'Cancel' : '+ Add Doctor'}</Button>
      </div>
      <ErrorBanner message={error} />

      {showForm && (
        <Card title="New Doctor" className="mb-4">
          <form onSubmit={handleCreate} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {Object.keys(EMPTY_FORM).map((key) => (
              <div key={key}>
                <label className="mb-1 block text-xs font-medium text-slate-500">{key}</label>
                <input
                  className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  type={key === 'consultationFee' ? 'number' : 'text'}
                  value={form[key]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: key === 'consultationFee' ? Number(e.target.value) : e.target.value }))}
                  required={key === 'name'}
                />
              </div>
            ))}
            <div className="col-span-full">
              <Button type="submit">Save Doctor</Button>
            </div>
          </form>
        </Card>
      )}

      <Card>
        <Table
          columns={[
            { key: 'doctorCode', label: 'Code' },
            { key: 'name', label: 'Name' },
            { key: 'specialization', label: 'Specialization' },
            { key: 'consultationFee', label: 'Fee' },
          ]}
          rows={list}
        />
      </Card>
    </div>
  );
}
