import { Link, useParams } from 'react-router-dom';
import { AuthShell } from '../../components/auth/AuthShell';

// Page d'erreur de la coquille LabFlow Compta (l'intercepteur de l'API redirige les erreurs 403 / 500 / 503 vers
// /error/<code>, comme dans LabFlow).
const MESSAGES: Record<string, string> = {
  '403': "Cette page ne vous est pas accessible.",
  '500': 'Une erreur est survenue sur le serveur. Réessayez dans un instant.',
  '503': 'Le service est momentanément indisponible. Réessayez dans un instant.',
};

export default function ComptaErreur() {
  const { code = '' } = useParams();
  return (
    <AuthShell>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#F2F4FF', margin: '0 0 10px' }}>Erreur {code}</h1>
        <p style={{ color: '#A6ACC4', fontSize: '0.88rem', margin: '0 0 22px', lineHeight: 1.55 }}>
          {MESSAGES[code] || 'Une erreur est survenue.'}
        </p>
        <Link to="/" style={{ color: '#A5B4FC', fontWeight: 700, fontSize: '0.88rem', textDecoration: 'none' }}>← Retour à l'accueil</Link>
      </div>
    </AuthShell>
  );
}
