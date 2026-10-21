// Adapted from Phase 6's client.js pattern (the cleanest of the phase
// frontends) — same interceptor approach, extended to inject the
// X-Branch-Id header the backend's requireBranch middleware expects for
// SUPER_ADMIN users acting across branches.
import axios from 'axios';

// In dev, Vite's proxy (vite.config.js) forwards '/api' to the backend, so
// the default relative path works with no configuration. In a Docker/prod
// build there's no dev server to proxy through, so VITE_API_BASE_URL (set
// at build time — see frontend/Dockerfile and docker-compose.yml) points
// straight at the backend's real URL instead.
const client = axios.create({ baseURL: import.meta.env.VITE_API_BASE_URL || '/api' });

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('pharmacy_erp_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  const branchId = localStorage.getItem('pharmacy_erp_active_branch');
  if (branchId) config.headers['X-Branch-Id'] = branchId;
  return config;
});

client.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('pharmacy_erp_token');
      localStorage.removeItem('pharmacy_erp_user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default client;

export function inr(amount) {
  const n = Number(amount || 0);
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

// Every backend call surfaces { success, message, data } or throws with
// err.response.data.message — this pulls just the data payload so pages
// don't repeat `.data.data` everywhere.
export async function unwrap(promise) {
  const res = await promise;
  return res.data.data;
}
