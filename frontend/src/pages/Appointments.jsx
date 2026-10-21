import { useEffect, useState } from 'react';
import { appointments as appointmentsApi, patients as patientsApi, doctors as doctorsApi } from '../api/endpoints';
import { Card, Table, Button, ErrorBanner } from '../components/ui';

const EMPTY_FORM = {
  patient: '',
  doctor: '',
  appointmentDate: new Date().toISOString().slice(0, 10),
  startTime: '09:00',
  endTime: '09:30',
  reason: '',
  notes: '',
};

export default function Appointments() {
  const [list, setList] = useState([]);
  const [patients, setPatients] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');

  function reload() {
    appointmentsApi
      .list()
      .then(setList)
      .catch((err) => setError(err.response?.data?.message || 'Failed to load appointments'));

    Promise.all([
      patientsApi.list(),
      doctorsApi.list(),
    ])
      .then(([patientList, doctorList]) => {
        setPatients(patientList);
        setDoctors(doctorList);
      })
      .catch(() => {
        setPatients([]);
        setDoctors([]);
      });
  }

  useEffect(reload, []);

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    try {
      await appointmentsApi.create(form);
      setForm(EMPTY_FORM);
      setShowForm(false);
      reload();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create appointment');
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Appointments</h1>
        <Button onClick={() => setShowForm((v) => !v)}>{showForm ? 'Cancel' : '+ Add Appointment'}</Button>
      </div>
      <ErrorBanner message={error} />

      {showForm && (
        <Card title="New Appointment" className="mb-4">
          <form onSubmit={handleCreate} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">patient</label>
              <select
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                value={form.patient}
                onChange={(e) => setForm((f) => ({ ...f, patient: e.target.value }))}
                required
              >
                <option value="">Select patient</option>
                {patients.map((patient) => (
                  <option key={patient._id} value={patient._id}>{patient.firstName} {patient.lastName}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">doctor</label>
              <select
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                value={form.doctor}
                onChange={(e) => setForm((f) => ({ ...f, doctor: e.target.value }))}
                required
              >
                <option value="">Select doctor</option>
                {doctors.map((doctor) => (
                  <option key={doctor._id} value={doctor._id}>{doctor.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">appointmentDate</label>
              <input type="date" className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" value={form.appointmentDate} onChange={(e) => setForm((f) => ({ ...f, appointmentDate: e.target.value }))} required />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">startTime</label>
              <input type="time" className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" value={form.startTime} onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))} required />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">endTime</label>
              <input type="time" className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" value={form.endTime} onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))} required />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">reason</label>
              <input type="text" className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} />
            </div>

            <div className="col-span-full">
              <label className="mb-1 block text-xs font-medium text-slate-500">notes</label>
              <input type="text" className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>

            <div className="col-span-full">
              <Button type="submit">Save Appointment</Button>
            </div>
          </form>
        </Card>
      )}

      <Card>
        <Table
          columns={[
            { key: 'appointmentNumber', label: 'Appt #' },
            { key: 'patient', label: 'Patient', render: (r) => (r.patient ? `${r.patient.firstName} ${r.patient.lastName || ''}` : '—') },
            { key: 'doctor', label: 'Doctor', render: (r) => r.doctor?.name || '—' },
            { key: 'appointmentDate', label: 'Date', render: (r) => new Date(r.appointmentDate).toLocaleDateString() },
            { key: 'startTime', label: 'Time' },
            { key: 'status', label: 'Status' },
          ]}
          rows={list}
        />
      </Card>
    </div>
  );
}
