import { useEffect, useState } from 'react';
import { patients as patientsApi } from '../api/endpoints';
import { Card, Table, Button, ErrorBanner } from '../components/ui';

const EMPTY_FORM = {
  firstName: '',
  lastName: '',
  mobile: '',
  gender: 'UNSPECIFIED',
  age: '',
  address: '',
  city: '',
  state: '',
  bloodGroup: '',
  emergencyContactName: '',
  emergencyContactPhone: '',
};

export default function Patients() {
  const [list, setList] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');

  function reload() {
    patientsApi
      .list()
      .then(setList)
      .catch((err) => setError(err.response?.data?.message || 'Failed to load patients'));
  }

  useEffect(reload, []);

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    try {
      await patientsApi.create(form);
      setForm(EMPTY_FORM);
      setShowForm(false);
      reload();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create patient');
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Patients</h1>
        <Button onClick={() => setShowForm((v) => !v)}>{showForm ? 'Cancel' : '+ Add Patient'}</Button>
      </div>
      <ErrorBanner message={error} />

      {showForm && (
        <Card title="New Patient" className="mb-4">
          <form onSubmit={handleCreate} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {Object.keys(EMPTY_FORM).map((key) => (
              <div key={key}>
                <label className="mb-1 block text-xs font-medium text-slate-500">{key}</label>
                <input
                  className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  type={key === 'age' ? 'number' : 'text'}
                  value={form[key]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  required={['firstName', 'mobile'].includes(key)}
                />
              </div>
            ))}
            <div className="col-span-full">
              <Button type="submit">Save Patient</Button>
            </div>
          </form>
        </Card>
      )}

      <Card>
        <Table
          columns={[
            { key: 'patientCode', label: 'Code' },
            { key: 'firstName', label: 'Name', render: (r) => `${r.firstName} ${r.lastName || ''}` },
            { key: 'mobile', label: 'Mobile' },
            { key: 'gender', label: 'Gender' },
          ]}
          rows={list}
        />
      </Card>
    </div>
  );
}
