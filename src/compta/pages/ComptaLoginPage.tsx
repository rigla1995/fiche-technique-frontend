import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { AuthShell, authInput, authLabel, authSubmit, authErrorBox, onAuthFocus, onAuthBlur } from '../../components/auth/AuthShell';
import { destinationApresConnexion } from '../passage';

// Connexion à LabFlow Compta (SPEC-SOCLE, étape S1) : même compte, même mot de passe que LabFlow ; la coquille Compta
// garde sa propre session (une session par adresse). Après connexion : l'accueil « Vos comptabilités ».
export default function ComptaLoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const prefill = (location.state as { email?: string; activated?: boolean; reset?: boolean } | null) || {};
  const [email, setEmail] = useState(prefill.email || '');
  const [password, setPassword] = useState('');
  const [voir, setVoir] = useState(false);
  const [erreur, setErreur] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const pwdRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (prefill.email && pwdRef.current) pwdRef.current.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const valider = async (e: React.FormEvent) => {
    e.preventDefault();
    if (envoi) return;
    setErreur('');
    setEnvoi(true);
    try {
      const u = await login(email, password);
      // S3a (D11bis) : un client ou un gérant qui a aussi une comptabilité choisit son espace.
      navigate((await destinationApresConnexion(u.role)) || '/', { replace: true });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setErreur(msg === 'invite_pending'
        ? "Votre compte n'est pas encore activé. Consultez votre email d'invitation."
        : 'Identifiants incorrects. Vérifiez votre email et votre mot de passe.');
    } finally {
      setEnvoi(false);
    }
  };

  const bloque = envoi || !email || !password;

  return (
    <AuthShell>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#F2F4FF', margin: '0 0 6px', letterSpacing: '-0.01em' }}>
          Connexion
        </h1>
        <p style={{ color: '#A6ACC4', fontSize: '0.87rem', margin: 0, lineHeight: 1.55 }}>
          Accédez à vos comptabilités.
        </p>
      </div>

      {prefill.activated && (
        <div style={{ ...authErrorBox, background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(74,222,128,0.4)', color: '#86EFAC' }}>
          ✓ Compte activé. Connectez-vous avec votre nouveau mot de passe.
        </div>
      )}
      {prefill.reset && (
        <div style={{ ...authErrorBox, background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(74,222,128,0.4)', color: '#86EFAC' }}>
          ✓ Mot de passe modifié. Connectez-vous avec le nouveau.
        </div>
      )}

      <form onSubmit={valider}>
        <div style={{ marginBottom: 16 }}>
          <label htmlFor="compta-email" style={authLabel}>Adresse email</label>
          <input id="compta-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
            autoComplete="email" placeholder="votre@email.com" style={authInput} onFocus={onAuthFocus} onBlur={onAuthBlur}
            autoFocus={!prefill.email} />
        </div>
        <div style={{ marginBottom: 8 }}>
          <label htmlFor="compta-mdp" style={authLabel}>Mot de passe</label>
          <div style={{ position: 'relative' }}>
            <input id="compta-mdp" ref={pwdRef} type={voir ? 'text' : 'password'} value={password}
              onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password"
              style={{ ...authInput, paddingRight: 64 }} onFocus={onAuthFocus} onBlur={onAuthBlur} />
            <button type="button" onClick={() => setVoir((v) => !v)} aria-label={voir ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
              style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#A6ACC4', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer' }}>
              {voir ? 'Masquer' : 'Afficher'}
            </button>
          </div>
        </div>
        <p style={{ textAlign: 'right', margin: '0 0 18px' }}>
          <Link to="/forgot-password" style={{ color: '#A5B4FC', fontWeight: 600, fontSize: '0.8rem', textDecoration: 'none' }}>Mot de passe oublié ?</Link>
        </p>
        {erreur && <div style={authErrorBox}>{erreur}</div>}
        <button type="submit" disabled={bloque} style={authSubmit(bloque)}>
          {envoi ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>
    </AuthShell>
  );
}
