import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
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

const fieldLabel: React.CSSProperties = { display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#475569', marginBottom: 7, letterSpacing: '0.02em' };
const fieldIcon: React.CSSProperties = { position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', display: 'flex', pointerEvents: 'none' };
const fieldInput: React.CSSProperties = { width: '100%', padding: '13px 14px 13px 42px', borderRadius: 12, border: '1.5px solid #e5e7eb', fontSize: '0.93rem', background: '#f8fafc', color: '#0f172a', outline: 'none', transition: 'border-color 0.15s, background 0.15s, box-shadow 0.15s' };
const onFieldFocus = (e: React.FocusEvent<HTMLInputElement>) => { e.currentTarget.style.borderColor = '#6366f1'; e.currentTarget.style.background = '#fff'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.12)'; };
const onFieldBlur = (e: React.FocusEvent<HTMLInputElement>) => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.boxShadow = 'none'; };

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
        navigate('/client/dashboard', { replace: true });
      } else if (loggedUser.role === 'super_admin') {
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
    <div className="login-page">
      {/* Brand panel */}
      <div className="login-panel-brand">
        <div className="login-brand-content">

          <div className="login-logo-hero">
            <LabFlowLogo height={80} variant="dark" />
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

          <div style={{ marginBottom: 26 }}>
            <LabFlowLogo height={30} variant="dark" />
          </div>

          <h2 style={{ fontSize: '1.75rem', fontWeight: 900, color: '#0f172a', margin: '0 0 6px', letterSpacing: '-0.6px' }}>Bon retour&nbsp;👋</h2>
          <p style={{ color: '#64748b', fontSize: '0.9rem', margin: '0 0 28px' }}>Connectez-vous à votre espace LabFlow.</p>

          <form onSubmit={handleSubmit}>
            {justActivated && !error && (
              <div style={{ marginBottom: 20, background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#047857', borderRadius: 10, padding: '11px 14px', fontSize: '0.86rem', fontWeight: 600 }}>
                ✅ Compte activé ! Saisissez votre mot de passe pour vous connecter.
              </div>
            )}
            {justReset && !error && (
              <div style={{ marginBottom: 20, background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#047857', borderRadius: 10, padding: '11px 14px', fontSize: '0.86rem', fontWeight: 600 }}>
                ✅ Mot de passe modifié ! Connectez-vous avec votre nouveau mot de passe.
              </div>
            )}
            {error && (
              <div className="alert alert-error" style={{ marginBottom: 20 }}>
                ⚠️ {error}
              </div>
            )}

            <div style={{ marginBottom: 16 }}>
              <label htmlFor="email" style={fieldLabel}>Adresse email</label>
              <div style={{ position: 'relative' }}>
                <span style={fieldIcon}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/>
                  </svg>
                </span>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  placeholder="votre@email.com"
                  style={fieldInput}
                  onFocus={onFieldFocus}
                  onBlur={onFieldBlur}
                />
              </div>
            </div>

            <div style={{ marginBottom: 22 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <label htmlFor="password" style={fieldLabel}>Mot de passe</label>
                <Link to="/forgot-password" style={{ fontSize: '0.74rem', fontWeight: 700, color: '#4338ca', textDecoration: 'none', marginBottom: 7 }}>
                  Mot de passe oublié&nbsp;?
                </Link>
              </div>
              <div style={{ position: 'relative' }}>
                <span style={fieldIcon}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                </span>
                <input
                  ref={pwdRef}
                  id="password"
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  style={{ ...fieldInput, paddingRight: 44 }}
                  onFocus={onFieldFocus}
                  onBlur={onFieldBlur}
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
