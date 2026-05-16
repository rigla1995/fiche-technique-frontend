import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      if (msg === 'invite_pending') {
        setError('Votre compte n\'est pas encore activé. Consultez votre email d\'invitation.');
      } else {
        setError('Identifiants incorrects. Vérifiez votre email et mot de passe.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      {/* Brand panel */}
      <div className="login-panel-brand">
        <div className="login-brand-content">
          <span className="login-brand-icon">🍽️</span>
          <div className="login-brand-title">LabFlow</div>
          <p className="login-brand-sub">
            La plateforme de gestion pour les professionnels de la restauration.
          </p>
          <div className="login-feature-list">
            {[
              'Fiches techniques précises et rentables',
              'Gestion du stock en temps réel',
              'Suivi multi-activités et labos',
              'Rapports et analyses avancés',
            ].map((f) => (
              <div key={f} className="login-feature">
                <span className="login-feature-dot" />
                <span>{f}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Form panel */}
      <div className="login-panel-form">
        <div className="login-form-inner">
          <div className="login-form-heading">Connexion</div>
          <p className="login-form-subheading">Accédez à votre espace de gestion</p>

          <form onSubmit={handleSubmit}>
            {error && (
              <div className="alert alert-error" style={{ marginBottom: 20 }}>
                ⚠️ {error}
              </div>
            )}

            <div className="form-group">
              <label htmlFor="email">Adresse email</label>
              <div className="login-input-wrap">
                <span className="login-input-icon">📧</span>
                <input
                  id="email"
                  type="email"
                  className="input login-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  placeholder="votre@email.com"
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="password">Mot de passe</label>
              <div className="login-input-wrap">
                <span className="login-input-icon">🔑</span>
                <input
                  id="password"
                  type={showPwd ? 'text' : 'password'}
                  className="input login-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  style={{ paddingRight: 44 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(v => !v)}
                  style={{
                    position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem',
                    color: 'var(--text-muted)', padding: 4,
                  }}
                  tabIndex={-1}
                >
                  {showPwd ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-full login-submit"
              disabled={loading}
            >
              {loading ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
                  Connexion…
                </span>
              ) : (
                '→  Se connecter'
              )}
            </button>
          </form>

          <p className="login-footer-note">
            Accès réservé aux utilisateurs autorisés
          </p>
        </div>
      </div>
    </div>
  );
}
