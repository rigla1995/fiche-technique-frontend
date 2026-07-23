import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../../api/client';
import { AuthShell, PasswordFields, pwdValid, authSubmit, authErrorBox } from './AuthShell';

type State = 'loading' | 'ready' | 'invalid';

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [state, setState] = useState<State>('loading');
  const [nom, setNom] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!token) { setState('invalid'); return; }
    api.get(`/auth/invite/${token}`)
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
      await api.post('/auth/invite/accept', { token, password });
      // Redirection directe vers la connexion, email pré-rempli — le client n'a plus qu'à saisir son mot de passe.
      navigate('/login', { replace: true, state: { email, activated: true } });
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
          <div style={{ width: 34, height: 34, margin: '0 auto 14px', border: '3px solid rgba(255,255,255,0.15)', borderTopColor: '#A5B4FC', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <p style={{ color: '#A6ACC4', fontSize: '0.9rem', margin: 0 }}>Vérification du lien…</p>
        </div>
        <style>{'@keyframes spin{to{transform:rotate(360deg)}}'}</style>
      </AuthShell>
    );
  }

  if (state === 'invalid') {
    return (
      <AuthShell>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, margin: '0 auto 16px', borderRadius: '50%', background: 'rgba(252,105,105,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.6rem' }}>🔗</div>
          <h1 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#F2F4FF', margin: '0 0 8px' }}>Lien invalide ou expiré</h1>
          <p style={{ color: '#A6ACC4', fontSize: '0.88rem', margin: '0 0 22px', lineHeight: 1.55 }}>
            Ce lien d'activation n'est plus valide (durée : 48&nbsp;h).<br />
            Contactez votre administrateur pour en recevoir un nouveau.
          </p>
          <Link to="/login" style={{ color: '#A5B4FC', fontWeight: 700, fontSize: '0.88rem', textDecoration: 'none' }}>← Retour à la connexion</Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#F2F4FF', margin: '0 0 6px', letterSpacing: '-0.01em' }}>
          Bonjour, {nom}
        </h1>
        <p style={{ color: '#A6ACC4', fontSize: '0.87rem', margin: 0, lineHeight: 1.55 }}>
          Choisissez un mot de passe pour activer<br /><strong style={{ color: '#A5B4FC', fontWeight: 700 }}>{email}</strong>
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <PasswordFields password={password} confirm={confirm} onPassword={setPassword} onConfirm={setConfirm} />
        {err && <div style={authErrorBox}>{err}</div>}
        <button type="submit" disabled={saving || !ready} style={authSubmit(saving || !ready)}>
          {saving ? 'Activation…' : 'Activer mon compte'}
        </button>
      </form>
    </AuthShell>
  );
}
