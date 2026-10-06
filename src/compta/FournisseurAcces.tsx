import { useCallback, useEffect, useState } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { ContexteAcces, type AccesCompta } from './accesCompta';

// Fournisseur des accès de la personne connectée (accesCompta.ts) : lus une fois pour toute la mise en page de LabFlow
// Compta, relus sur demande (recharger).
export function AccesComptaProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [acces, setAcces] = useState<AccesCompta | null>(null);
  const [erreur, setErreur] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!user?.id) return;
    let annule = false;
    api.get('/api/compta/acces')
      .then(({ data }) => { if (!annule) { setAcces(data as AccesCompta); setErreur(false); } })
      .catch(() => { if (!annule) setErreur(true); });
    return () => { annule = true; };
  }, [user?.id, version]);

  const recharger = useCallback(() => setVersion((v) => v + 1), []);
  return <ContexteAcces.Provider value={{ acces, erreur, recharger }}>{children}</ContexteAcces.Provider>;
}
