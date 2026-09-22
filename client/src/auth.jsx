import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading'); // 'loading' | 'out' | 'in'

  const boot = useCallback(async () => {
    try {
      const { user } = await api.get('/auth/me');
      setUser(user);
      setStatus('in');
    } catch {
      setUser(null);
      setStatus('out');
    }
  }, []);

  useEffect(() => {
    boot();
  }, [boot]);

  const login = useCallback(async (email, password) => {
    const { user } = await api.post('/auth/login', { email, password });
    setUser(user);
    setStatus('in');
    return user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      /* ignore */
    }
    setUser(null);
    setStatus('out');
  }, []);

  const refresh = useCallback(async () => {
    try {
      const { user } = await api.get('/auth/me');
      setUser(user);
      setStatus('in');
    } catch {
      setUser(null);
      setStatus('out');
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, status, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}