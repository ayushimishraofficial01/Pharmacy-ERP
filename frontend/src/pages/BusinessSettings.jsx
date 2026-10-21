import { useEffect, useState } from 'react';
import { businessSettings as businessSettingsApi } from '../api/endpoints';
import { Card, Button, ErrorBanner } from '../components/ui';

const DEFAULT_TEMPLATE = {
  paperSize: 'A4',
  fontSize: 'MEDIUM',
  invoiceTitle: 'GST INVOICE',
  showLogo: true,
  logoUrl: '',
  showDrugLicense: true,
  showPatientSection: true,
  showDoctorSection: true,
  showQrCode: false,
  qrType: 'NONE',
  upiId: '',
  upiPayeeName: '',
  termsAndConditions: '',
  returnPolicy: '',
  customerCareText: '',
  footerMessage: '',
};

export default function BusinessSettings() {
  const [settings, setSettings] = useState(null);
  const [form, setForm] = useState(DEFAULT_TEMPLATE);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    businessSettingsApi
      .get()
      .then((data) => {
        setSettings(data);
        setForm({ ...DEFAULT_TEMPLATE, ...(data.invoiceTemplate || {}) });
      })
      .catch((err) => setError(err.response?.data?.message || 'Failed to load settings'));
  }, []);

  function update(patch) {
    setForm((f) => ({ ...f, ...patch }));
    setSaved(false);
  }

  async function handleSave() {
    setError('');
    try {
      await businessSettingsApi.update({ invoiceTemplate: form });
      setSaved(true);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save settings');
    }
  }

  if (!settings) return <div className="p-6 text-sm text-slate-400">Loading…</div>;

  const input = 'w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm';
  const label = 'mb-1 block text-xs font-medium text-slate-500';

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Business Settings — Invoice Template</h1>
      <ErrorBanner message={error} />
      {saved && <div className="mb-4 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">Settings saved.</div>}

      <div className="mb-4 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
        Pharmacy name, GSTIN, address, and drug license always come from your Organization/Branch profile — they can't be set here. This page only controls how the invoice looks and which optional sections print.
      </div>

      <Card title="Layout" className="mb-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={label}>Paper Size</label>
            <select className={input} value={form.paperSize} onChange={(e) => update({ paperSize: e.target.value })}>
              <option value="A4">A4</option>
              <option value="A5">A5</option>
              <option value="A6">A6 (small)</option>
              <option value="THERMAL_57MM">Thermal 57mm (extra small)</option>
              <option value="THERMAL_58MM">Thermal 58mm</option>
              <option value="THERMAL_80MM">Thermal 80mm</option>
            </select>
          </div>
          <div>
            <label className={label}>Font Size</label>
            <select className={input} value={form.fontSize} onChange={(e) => update({ fontSize: e.target.value })}>
              <option value="SMALL">Small</option>
              <option value="MEDIUM">Medium</option>
              <option value="LARGE">Large</option>
            </select>
          </div>
          <div>
            <label className={label}>Invoice Title</label>
            <input className={input} value={form.invoiceTitle} onChange={(e) => update({ invoiceTitle: e.target.value })} />
          </div>
          <div>
            <label className={label}>Logo URL</label>
            <input className={input} value={form.logoUrl || ''} onChange={(e) => update({ logoUrl: e.target.value })} placeholder="https://…" />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-sm">
          {[
            ['showLogo', 'Show logo'],
            ['showDrugLicense', 'Show drug license'],
            ['showPatientSection', 'Show patient section'],
            ['showDoctorSection', 'Show doctor section'],
          ].map(([key, text]) => (
            <label key={key} className="flex items-center gap-1.5">
              <input type="checkbox" checked={!!form[key]} onChange={(e) => update({ [key]: e.target.checked })} />
              {text}
            </label>
          ))}
        </div>
      </Card>

      <Card title="Payment QR" className="mb-4">
        <div className="mb-3 flex items-center gap-2 text-sm">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={!!form.showQrCode} onChange={(e) => update({ showQrCode: e.target.checked })} />
            Show payment QR on invoice
          </label>
        </div>
        {form.showQrCode && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={label}>UPI ID</label>
              <input className={input} value={form.upiId || ''} onChange={(e) => update({ upiId: e.target.value, qrType: 'UPI' })} placeholder="pharmacy@upi" />
            </div>
            <div>
              <label className={label}>Payee Name (on QR)</label>
              <input className={input} value={form.upiPayeeName || ''} onChange={(e) => update({ upiPayeeName: e.target.value })} />
            </div>
          </div>
        )}
      </Card>

      <Card title="Footer" className="mb-4">
        <div className="grid grid-cols-1 gap-3">
          <div>
            <label className={label}>Terms & Conditions</label>
            <textarea className={input} rows={2} value={form.termsAndConditions || ''} onChange={(e) => update({ termsAndConditions: e.target.value })} />
          </div>
          <div>
            <label className={label}>Return / Exchange Policy</label>
            <textarea className={input} rows={2} value={form.returnPolicy || ''} onChange={(e) => update({ returnPolicy: e.target.value })} />
          </div>
          <div>
            <label className={label}>Customer Care</label>
            <input className={input} value={form.customerCareText || ''} onChange={(e) => update({ customerCareText: e.target.value })} />
          </div>
          <div>
            <label className={label}>Thank-you / Footer Message</label>
            <input className={input} value={form.footerMessage || ''} onChange={(e) => update({ footerMessage: e.target.value })} />
          </div>
        </div>
      </Card>

      <Button onClick={handleSave}>Save Settings</Button>
    </div>
  );
}
