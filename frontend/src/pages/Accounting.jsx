import { useEffect, useState } from 'react';
import { chartOfAccounts, journalEntries } from '../api/endpoints';
import { Card, Table, Button, ErrorBanner } from '../components/ui';

const ACCOUNT_TYPES = ['ASSET', 'LIABILITY', 'INCOME', 'EXPENSE', 'EQUITY'];

export default function Accounting() {
  const [accounts, setAccounts] = useState([]);
  const [entries, setEntries] = useState([]);
  const [error, setError] = useState('');

  const [showAccountForm, setShowAccountForm] = useState(false);
  const [accountForm, setAccountForm] = useState({ code: '', name: '', type: 'EXPENSE' });

  const [showEntryForm, setShowEntryForm] = useState(false);
  const [narration, setNarration] = useState('');
  const [entryLines, setEntryLines] = useState([{ account: '', debit: 0, credit: 0 }]);

  function reload() {
    chartOfAccounts.list().then(setAccounts).catch((err) => setError(err.response?.data?.message || 'Failed to load accounts'));
    journalEntries.list().then(setEntries).catch(() => {});
  }
  useEffect(reload, []);

  async function createAccount(e) {
    e.preventDefault();
    setError('');
    try {
      await chartOfAccounts.create(accountForm);
      setAccountForm({ code: '', name: '', type: 'EXPENSE' });
      setShowAccountForm(false);
      reload();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create account');
    }
  }

  function updateEntryLine(idx, patch) {
    setEntryLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }
  function addEntryLine() {
    setEntryLines((ls) => [...ls, { account: '', debit: 0, credit: 0 }]);
  }

  const totalDebit = entryLines.reduce((s, l) => s + Number(l.debit || 0), 0);
  const totalCredit = entryLines.reduce((s, l) => s + Number(l.credit || 0), 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.01;

  async function createEntry(e) {
    e.preventDefault();
    setError('');
    try {
      await journalEntries.create({ narration, lines: entryLines.map((l) => ({ account: l.account, debit: Number(l.debit) || 0, credit: Number(l.credit) || 0 })) });
      setNarration('');
      setEntryLines([{ account: '', debit: 0, credit: 0 }]);
      setShowEntryForm(false);
      reload();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create journal entry');
    }
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Accounting</h1>
      <ErrorBanner message={error} />

      <Card
        title="Chart of Accounts"
        className="mb-4"
        action={
          <Button variant="secondary" onClick={() => setShowAccountForm((v) => !v)}>
            {showAccountForm ? 'Cancel' : '+ Add Account'}
          </Button>
        }
      >
        {showAccountForm && (
          <form onSubmit={createAccount} className="mb-4 flex items-end gap-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Code</label>
              <input className="w-24 rounded-md border border-slate-300 px-2 py-1.5 text-sm" value={accountForm.code} onChange={(e) => setAccountForm((f) => ({ ...f, code: e.target.value }))} required />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Name</label>
              <input className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" value={accountForm.name} onChange={(e) => setAccountForm((f) => ({ ...f, name: e.target.value }))} required />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Type</label>
              <select className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" value={accountForm.type} onChange={(e) => setAccountForm((f) => ({ ...f, type: e.target.value }))}>
                {ACCOUNT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit">Save</Button>
          </form>
        )}
        <Table columns={[{ key: 'code', label: 'Code' }, { key: 'name', label: 'Name' }, { key: 'type', label: 'Type' }]} rows={accounts} />
      </Card>

      <Card
        title="Journal Entries"
        action={
          <Button variant="secondary" onClick={() => setShowEntryForm((v) => !v)}>
            {showEntryForm ? 'Cancel' : '+ New Entry'}
          </Button>
        }
      >
        {showEntryForm && (
          <form onSubmit={createEntry} className="mb-4">
            <input className="mb-2 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" placeholder="Narration" value={narration} onChange={(e) => setNarration(e.target.value)} />
            {entryLines.map((l, idx) => (
              <div key={idx} className="mb-2 flex items-center gap-2">
                <select className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm" value={l.account} onChange={(e) => updateEntryLine(idx, { account: e.target.value })} required>
                  <option value="">Account…</option>
                  {accounts.map((a) => (
                    <option key={a._id} value={a._id}>
                      {a.code} — {a.name}
                    </option>
                  ))}
                </select>
                <input type="number" placeholder="Debit" className="w-24 rounded-md border border-slate-300 px-2 py-1 text-sm" value={l.debit} onChange={(e) => updateEntryLine(idx, { debit: e.target.value })} />
                <input type="number" placeholder="Credit" className="w-24 rounded-md border border-slate-300 px-2 py-1 text-sm" value={l.credit} onChange={(e) => updateEntryLine(idx, { credit: e.target.value })} />
              </div>
            ))}
            <Button type="button" variant="secondary" onClick={addEntryLine} className="mb-2">
              + Add line
            </Button>
            <div className={`mb-2 text-sm ${balanced ? 'text-slate-500' : 'font-semibold text-red-600'}`}>
              Debit {totalDebit} / Credit {totalCredit} {!balanced && '— must balance before saving'}
            </div>
            <Button type="submit" disabled={!balanced}>
              Save Entry
            </Button>
          </form>
        )}
        <Table
          columns={[
            { key: 'date', label: 'Date', render: (r) => new Date(r.date).toLocaleDateString() },
            { key: 'narration', label: 'Narration' },
            { key: 'lines', label: 'Lines', render: (r) => r.lines.length },
          ]}
          rows={entries}
        />
      </Card>
    </div>
  );
}
