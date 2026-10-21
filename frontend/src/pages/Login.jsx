import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button, ErrorBanner } from '../components/ui';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="mb-4 text-lg font-semibold text-brand-700">Pharmacy ERP — Log in</h1>
        <ErrorBanner message={error} />
        <label className="mb-1 block text-sm font-medium text-slate-600">Email</label>
        <input className="mb-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <label className="mb-1 block text-sm font-medium text-slate-600">Password</label>
        <input className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? 'Logging in…' : 'Log in'}
        </Button>
        <p className="mt-4 text-center text-sm text-slate-500">
          New organization?{' '}
          <Link to="/register" className="text-brand-600 hover:underline">
            Register here
          </Link>
        </p>
      </form>
    </div>
  );
}
