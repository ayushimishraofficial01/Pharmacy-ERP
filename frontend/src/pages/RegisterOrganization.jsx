import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button, ErrorBanner } from '../components/ui';

const FIELDS = [
  ['organizationName', 'Organization / Pharmacy name'],
  ['branchName', 'Main branch name'],
  ['adminName', 'Your name'],
  ['email', 'Email'],
  ['phone', 'Phone'],
  ['password', 'Password'],
];

export default function RegisterOrganization() {
  const { registerOrganization } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await registerOrganization(form);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 py-10">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="mb-4 text-lg font-semibold text-brand-700">Set up your pharmacy</h1>
        <ErrorBanner message={error} />
        {FIELDS.map(([key, label]) => (
          <div key={key} className="mb-3">
            <label className="mb-1 block text-sm font-medium text-slate-600">{label}</label>
            <input
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              type={key === 'password' ? 'password' : key === 'email' ? 'email' : 'text'}
              value={form[key] || ''}
              onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              required={key !== 'phone'}
            />
          </div>
        ))}
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? 'Setting up…' : 'Create organization'}
        </Button>
        <p className="mt-4 text-center text-sm text-slate-500">
          Already set up?{' '}
          <Link to="/login" className="text-brand-600 hover:underline">
            Log in
          </Link>
        </p>
      </form>
    </div>
  );
}
