import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../../api/client';
import { AuthShell, PasswordFields, pwdValid, authSubmit, authErrorBox } from './AuthShell';

type State = 'loading' | 'ready' | 'invalid';

export default function ResetPasswordPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [state, setState] = useState<State>('loading');
  const [email, setEmail] = useState('');
  const [nom, setNom] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!token) { setState('invalid'); return; }
    api.get(`/auth/reset/${token}`)
      .then(({ data }) => { setNom(data.nom); setEmail(data.email); setState('ready'); })
      .catch(() => setState('invalid'));
  }, [token]);

  const ready = pwdValid(password) && password === confirm;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready || saving) return;
    setSaving(true);
    setErr('');
    try {
      await api.post('/auth/reset', { token, password });
      navigate('/login', { replace: true, state: { email, reset: true } });
    } catch (e: unknown) {
      setErr((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Erreur, veuillez réessayer.');
    } finally {
      setSaving(false);
    }
  };

  if (state === 'loading') {
    return (
      <AuthShell>
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <div style={{ width: 34, height: 34, margin: '0 auto 14px', border: '3px solid #e0e7ff', borderTopColor: '#4338ca', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <p style={{ color: '#6b7280', fontSize: '0.9rem', margin: 0 }}>Vérification du lien…</p>
        </div>
        <style>{'@keyframes spin{to{transform:rotate(360deg)}}'}</style>
      </AuthShell>
    );
  }

  if (state === 'invalid') {
    return (
      <AuthShell>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, margin: '0 auto 16px', borderRadius: '50%', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.6rem' }}>🔗</div>
          <h1 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', margin: '0 0 8px' }}>Lien invalide ou expiré</h1>
          <p style={{ color: '#6b7280', fontSize: '0.88rem', margin: '0 0 22px', lineHeight: 1.55 }}>
            Ce lien de réinitialisation n'est plus valide (durée : 1&nbsp;h).<br />
            Vous pouvez refaire une demande à tout moment.
          </p>
          <Link to="/forgot-password" style={{ display: 'inline-block', marginBottom: 12, color: '#fff', fontWeight: 700, fontSize: '0.88rem', textDecoration: 'none', background: 'linear-gradient(135deg, #4338ca, #6366f1)', borderRadius: 12, padding: '11px 24px', boxShadow: '0 8px 20px rgba(67,56,202,0.3)' }}>
            Refaire une demande
          </Link>
          <p style={{ margin: 0 }}>
            <Link to="/login" style={{ color: '#64748b', fontWeight: 600, fontSize: '0.8rem', textDecoration: 'none' }}>← Retour à la connexion</Link>
          </p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0f172a', margin: '0 0 6px', letterSpacing: '-0.01em' }}>
          Nouveau mot de passe
        </h1>
        <p style={{ color: '#6b7280', fontSize: '0.87rem', margin: 0, lineHeight: 1.55 }}>
          {nom ? <>Bonjour, {nom} — c</> : 'C'}hoisissez un nouveau mot de passe pour<br /><strong style={{ color: '#4338ca', fontWeight: 700 }}>{email}</strong>
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <PasswordFields password={password} confirm={confirm} onPassword={setPassword} onConfirm={setConfirm} label="Nouveau mot de passe" />
        {err && <div style={authErrorBox}>{err}</div>}
        <button type="submit" disabled={saving || !ready} style={authSubmit(saving || !ready)}>
          {saving ? 'Enregistrement…' : 'Réinitialiser le mot de passe'}
        </button>
      </form>
    </AuthShell>
  );
}
