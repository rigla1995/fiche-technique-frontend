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
          <img src="/logo.svg" alt="LabFlow" style={{ height: 56, marginBottom: 12 }} />

          <h1 className="login-brand-headline">
            Pilotez votre restauration.<br />
            <span className="login-brand-headline-accent">L'IA fait le reste.</span>
          </h1>

          <p className="login-brand-sub">
            LabFlow centralise vos fiches techniques, stocks et finances — et intègre un agent IA qui vous conseille, anticipe vos besoins et maximise votre rentabilité au quotidien.
          </p>

          <div className="login-features-grid">
            {[
              { icon: '🧾', title: 'Fiches techniques rentables', desc: 'Coûts précis, marges calculées automatiquement pour chaque plat.' },
              { icon: '📦', title: 'Stock, inventaire & approvisionnement', desc: 'Gérez vos niveaux de stock, effectuez vos inventaires et anticipez les commandes fournisseurs.' },
              { icon: '🛒', title: 'Module vente', desc: 'Suivez vos ventes par activité, analysez vos produits phares et pilotez votre chiffre d\'affaires.' },
              { icon: '🤖', title: 'Agent IA intégré', desc: 'Posez vos questions métier, obtenez des recommandations et optimisez vos achats.' },
              { icon: '📊', title: 'Rapports & analyses', desc: 'Ventes, pertes, tendances : toutes les données pour décider vite et bien.' },
            ].map(({ icon, title, desc }) => (
              <div key={title} className="login-feat-card">
                <span className="login-feat-icon">{icon}</span>
                <div>
                  <div className="login-feat-title">{title}</div>
                  <div className="login-feat-desc">{desc}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="login-stats-row">
            <div className="login-stat">
              <span className="login-stat-num">3×</span>
              <span className="login-stat-label">plus rapide</span>
            </div>
            <div className="login-stat-sep" />
            <div className="login-stat">
              <span className="login-stat-num">−30%</span>
              <span className="login-stat-label">de gaspillage</span>
            </div>
            <div className="login-stat-sep" />
            <div className="login-stat">
              <span className="login-stat-num">100%</span>
              <span className="login-stat-label">en ligne</span>
            </div>
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
