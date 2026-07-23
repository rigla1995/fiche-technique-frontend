import React, { createContext, useContext, useState, useEffect } from 'react';
import { flushSync } from 'react-dom';
import type { User } from '../types';
import api from '../api/client';

interface AuthContextType {
  user: User | null;
  token: string | null;
  canWrite: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => void;
  updateUser: (patch: Partial<User>) => void;
  advanceOnboarding: (step: number) => Promise<void>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (storedToken) {
      setToken(storedToken);
      // Always refresh from server so onboardingStep is never stale
      api.get('/auth/me')
        .then(({ data }) => {
          setUser(data);
          localStorage.setItem('user', JSON.stringify(data));
        })
        .catch(() => {
          setToken(null);
          localStorage.removeItem('token');
          localStorage.removeItem('user');
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, []);

  // Rafraîchit le user (dont activitesCount) quand les activités/labos changent —
  // pour que les redirections (logo, home) restent dynamiques sans recharger la page.
  useEffect(() => {
    if (!token) return;
    const refresh = () => api.get('/auth/me')
      .then(({ data }) => { setUser(data); localStorage.setItem('user', JSON.stringify(data)); })
      .catch(() => {});
    window.addEventListener('activites-changed', refresh);
    window.addEventListener('labos-changed', refresh);
    // 'auth-refresh' : émis par l'intercepteur axios quand le backend signale un
    // droit révoqué (ex. accès acheteurs d'un gérant) — resynchronise le user.
    window.addEventListener('auth-refresh', refresh);
    return () => {
      window.removeEventListener('activites-changed', refresh);
      window.removeEventListener('labos-changed', refresh);
      window.removeEventListener('auth-refresh', refresh);
    };
  }, [token]);

  const login = async (email: string, password: string): Promise<User> => {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    flushSync(() => {
      setToken(data.token);
      setUser(data.user);
    });
    return data.user as User;
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  };

  const updateUser = (patch: Partial<User>) => {
    setUser((u) => {
      if (!u) return u;
      const updated = { ...u, ...patch };
      localStorage.setItem('user', JSON.stringify(updated));
      return updated;
    });
  };

  const advanceOnboarding = async (step: number) => {
    await api.post('/auth/onboarding-step', { step });
    updateUser({ onboardingStep: step });
  };

  const canWrite = user !== null && (user.role === 'super_admin' || user.role === 'boss' || (user.modeCompte ?? 'actif') === 'actif');

  return (
    <AuthContext.Provider value={{ user, token, canWrite, login, logout, updateUser, advanceOnboarding, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
