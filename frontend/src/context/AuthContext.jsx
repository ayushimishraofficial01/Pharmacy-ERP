import { createContext, useContext, useEffect, useState } from 'react';
import { auth as authApi } from '../api/endpoints';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem('pharmacy_erp_user');
    const storedUser = raw ? JSON.parse(raw) : null;
    if (storedUser?.branchId && !localStorage.getItem('pharmacy_erp_active_branch')) {
      localStorage.setItem('pharmacy_erp_active_branch', storedUser.branchId);
    }
    return storedUser;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('pharmacy_erp_token');
    if (!token) {
      setLoading(false);
      return;
    }
    authApi
      .me()
      .then(({ user: freshUser }) => {
        setUser(freshUser);
        localStorage.setItem('pharmacy_erp_user', JSON.stringify(freshUser));
        if (freshUser?.branchId) {
          localStorage.setItem('pharmacy_erp_active_branch', freshUser.branchId);
        }
      })
      .catch(() => {
        localStorage.removeItem('pharmacy_erp_token');
        localStorage.removeItem('pharmacy_erp_user');
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  function persistSession({ token, user: sessionUser, branch }) {
    localStorage.setItem('pharmacy_erp_token', token);
    localStorage.setItem('pharmacy_erp_user', JSON.stringify(sessionUser));
    const activeBranchId = branch?._id || sessionUser?.branchId;
    if (activeBranchId) localStorage.setItem('pharmacy_erp_active_branch', activeBranchId);
    setUser(sessionUser);
  }

  async function login(email, password) {
    const { token, user: loggedInUser } = await authApi.login({ email, password });
    persistSession({ token, user: loggedInUser });
    return loggedInUser;
  }

  async function registerOrganization(payload) {
    const { token, user: newUser, branch } = await authApi.registerOrganization(payload);
    persistSession({ token, user: newUser, branch });
    return newUser;
  }

  async function logout() {
    try {
      await authApi.logout();
    } catch {
      // Best-effort — clear the local session regardless of server response.
    }
    localStorage.removeItem('pharmacy_erp_token');
    localStorage.removeItem('pharmacy_erp_user');
    localStorage.removeItem('pharmacy_erp_active_branch');
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, registerOrganization, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
