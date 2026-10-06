import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { adresseCompta } from './produit';

// Sur app. (LabFlow), un compte « comptable » n'a rien à voir (étape S2b) : sa session de LabFlow est fermée et il est
// envoyé vers la connexion de LabFlow Compta (la session est gardée par adresse ; le passage sans ressaisie viendra à
// l'étape S3). Sans cela, l'accueil de LabFlow tournerait sans fin.
export default function VersCompta() {
  const { logout } = useAuth();
  useEffect(() => {
    logout();
    window.location.replace(`${adresseCompta()}/login`);
  }, [logout]);
  return (
    <div className="page-loading" style={{ flexDirection: 'column', gap: 14 }}>
      <div className="spinner" />
      <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>Votre compte est un compte LabFlow Compta : redirection…</p>
    </div>
  );
}
