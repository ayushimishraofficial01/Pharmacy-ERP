import { useEffect, useState } from 'react';
import { whatsapp, medicines as medicinesApi } from '../api/endpoints';
import { inr } from '../api/client';
import { Card, Table, Button, ErrorBanner } from '../components/ui';

export default function WhatsAppOrders() {
  const [list, setList] = useState([]);
  const [medicines, setMedicines] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ customerName: '', phoneNumber: '', orderType: 'DELIVERY', medicine: '', quantity: 1, sellingPrice: 0, gst: 0, deliveryCharge: 0, deliveryAddress: '', orderNotes: '' });
  const [error, setError] = useState('');

  function reload() {
    whatsapp
      .listOrders()
      .then(setList)
      .catch((err) => setError(err.response?.data?.message || 'Failed to load orders'));
  }
  useEffect(reload, []);
  useEffect(() => { medicinesApi.list().then(setMedicines).catch(() => {}); }, []);

  async function createOrder(e) {
    e.preventDefault();
    setError('');
    const medicine = medicines.find((item) => item._id === form.medicine);
    const quantity = Number(form.quantity);
    const sellingPrice = Number(form.sellingPrice);
    const gst = Number(form.gst);
    try {
      await whatsapp.createOrder({
        customerName: form.customerName,
        phoneNumber: form.phoneNumber,
        orderType: form.orderType,
        deliveryCharge: Number(form.deliveryCharge),
        deliveryAddress: form.deliveryAddress,
        orderNotes: form.orderNotes,
        items: [{ medicine: form.medicine, quantity, mrp: sellingPrice, sellingPrice, gst, finalPrice: sellingPrice * quantity + gst * quantity }],
      });
      setForm({ customerName: '', phoneNumber: '', orderType: 'DELIVERY', medicine: '', quantity: 1, sellingPrice: 0, gst: 0, deliveryCharge: 0, deliveryAddress: '', orderNotes: '' });
      setShowForm(false);
      reload();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create WhatsApp order');
    }
  }

  async function convert(id) {
    setError('');
    try {
      await whatsapp.convert(id);
      reload();
    } catch (err) {
      setError(err.response?.data?.message || 'Conversion failed');
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">WhatsApp Orders</h1>
        <Button onClick={() => setShowForm((v) => !v)}>{showForm ? 'Cancel' : '+ Add Order'}</Button>
      </div>
      <ErrorBanner message={error} />
      {showForm && (
        <Card title="New WhatsApp Order" className="mb-4">
          <form onSubmit={createOrder} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <input className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" placeholder="Customer name" value={form.customerName} onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))} required />
            <input className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" placeholder="Phone number" value={form.phoneNumber} onChange={(e) => setForm((f) => ({ ...f, phoneNumber: e.target.value }))} required />
            <select className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" value={form.orderType} onChange={(e) => setForm((f) => ({ ...f, orderType: e.target.value }))}>
              <option value="DELIVERY">DELIVERY</option><option value="PICKUP">PICKUP</option><option value="STORE_COUNTER">STORE_COUNTER</option>
            </select>
            <select className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" value={form.medicine} onChange={(e) => setForm((f) => ({ ...f, medicine: e.target.value }))} required>
              <option value="">Medicine…</option>{medicines.map((m) => <option key={m._id} value={m._id}>{m.name}</option>)}
            </select>
            <input type="number" min="1" className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" placeholder="Quantity" value={form.quantity} onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))} required />
            <input type="number" min="0" step="0.01" className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" placeholder="Selling price" value={form.sellingPrice} onChange={(e) => setForm((f) => ({ ...f, sellingPrice: e.target.value }))} required />
            <input type="number" min="0" step="0.01" className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" placeholder="GST per item" value={form.gst} onChange={(e) => setForm((f) => ({ ...f, gst: e.target.value }))} />
            <input type="number" min="0" step="0.01" className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" placeholder="Delivery charge" value={form.deliveryCharge} onChange={(e) => setForm((f) => ({ ...f, deliveryCharge: e.target.value }))} />
            <input className="col-span-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" placeholder="Delivery address" value={form.deliveryAddress} onChange={(e) => setForm((f) => ({ ...f, deliveryAddress: e.target.value }))} />
            <input className="col-span-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" placeholder="Order notes" value={form.orderNotes} onChange={(e) => setForm((f) => ({ ...f, orderNotes: e.target.value }))} />
            <div className="col-span-full"><Button type="submit">Create WhatsApp Order</Button></div>
          </form>
        </Card>
      )}
      <Card>
        <Table
          columns={[
            { key: 'orderNumber', label: 'Order #' },
            { key: 'customerName', label: 'Customer' },
            { key: 'phoneNumber', label: 'Phone' },
            { key: 'grandTotal', label: 'Total', render: (r) => inr(r.grandTotal) },
            { key: 'orderStatus', label: 'Status' },
            {
              key: 'actions',
              label: '',
              render: (r) =>
                r.orderStatus === 'CONFIRMED' && !r.sale ? (
                  <Button variant="secondary" onClick={() => convert(r._id)}>
                    Convert to Sale
                  </Button>
                ) : r.sale ? (
                  <span className="text-xs text-slate-400">Converted</span>
                ) : null,
            },
          ]}
          rows={list}
        />
      </Card>
    </div>
  );
}
