import { useEffect, useState } from 'react';
import { gstReturns as gstReturnsApi } from '../api/endpoints';
import { inr } from '../api/client';
import { Card, Table, Button, ErrorBanner, StatCard } from '../components/ui';

function currentPeriod() {
  return new Date().toISOString().slice(0, 7);
}

export default function GstReturns() {
  const [period, setPeriod] = useState(currentPeriod());
  const [returnType, setReturnType] = useState('GSTR-1');
  const [dashboard, setDashboard] = useState(null);
  const [preview, setPreview] = useState(null);
  const [filings, setFilings] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function reloadDashboard() {
    gstReturnsApi
      .dashboard({ period })
      .then(setDashboard)
      .catch((err) => setError(err.response?.data?.message || 'Failed to load GST dashboard'));
  }
  function reloadFilings() {
    gstReturnsApi.list({ period }).then(setFilings).catch(() => {});
  }

  useEffect(() => {
    reloadDashboard();
    reloadFilings();
    setPreview(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  async function handlePreview() {
    setError('');
    setBusy(true);
    try {
      const data = await gstReturnsApi.generate({ period, returnType });
      setPreview(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to generate return');
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveFiling() {
    setError('');
    setBusy(true);
    try {
      await gstReturnsApi.save({ returnType, period });
      reloadFilings();
      reloadDashboard();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save filing');
    } finally {
      setBusy(false);
    }
  }

  async function handleExport(filingId, format) {
    try {
      const res = await gstReturnsApi.exportFile(filingId, format);
      if (format === 'JSON') {
        const blob = new Blob([JSON.stringify(res.data.data, null, 2)], { type: 'application/json' });
        downloadBlob(blob, `gst-return-${period}.json`);
      } else {
        downloadBlob(res.data, `gst-return-${period}.${format === 'EXCEL' ? 'xlsx' : 'csv'}`);
      }
      reloadFilings();
    } catch (err) {
      setError(err.response?.data?.message || 'Export failed');
    }
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  const gstr3b = dashboard?.gstr3b;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">GST Returns</h1>
        <div className="flex items-center gap-2">
          <input type="month" className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" value={period} onChange={(e) => setPeriod(e.target.value)} />
          <select className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" value={returnType} onChange={(e) => setReturnType(e.target.value)}>
            <option value="GSTR-1">GSTR-1</option>
            <option value="GSTR-3B">GSTR-3B</option>
          </select>
        </div>
      </div>
      <ErrorBanner message={error} />

      {dashboard && (
        <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="GSTIN" value={dashboard.gstin || 'Not configured'} />
          <StatCard label="Financial Year" value={dashboard.financialYear} />
          <StatCard label="Taxable Sales" value={inr(gstr3b?.outwardSupplies.taxableAmount)} />
          <StatCard label="Net GST Payable" value={inr(gstr3b?.netGstPayable)} />
          <StatCard label="CGST" value={inr(gstr3b?.outwardSupplies.cgst)} />
          <StatCard label="SGST" value={inr(gstr3b?.outwardSupplies.sgst)} />
          <StatCard label="IGST" value={inr(gstr3b?.outwardSupplies.igst)} />
          <StatCard label="Input Tax Credit" value={inr(gstr3b?.inputTaxCredit.total)} />
          <StatCard label="Sales Returns (Credit Notes)" value={dashboard.salesReturnCount} />
          <StatCard label="Purchases" value={dashboard.purchaseCount} />
        </div>
      )}

      <Card title={`Generate ${returnType} for ${period}`} className="mb-4" action={<Button onClick={handlePreview} disabled={busy}>Generate & Validate</Button>}>
        {!preview && <div className="text-sm text-slate-400">Click "Generate & Validate" to pull real transactions for this period and check them before filing.</div>}
        {preview && (
          <>
            {!preview.validation.valid && (
              <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <div className="mb-1 font-medium">{preview.validation.invalidInvoiceCount} of {preview.validation.totalInvoices} invoice(s) have issues — these will be excluded until fixed:</div>
                <ul className="list-inside list-disc">
                  {preview.validation.errors.slice(0, 20).map((e, i) => (
                    <li key={i}>{e.message}</li>
                  ))}
                </ul>
              </div>
            )}
            {returnType === 'GSTR-1' && preview.gstr1 && (
              <Table
                columns={[
                  { key: 'invoiceNumber', label: 'Invoice #' },
                  { key: 'invoiceDate', label: 'Date', render: (r) => new Date(r.invoiceDate).toLocaleDateString() },
                  { key: 'invoiceCategory', label: 'Type' },
                  { key: 'buyerGstin', label: 'Buyer GSTIN', render: (r) => r.buyerGstin || 'B2C' },
                  { key: 'taxableAmount', label: 'Taxable', render: (r) => inr(r.taxableAmount) },
                  { key: 'gst', label: 'GST', render: (r) => inr(r.cgst + r.sgst + r.igst) },
                ]}
                rows={[...preview.gstr1.b2b, ...preview.gstr1.b2cs.map((r, i) => ({ invoiceNumber: `B2C(S) row ${i + 1}`, invoiceDate: null, invoiceCategory: 'B2C', buyerGstin: null, taxableAmount: r.taxableAmount, cgst: r.cgst, sgst: r.sgst, igst: r.igst }))]}
                rowKey={(r) => r.invoiceNumber || r.taxableAmount}
              />
            )}
            {returnType === 'GSTR-3B' && preview.gstr3b && (
              <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
                <div>Outward taxable: {inr(preview.gstr3b.outwardSupplies.taxableAmount)}</div>
                <div>Output tax: {inr(preview.gstr3b.outwardSupplies.totalTax)}</div>
                <div>ITC: {inr(preview.gstr3b.inputTaxCredit.total)}</div>
                <div className="font-semibold">Net payable: {inr(preview.gstr3b.netGstPayable)}</div>
              </div>
            )}
            <Button className="mt-4" onClick={handleSaveFiling} disabled={busy}>
              Save as Filing Record
            </Button>
          </>
        )}
      </Card>

      <Card title="Filing History">
        <Table
          columns={[
            { key: 'returnType', label: 'Return' },
            { key: 'period', label: 'Period' },
            { key: 'status', label: 'Status' },
            { key: 'arn', label: 'ARN', render: (r) => r.arn || '—' },
            { key: 'errorMessage', label: 'Error', render: (r) => r.errorMessage || '—' },
            {
              key: 'export',
              label: 'Export',
              render: (r) => (
                <div className="flex gap-2">
                  <button className="text-xs text-brand-600 underline" onClick={() => handleExport(r._id, 'JSON')}>JSON</button>
                  <button className="text-xs text-brand-600 underline" onClick={() => handleExport(r._id, 'EXCEL')}>Excel</button>
                  <button className="text-xs text-brand-600 underline" onClick={() => handleExport(r._id, 'CSV')}>CSV</button>
                </div>
              ),
            },
          ]}
          rows={filings}
        />
      </Card>
    </div>
  );
}
