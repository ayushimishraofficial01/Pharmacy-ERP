import { useEffect, useState } from 'react';
import { appointments as appointmentsApi, consultations as consultationsApi, prescriptions as prescriptionsApi, medicines as medicinesApi } from '../api/endpoints';
import { Card, Table, Button, ErrorBanner } from '../components/ui';

const EMPTY_RX_ITEM = { medicine: '', dosage: '', frequency: '', duration: '', quantity: 1, instructions: '' };

export default function Consultations() {
  const [appts, setAppts] = useState([]);
  const [records, setRecords] = useState([]);
  const [active, setActive] = useState(null);
  const [form, setForm] = useState({ chiefComplaint: '', diagnosis: '', clinicalNotes: '', advice: '' });
  const [medicineOptions, setMedicineOptions] = useState([]);
  const [rxItems, setRxItems] = useState([{ ...EMPTY_RX_ITEM }]);
  const [error, setError] = useState('');

  function reloadAppointments() {
    appointmentsApi
      .list({ status: undefined })
      .then((all) => setAppts(all.filter((a) => ['SCHEDULED', 'CONFIRMED', 'CHECKED_IN'].includes(a.status))))
      .catch((err) => setError(err.response?.data?.message || 'Failed to load appointments'));

    consultationsApi
      .list()
      .then(setRecords)
      .catch((err) => setError(err.response?.data?.message || 'Failed to load consultation records'));
  }
  useEffect(() => {
    reloadAppointments();
    medicinesApi.list().then(setMedicineOptions).catch(() => {});
  }, []);

  async function start(appointmentId) {
    setError('');
    try {
      const consultation = await consultationsApi.start({ appointment: appointmentId });
      setActive(consultation);
      reloadAppointments();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to start consultation');
    }
  }

  async function saveNotes(complete) {
    setError('');
    try {
      const updated = await consultationsApi.update(active._id, { ...form, status: complete ? 'COMPLETED' : 'IN_PROGRESS' });
      setActive(updated);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save consultation');
    }
  }

  function updateRxItem(idx, patch) {
    setRxItems((its) => its.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  async function issuePrescription() {
    setError('');
    try {
      await prescriptionsApi.create({
        patient: active.patient._id || active.patient,
        doctor: active.doctor._id || active.doctor,
        consultation: active._id,
        diagnosis: form.diagnosis,
        items: rxItems.filter((i) => i.medicine).map((i) => ({ ...i, quantity: Number(i.quantity) })),
      });
      setRxItems([{ ...EMPTY_RX_ITEM }]);
      alert('Prescription issued.');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to issue prescription');
    }
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Consultations</h1>
      <ErrorBanner message={error} />

      {!active && (
        <>
          <Card title="Appointments ready for consultation" className="mb-4">
            <Table
              columns={[
                { key: 'appointmentNumber', label: 'Appt #' },
                { key: 'patient', label: 'Patient', render: (r) => (r.patient ? `${r.patient.firstName} ${r.patient.lastName || ''}` : '—') },
                { key: 'doctor', label: 'Doctor', render: (r) => r.doctor?.name || '—' },
                { key: 'status', label: 'Status' },
                { key: 'actions', label: '', render: (r) => <Button onClick={() => start(r._id)}>Start Consultation</Button> },
              ]}
              rows={appts}
              emptyMessage="No appointments waiting."
            />
          </Card>

          <Card title="Recent consultations">
            <Table
              columns={[
                { key: 'consultationNumber', label: 'Consultation #' },
                { key: 'patient', label: 'Patient', render: (r) => (r.patient ? `${r.patient.firstName} ${r.patient.lastName || ''}` : '—') },
                { key: 'doctor', label: 'Doctor', render: (r) => r.doctor?.name || '—' },
                { key: 'consultationDate', label: 'Date', render: (r) => (r.consultationDate ? new Date(r.consultationDate).toLocaleDateString() : '—') },
                { key: 'status', label: 'Status' },
              ]}
              rows={records}
              emptyMessage="No consultation records yet."
            />
          </Card>
        </>
      )}

      {active && (
        <Card title={`Consultation ${active.consultationNumber}`} className="mb-4">
          <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {['chiefComplaint', 'diagnosis', 'clinicalNotes', 'advice'].map((field) => (
              <div key={field}>
                <label className="mb-1 block text-xs font-medium text-slate-500">{field}</label>
                <textarea className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" rows={2} value={form[field]} onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))} />
              </div>
            ))}
          </div>
          <div className="mb-4 flex gap-2">
            <Button variant="secondary" onClick={() => saveNotes(false)}>
              Save Draft
            </Button>
            <Button onClick={() => saveNotes(true)}>Complete Consultation</Button>
            <Button
              variant="secondary"
              onClick={() => {
                setActive(null);
                reloadAppointments();
              }}
            >
              Back to list
            </Button>
          </div>

          <div className="mb-2 text-xs font-semibold uppercase text-slate-400">Prescription</div>
          {rxItems.map((it, idx) => (
            <div key={idx} className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-6">
              <select className="rounded-md border border-slate-300 px-2 py-1 text-sm sm:col-span-2" value={it.medicine} onChange={(e) => updateRxItem(idx, { medicine: e.target.value })}>
                <option value="">Medicine…</option>
                {medicineOptions.map((m) => (
                  <option key={m._id} value={m._id}>
                    {m.name}
                  </option>
                ))}
              </select>
              <input placeholder="Dosage" className="rounded-md border border-slate-300 px-2 py-1 text-sm" value={it.dosage} onChange={(e) => updateRxItem(idx, { dosage: e.target.value })} />
              <input placeholder="Frequency" className="rounded-md border border-slate-300 px-2 py-1 text-sm" value={it.frequency} onChange={(e) => updateRxItem(idx, { frequency: e.target.value })} />
              <input placeholder="Duration" className="rounded-md border border-slate-300 px-2 py-1 text-sm" value={it.duration} onChange={(e) => updateRxItem(idx, { duration: e.target.value })} />
              <input type="number" placeholder="Qty" className="rounded-md border border-slate-300 px-2 py-1 text-sm" value={it.quantity} onChange={(e) => updateRxItem(idx, { quantity: e.target.value })} />
            </div>
          ))}
          <Button variant="secondary" onClick={() => setRxItems((its) => [...its, { ...EMPTY_RX_ITEM }])} className="mb-3">
            + Add medicine
          </Button>
          <div>
            <Button onClick={issuePrescription}>Issue Prescription</Button>
          </div>
        </Card>
      )}
    </div>
  );
}
