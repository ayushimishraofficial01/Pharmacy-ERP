import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { invoices as invoicesApi } from '../api/endpoints';
import { inr } from '../api/client';
import { Button, ErrorBanner } from '../components/ui';

// requirement 10: print CSS per paper size. Thermal widths are the two
// common roll sizes; A4/A5 use standard ISO paper dimensions. Only the
// invoice sheet itself is included in @media print — everything else
// (nav, header, buttons) is hidden so nothing but the bill prints.
const PAPER_CSS = {
  THERMAL_57MM: { width: '57mm', fontSize: '9px', padding: '3px' },
  THERMAL_58MM: { width: '58mm', fontSize: '10px', padding: '4px' },
  THERMAL_80MM: { width: '80mm', fontSize: '11px', padding: '6px' },
  A6: { width: '105mm', fontSize: '11px', padding: '7mm' },
  A5: { width: '148mm', fontSize: '12px', padding: '10mm' },
  A4: { width: '210mm', fontSize: '13px', padding: '14mm' },
};

export default function InvoicePrint() {
  const { saleId } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    invoicesApi
      .get(saleId)
      .then(setData)
      .catch((err) => setError(err.response?.data?.message || 'Failed to load invoice'));
  }, [saleId]);

  if (error) return <ErrorBanner message={error} />;
  if (!data) return <div className="p-6 text-sm text-slate-400">Loading invoice…</div>;

  const { template, pharmacy, invoice, customer, doctor, items, totals, hasReturns, salesReturns, qr } = data;
  const paper = PAPER_CSS[template.paperSize] || PAPER_CSS.A4;
  const isThermal = template.paperSize.startsWith('THERMAL');

  return (
    <div>
      {/* requirement 10: everything in this bar is screen-only, never printed */}
      <div className="no-print mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Invoice {invoice.invoiceNumber}</h1>
        <Button onClick={() => window.print()}>Print / Save as PDF</Button>
      </div>

      <style>{`
        .invoice-sheet { width: ${paper.width}; margin: 0 auto; font-size: ${paper.fontSize}; padding: ${paper.padding}; background: white; }
        .invoice-table { width: 100%; border-collapse: collapse; }
        .invoice-table th, .invoice-table td { border-bottom: 1px solid #ddd; padding: 3px 4px; text-align: left; }
        @media print {
          @page { size: ${paper.width} auto; margin: 0; }
          .no-print { display: none !important; }
          body { margin: 0; }
          .invoice-sheet { box-shadow: none !important; border: 0 !important; margin: 0 !important; width: ${paper.width}; }
        }
      `}</style>

      <div className="invoice-sheet rounded-md border border-slate-200 shadow-sm">
        {/* requirement 2: header — pharmacy identity, always live-fetched, never hardcoded */}
        <div className="mb-2 flex items-start justify-between border-b border-slate-300 pb-2">
          <div className="flex items-center gap-2">
            {template.showLogo && template.logoUrl && <img src={template.logoUrl} alt="Logo" style={{ height: isThermal ? 28 : 48 }} />}
            <div>
              <div className="font-bold" style={{ fontSize: isThermal ? '12px' : '16px' }}>{pharmacy.name || 'Pharmacy'}</div>
              {pharmacy.branchName && <div>{pharmacy.branchName}</div>}
              <div>{pharmacy.address}</div>
              <div>{[pharmacy.phone, pharmacy.email].filter(Boolean).join(' | ')}</div>
              <div>GSTIN: {pharmacy.gstin || 'Not configured'}</div>
              {template.showDrugLicense && pharmacy.drugLicenseNumber && <div>Drug Lic: {pharmacy.drugLicenseNumber}</div>}
            </div>
          </div>
          <div className="text-right">
            <div className="font-bold">{invoice.title}</div>
            <div>Invoice #: {invoice.invoiceNumber}</div>
            <div>Date: {new Date(invoice.invoiceDate).toLocaleString()}</div>
            <div>FY: {invoice.financialYear}</div>
            <div>Payment: {invoice.paymentMode}</div>
          </div>
        </div>

        {/* requirement 3: patient/customer section */}
        {template.showPatientSection && (
          <div className="mb-2 border-b border-slate-200 pb-2">
            <div>Customer: {customer.name} {customer.mobile ? `(${customer.mobile})` : ''}</div>
            {customer.gstin && <div>Customer GSTIN: {customer.gstin}</div>}
            {template.showDoctorSection && doctor && (
              <div>
                Doctor: {doctor.name || '—'} {doctor.registrationNumber ? `(Reg. ${doctor.registrationNumber})` : ''}
                {doctor.prescriptionReference && ` | Rx Ref: ${doctor.prescriptionReference}`}
              </div>
            )}
          </div>
        )}

        {/* requirement 4: medicine table */}
        <table className="invoice-table mb-2">
          <thead>
            <tr>
              <th>Product</th>
              <th>Qty</th>
              {!isThermal && <th>Batch</th>}
              {!isThermal && <th>Exp</th>}
              <th>MRP</th>
              <th>GST%</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.srNo}>
                <td>
                  {it.medicineName}
                  {it.returnedQuantity > 0 && <span className="ml-1 text-red-600">(Returned {it.returnedQuantity})</span>}
                </td>
                <td>{it.quantity}{it.freeQuantity ? `+${it.freeQuantity}F` : ''}</td>
                {!isThermal && <td>{it.batchNumber}</td>}
                {!isThermal && <td>{new Date(it.expiryDate).toLocaleDateString('en-IN', { month: '2-digit', year: '2-digit' })}</td>}
                <td>{inr(it.mrp)}</td>
                <td>{it.gstRate}%</td>
                <td>{inr(it.totalAmount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* requirement 5: sales return marker */}
        {hasReturns && (
          <div className="mb-2 rounded border border-red-200 bg-red-50 p-2 text-red-700">
            <div className="font-semibold">Sales Return Applied</div>
            {salesReturns.map((r) => (
              <div key={r.returnNumber}>
                {r.returnNumber} ({new Date(r.returnDate).toLocaleDateString()}): -{inr(r.totalRefundAmount)} {r.reason ? `— ${r.reason}` : ''}
              </div>
            ))}
          </div>
        )}

        {/* requirement 6 & 7: GST summary + totals */}
        <div className="ml-auto w-full max-w-xs border-t border-slate-300 pt-2 text-right">
          <div>Subtotal: {inr(totals.subtotal)}</div>
          <div>Discount: -{inr(totals.totalDiscount)}</div>
          {invoice.taxType === 'INTER_STATE' ? (
            <div>IGST: {inr(totals.igst)}</div>
          ) : (
            <>
              <div>CGST: {inr(totals.cgst)}</div>
              <div>SGST: {inr(totals.sgst)}</div>
            </>
          )}
          <div>Round Off: {inr(totals.roundOff)}</div>
          {hasReturns && <div>Returns: -{inr(totals.totalReturnAmount)}</div>}
          <div className="text-base font-bold">Grand Total: {inr(hasReturns ? totals.netAmount : totals.grandTotal)}</div>
          <div>Paid: {inr(totals.paidAmount)}</div>
          {totals.outstandingAmount > 0 && <div className="text-red-600">Due: {inr(totals.outstandingAmount)}</div>}
        </div>

        <div className="mt-2 border-t border-slate-200 pt-2 text-xs italic">{totals.amountInWords}</div>

        {/* requirement 8: QR — real payload, never copied from any reference image */}
        {qr && (
          <div className="mt-2 text-xs">
            <div className="font-medium">Scan to pay via UPI:</div>
            <div className="break-all text-slate-500">{qr.payload}</div>
            <div className="text-slate-400">(Rendering this as a scannable QR image needs a QR-code library added to the frontend — see PHASE11_REPORT.md.)</div>
          </div>
        )}

        {/* requirement 9: footer */}
        <div className="mt-3 border-t border-slate-200 pt-2 text-xs text-slate-500">
          {template.termsAndConditions && <div>{template.termsAndConditions}</div>}
          {template.returnPolicy && <div>{template.returnPolicy}</div>}
          {template.customerCareText && <div>{template.customerCareText}</div>}
          {template.footerMessage && <div className="mt-1 font-medium">{template.footerMessage}</div>}
        </div>
      </div>
    </div>
  );
}
