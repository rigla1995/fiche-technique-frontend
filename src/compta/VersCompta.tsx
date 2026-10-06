import { useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { adresseCompta } from './produit';
import { allerVers } from './passage';

// Sur app. (LabFlow), un compte « comptable » n'a rien à voir : il passe sur LabFlow Compta sans ressaisir son mot de
// passe (étape S3a, code de passage) ; sa session de LabFlow est fermée juste avant de partir. Si le passage échoue, il
// est envoyé vers la connexion de LabFlow Compta (comportement de l'étape S2b).
export default function VersCompta() {
  const { logout } = useAuth();
  const parti = useRef(false);
  useEffect(() => {
    // Un seul passage, même si la page se redessine (logout change à chaque rendu du contexte).
    if (parti.current) return;
    parti.current = true;
    allerVers('compta', logout).catch(() => {
      logout();
      window.location.replace(`${adresseCompta()}/login`);
    });
  }, [logout]);
  return (
    <div className="page-loading" style={{ flexDirection: 'column', gap: 14 }}>
      <div className="spinner" />
      <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>Votre compte est un compte LabFlow Compta : redirection…</p>
    </div>
  );
}
