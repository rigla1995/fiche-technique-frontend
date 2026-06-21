import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../../api/client';

type State = 'loading' | 'ready' | 'invalid' | 'success' | 'error';

const PWD_RULES: { test: (v: string) => boolean; label: string }[] = [
  { test: (v) => v.length >= 8, label: 'Au moins 8 caractères' },
  { test: (v) => /[A-Z]/.test(v), label: 'Une majuscule' },
  { test: (v) => /[a-z]/.test(v), label: 'Une minuscule' },
  { test: (v) => /[0-9]/.test(v), label: 'Un chiffre' },
  { test: (v) => /[@$!%*?&_\-#]/.test(v), label: 'Un caractère spécial (@$!%*?&_-#)' },
];

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [state, setState] = useState<State>('loading');
  const [nom, setNom] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!token) { setState('invalid'); return; }
    api.get(`/auth/invite/${token}`)
      .then(({ data }) => { setNom(data.nom); setEmail(data.email); setState('ready'); })
      .catch(() => setState('invalid'));
  }, [token]);

  const validate = () => {
    const failed = PWD_RULES.find((r) => !r.test(password));
    if (failed) return `Mot de passe trop faible : ${failed.label.toLowerCase()}.`;
    if (password !== confirm) return 'Les mots de passe ne correspondent pas.';
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validErr = validate();
    if (validErr) { setErr(validErr); return; }
    setSaving(true);
    setErr('');
    try {
      await api.post('/auth/invite/accept', { token, password });
      setState('success');
    } catch (e: unknown) {
      setErr((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Erreur, veuillez réessayer.');
    } finally {
      setSaving(false);
    }
  };

  const containerStyle: React.CSSProperties = {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #1e1b4b 0%, #4338ca 55%, #6366f1 100%)',
    padding: '24px',
  };

  const cardStyle: React.CSSProperties = {
    background: '#fff',
    borderRadius: 16,
    padding: '40px 36px',
    width: '100%',
    maxWidth: 440,
    boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
  };

  if (state === 'loading') {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <p style={{ textAlign: 'center', color: '#6b7280' }}>Vérification du lien…</p>
        </div>
      </div>
    );
  }

  if (state === 'invalid') {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{ fontSize: '3rem', marginBottom: 12 }}>🔗</div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#111827', margin: '0 0 8px' }}>Lien invalide ou expiré</h2>
            <p style={{ color: '#6b7280', fontSize: '0.9rem', margin: '0 0 24px' }}>
              Ce lien d'invitation n'est plus valide (durée : 48h).<br />
              Contactez votre administrateur pour recevoir un nouveau lien.
            </p>
            <Link to="/login" style={{ color: '#4338ca', fontWeight: 600, fontSize: '0.9rem' }}>← Retour à la connexion</Link>
          </div>
        </div>
      </div>
    );
  }

  if (state === 'success') {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: 12 }}>✅</div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#111827', margin: '0 0 8px' }}>Compte activé !</h2>
            <p style={{ color: '#6b7280', fontSize: '0.9rem', margin: '0 0 28px' }}>
              Votre mot de passe a été défini. Vous pouvez maintenant vous connecter.
            </p>
            <button
              className="btn btn-primary"
              style={{ width: '100%' }}
              onClick={() => navigate('/login')}
            >
              Se connecter
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ background: 'linear-gradient(135deg, #4338ca, #6366f1)', borderRadius: 10, padding: '8px 10px', fontSize: '1.1rem', lineHeight: 1 }}>🔑</div>
            <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#4338ca', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Activation du compte</span>
          </div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 900, color: '#111827', margin: '0 0 4px', letterSpacing: '-0.02em' }}>
            Bonjour, {nom} !
          </h1>
          <p style={{ color: '#6b7280', fontSize: '0.88rem', margin: 0 }}>
            Choisissez votre mot de passe pour activer le compte <strong>{email}</strong>.
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#374151', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Mot de passe
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPwd ? 'text' : 'password'}
                className="input"
                style={{ width: '100%', paddingRight: 40 }}
                placeholder="Minimum 8 caractères"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPwd((v) => !v)}
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '1rem' }}
              >
                {showPwd ? '🙈' : '👁'}
              </button>
            </div>
            {password.length > 0 && (
              <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
                {PWD_RULES.map((r) => {
                  const ok = r.test(password);
                  return (
                    <span key={r.label} style={{ fontSize: '0.72rem', color: ok ? '#16a34a' : '#9ca3af', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      {ok ? '✓' : '○'} {r.label}
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#374151', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Confirmer le mot de passe
            </label>
            <input
              type={showPwd ? 'text' : 'password'}
              className="input"
              style={{ width: '100%' }}
              placeholder="Répétez votre mot de passe"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>

          {err && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: '#b91c1c', fontSize: '0.85rem' }}>
              {err}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%' }}
            disabled={saving}
          >
            {saving ? 'Activation…' : 'Activer mon compte'}
          </button>
        </form>
      </div>
    </div>
  );
}
