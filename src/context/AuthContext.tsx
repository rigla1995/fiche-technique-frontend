import React, { createContext, useContext, useState, useEffect } from 'react';
import type { User } from '../types';
import api from '../api/client';

interface AuthContextType {
  user: User | null;
  token: string | null;
  canWrite: boolean;
  login: (email: string, password: string) => Promise<void>;
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

  const login = async (email: string, password: string) => {
    const { data } = await api.post('/auth/login', { email, password });
    setToken(data.token);
    setUser(data.user);
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
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

  const canWrite = user !== null && (user.role === 'super_admin' || (user.modeCompte ?? 'actif') === 'actif');

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
