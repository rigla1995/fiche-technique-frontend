import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import LabFlowLogo from '../common/LabFlowLogo';

const FEATURES = [
  { icon: '🧾', label: 'Fiches techniques' },
  { icon: '📦', label: 'Stocks & inventaire' },
  { icon: '🛒', label: 'Module vente' },
  { icon: '🤖', label: 'Agent IA' },
];

const STATS = [
  { num: '3×', label: 'plus rapide' },
  { num: '−30%', label: 'de gaspillage' },
  { num: '100%', label: 'en ligne' },
];

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const prefill = (location.state as { email?: string; activated?: boolean } | null) || {};
  const [email, setEmail] = useState(prefill.email || '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [justActivated] = useState(!!prefill.activated);
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
        navigate('/client/gerant-dashboard', { replace: true });
      } else if (loggedUser.role === 'super_admin') {
        navigate('/admin', { replace: true });
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
    <div className="login-page">
      {/* Brand panel */}
      <div className="login-panel-brand">
        <div className="login-brand-content">

          <div className="login-logo-hero">
            <LabFlowLogo height={80} />
          </div>

          <h1 className="login-brand-headline">
            Pilotez votre cuisine.<br />
            <span className="login-brand-headline-accent">L'IA fait le reste.</span>
          </h1>

          <div className="login-feat-grid">
            {FEATURES.map(({ icon, label }) => (
              <div key={label} className="login-feat-chip">
                <span className="login-feat-chip-icon">{icon}</span>
                <span>{label}</span>
              </div>
            ))}
          </div>

          <div className="login-stats-row">
            {STATS.map(({ num, label }, i) => (
              <div key={num} style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                {i > 0 && <div className="login-stat-sep" />}
                <div className="login-stat">
                  <span className="login-stat-num">{num}</span>
                  <span className="login-stat-label">{label}</span>
                </div>
              </div>
            ))}
          </div>

        </div>
      </div>

      {/* Form panel */}
      <div className="login-panel-form">
        <div className="login-form-inner">

          <div className="login-form-logo">
            <LabFlowLogo height={34} variant="dark" />
          </div>

          <div className="login-form-heading">Connexion</div>
          <p className="login-form-subheading">Accédez à votre espace de gestion</p>

          <form onSubmit={handleSubmit}>
            {justActivated && !error && (
              <div style={{ marginBottom: 20, background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#047857', borderRadius: 10, padding: '11px 14px', fontSize: '0.86rem', fontWeight: 600 }}>
                ✅ Compte activé ! Saisissez votre mot de passe pour vous connecter.
              </div>
            )}
            {error && (
              <div className="alert alert-error" style={{ marginBottom: 20 }}>
                ⚠️ {error}
              </div>
            )}

            <div className="form-group">
              <label htmlFor="email">Adresse email</label>
              <input
                id="email"
                type="email"
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="votre@email.com"
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Mot de passe</label>
              <div className="login-pwd-wrap">
                <input
                  ref={pwdRef}
                  id="password"
                  type={showPwd ? 'text' : 'password'}
                  className="input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  style={{ paddingRight: 44 }}
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

          <p className="login-footer-note">Accès réservé aux utilisateurs autorisés</p>
        </div>
      </div>
    </div>
  );
}
