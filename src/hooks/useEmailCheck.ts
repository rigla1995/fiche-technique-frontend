import { useState, useEffect } from 'react';
import api from '../api/client';

export function useEmailCheck(email: string, excludeId?: string | number) {
  const [exists, setExists] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkFailed, setCheckFailed] = useState(false);

  useEffect(() => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      setExists(false); setChecking(false); setCheckFailed(false); return;
    }

    setChecking(true);
    setCheckFailed(false);
    const timer = setTimeout(async () => {
      try {
        const params: Record<string, string> = { email };
        if (excludeId) params.excludeId = String(excludeId);
        const { data } = await api.get('/auth/check-email', { params });
        setExists(data.exists);
        setCheckFailed(false);
      } catch {
        // API failure — treat as "unknown", block the user rather than silently allowing through
        setExists(false);
        setCheckFailed(true);
      } finally { setChecking(false); }
    }, 400);

    return () => clearTimeout(timer);
  }, [email, excludeId]);

  return { emailExists: exists, emailChecking: checking, emailCheckFailed: checkFailed };
}
