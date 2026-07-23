import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import { AuthShell, authInput, authLabel, authSubmit, authErrorBox, onAuthFocus, onAuthBlur } from './AuthShell';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || sending) return;
    setSending(true);
    setErr('');
    try {
      // Le serveur répond toujours ok (aucune indication qu'un compte existe ou non).
      await api.post('/auth/forgot-password', { email });
      setSent(true);
    } catch (e: unknown) {
      setErr((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Impossible d\'envoyer la demande, veuillez réessayer.');
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <AuthShell>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, margin: '0 auto 16px', borderRadius: '50%', background: 'rgba(99,102,241,0.16)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.6rem' }}>📬</div>
          <h1 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#F2F4FF', margin: '0 0 8px' }}>Consultez votre boîte mail</h1>
          <p style={{ color: '#A6ACC4', fontSize: '0.88rem', margin: '0 0 22px', lineHeight: 1.55 }}>
            Si un compte existe pour <strong style={{ color: '#A5B4FC' }}>{email}</strong>,<br />
            un lien de réinitialisation vient de lui être envoyé.<br />
            Il est valable <strong>1 heure</strong>.
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
          Mot de passe oublié&nbsp;?
        </h1>
        <p style={{ color: '#A6ACC4', fontSize: '0.87rem', margin: 0, lineHeight: 1.55 }}>
          Indiquez votre adresse email — nous vous enverrons<br />un lien pour le réinitialiser.
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 20 }}>
          <label htmlFor="email" style={authLabel}>Adresse email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            placeholder="votre@email.com"
            style={authInput}
            onFocus={onAuthFocus}
            onBlur={onAuthBlur}
            autoFocus
          />
        </div>
        {err && <div style={authErrorBox}>{err}</div>}
        <button type="submit" disabled={sending || !email} style={authSubmit(sending || !email)}>
          {sending ? 'Envoi…' : 'Envoyer le lien'}
        </button>
      </form>

      <p style={{ textAlign: 'center', margin: '18px 0 0' }}>
        <Link to="/login" style={{ color: '#A6ACC4', fontWeight: 600, fontSize: '0.8rem', textDecoration: 'none' }}>← Retour à la connexion</Link>
      </p>
    </AuthShell>
  );
}
