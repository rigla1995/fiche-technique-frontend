import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import LabFlowLogo from '../common/LabFlowLogo';
import { FlagTN } from './AuthShell';

// Piliers du site vitrine (hero) — pas de chiffres inventés (règles de véracité).
const PILIERS = [
  { icon: '🛒', label: 'Achats' },
  { icon: '📦', label: 'Stock' },
  { icon: '💰', label: 'Ventes' },
  { icon: '📊', label: 'Marges' },
  { icon: '🧑‍🍳', label: 'Recettes' },
  { icon: '🧾', label: 'Factures' },
];

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const prefill = (location.state as { email?: string; activated?: boolean; reset?: boolean } | null) || {};
  const [email, setEmail] = useState(prefill.email || '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [justActivated] = useState(!!prefill.activated);
  const [justReset] = useState(!!prefill.reset);
  const pwdRef = useRef<HTMLInputElement>(null);

  // Si on arrive depuis l'activation avec l'email pré-rempli, on met le focus sur le mot de passe.
  useEffect(() => {
    if (prefill.email && pwdRef.current) pwdRef.current.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const loggedUser = await login(email, password);
      if (loggedUser.role === 'gerant') {
        // Pas de tableau de bord pour un gérant : atterrissage sur le Référentiel
        navigate('/client/referentiel/unites', { replace: true });
      } else if (loggedUser.role === 'super_admin' || loggedUser.role === 'boss') {
        navigate('/admin', { replace: true });
      } else if (loggedUser.role === 'acheteur') {
        navigate('/portail', { replace: true });
      } else {
        navigate('/', { replace: true });
      }
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg === 'invite_pending'
        ? "Votre compte n'est pas encore activé. Consultez votre email d'invitation."
        : 'Identifiants incorrects. Vérifiez votre email et mot de passe.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page auth-nuit">
      {/* ── Panneau de marque : la nuit + l'aurore du site vitrine ── */}
      <div className="login-panel-brand">
        <div className="login-brand-content">

          <LabFlowLogo height={54} variant="light" />

          <div className="login-pastille"><i aria-hidden="true"></i>Achats · Stock · Ventes · Marges</div>

          <h1 className="login-brand-headline">
            Tout votre commerce<br />
            dans <span className="login-brand-headline-accent">un seul écran</span>.
          </h1>

          <p className="login-brand-sub">
            Vous entrez l'achat — <b>le reste se met à jour seul</b>.<br />
            Stock, coût réel et marge se recalculent au moment où vous enregistrez.
          </p>

          <div className="login-feat-grid">
            {PILIERS.map(({ icon, label }) => (
              <div key={label} className="login-feat-chip">
                <span className="login-feat-chip-icon">{icon}</span>
                <span>{label}</span>
              </div>
            ))}
          </div>

          <div className="login-brand-footer">
            <span>Conçu en Tunisie <FlagTN /></span>
            <a href="https://labflow-tn.com" target="_blank" rel="noopener">labflow-tn.com</a>
          </div>

        </div>
      </div>

      {/* ── Panneau formulaire ── */}
      <div className="login-panel-form">
        <div className="login-form-inner">

          <div style={{ marginBottom: 26 }}>
            <LabFlowLogo height={30} variant="light" />
          </div>

          <h2 className="login-form-heading">Bon retour&nbsp;👋</h2>
          <p className="login-form-subheading">Connectez-vous à votre espace LabFlow.</p>

          <form onSubmit={handleSubmit}>
            {justActivated && !error && (
              <div className="auth-alert-ok" style={{ marginBottom: 20 }}>
                ✅ Compte activé ! Saisissez votre mot de passe pour vous connecter.
              </div>
            )}
            {justReset && !error && (
              <div className="auth-alert-ok" style={{ marginBottom: 20 }}>
                ✅ Mot de passe modifié ! Connectez-vous avec votre nouveau mot de passe.
              </div>
            )}
            {error && (
              <div className="auth-alert-err" style={{ marginBottom: 20 }}>
                ⚠️ {error}
              </div>
            )}

            <div style={{ marginBottom: 16 }}>
              <label htmlFor="email" className="auth-label">Adresse email</label>
              <div style={{ position: 'relative' }}>
                <span className="auth-champ-icone">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/>
                  </svg>
                </span>
                <input
                  id="email"
                  type="email"
                  className="auth-champ avec-icone"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  placeholder="votre@email.com"
                />
              </div>
            </div>

            <div style={{ marginBottom: 22 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <label htmlFor="password" className="auth-label">Mot de passe</label>
                <Link to="/forgot-password" style={{ fontSize: '0.74rem', fontWeight: 600, color: '#A5B4FC', textDecoration: 'none', marginBottom: 7 }}>
                  Mot de passe oublié&nbsp;?
                </Link>
              </div>
              <div className="login-pwd-wrap">
                <span className="auth-champ-icone">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                </span>
                <input
                  ref={pwdRef}
                  id="password"
                  type={showPwd ? 'text' : 'password'}
                  className="auth-champ avec-icone"
                  style={{ paddingRight: 44 }}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  className="login-pwd-toggle"
                  onClick={() => setShowPwd(v => !v)}
                  tabIndex={-1}
                  aria-label={showPwd ? 'Masquer' : 'Afficher'}
                >
                  {showPwd ? (
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="login-submit-btn"
              disabled={loading}
            >
              {loading ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                  <span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
                  Connexion…
                </span>
              ) : 'Se connecter'}
            </button>
          </form>

          <div className="login-acces">
            Pas encore de compte&nbsp;?{' '}
            <a href="https://labflow-tn.com/demande-acces.html" target="_blank" rel="noopener">Demander un accès</a>
            <span className="cadeau">🎁 Votre premier mois d'abonnement est offert.</span>
          </div>

          <p className="login-footer-note">Connexion sécurisée · LabFlow</p>
        </div>
      </div>
    </div>
  );
}
