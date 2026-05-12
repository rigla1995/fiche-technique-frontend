import { useState, useEffect } from 'react';
import api from '../api/client';

export function useEmailCheck(email: string, excludeId?: string | number) {
  const [exists, setExists] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) { setExists(false); return; }

    setChecking(true);
    const timer = setTimeout(async () => {
      try {
        const params: Record<string, string> = { email };
        if (excludeId) params.excludeId = String(excludeId);
        const { data } = await api.get('/api/auth/check-email', { params });
        setExists(data.exists);
      } catch { setExists(false); }
      finally { setChecking(false); }
    }, 400);

    return () => clearTimeout(timer);
  }, [email, excludeId]);

  return { emailExists: exists, emailChecking: checking };
}
