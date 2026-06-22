import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../../api/client';
import LabFlowLogo from '../common/LabFlowLogo';

type State = 'loading' | 'ready' | 'invalid' | 'success' | 'error';

const PWD_RULES: { test: (v: string) => boolean; label: string }[] = [
  { test: (v) => v.length >= 8, label: 'Au moins 8 caractères' },
  { test: (v) => /[A-Z]/.test(v), label: 'Une majuscule' },
  { test: (v) => /[a-z]/.test(v), label: 'Une minuscule' },
  { test: (v) => /[0-9]/.test(v), label: 'Un chiffre' },
  { test: (v) => /[@$!%*?&_\-#]/.test(v), label: 'Un caractère spécial' },
];

// Habillage commun — thème CLAIR, logo mis en valeur sur carte blanche + barre ambre.
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'radial-gradient(900px 520px at 80% -10%, rgba(99,102,241,0.14) 0%, transparent 60%), radial-gradient(700px 400px at 10% 110%, rgba(217,119,6,0.08) 0%, transparent 60%), linear-gradient(150deg, #f6f8ff 0%, #eef2ff 55%, #f4efff 100%)',
      padding: 24,
    }}>
      <div style={{
        background: '#fff', borderRadius: 22, width: '100%', maxWidth: 460,
        boxShadow: '0 28px 70px rgba(67,56,202,0.18)', overflow: 'hidden',
      }}>
        {/* Barre ambre signature */}
        <div style={{ height: 5, background: 'linear-gradient(90deg, #d97706, #f59e0b)' }} />
        {/* En-tête logo — clair, logo dans une pastille blanche */}
        <div style={{ padding: '30px 36px 14px', textAlign: 'center', background: 'linear-gradient(180deg, #f8faff 0%, #ffffff 100%)' }}>
          <div style={{ display: 'inline-flex', padding: '16px 26px', background: '#fff', border: '1px solid #e0e7ff', borderRadius: 18, boxShadow: '0 14px 36px rgba(67,56,202,0.13)' }}>
            <LabFlowLogo height={42} variant="dark" />
          </div>
        </div>
        {/* Corps */}
        <div style={{ padding: '14px 36px 34px' }}>
          {children}
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid #e5e7eb',
  fontSize: '0.92rem', outline: 'none', background: '#f9fafb', color: '#111827',
};
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#6b7280',
  marginBottom: 7, textTransform: 'uppercase', letterSpacing: '0.06em',
};

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
      <Shell>
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <div style={{ width: 34, height: 34, margin: '0 auto 14px', border: '3px solid #e0e7ff', borderTopColor: '#4338ca', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <p style={{ color: '#6b7280', fontSize: '0.9rem', margin: 0 }}>Vérification du lien…</p>
        </div>
        <style>{'@keyframes spin{to{transform:rotate(360deg)}}'}</style>
      </Shell>
    );
  }

  if (state === 'invalid') {
    return (
      <Shell>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 60, height: 60, margin: '0 auto 16px', borderRadius: '50%', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.8rem' }}>🔗</div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#111827', margin: '0 0 8px' }}>Lien invalide ou expiré</h2>
          <p style={{ color: '#6b7280', fontSize: '0.9rem', margin: '0 0 24px', lineHeight: 1.5 }}>
            Ce lien d'activation n'est plus valide (durée : 48&nbsp;h).<br />
            Contactez votre administrateur pour en recevoir un nouveau.
          </p>
          <Link to="/login" style={{ color: '#4338ca', fontWeight: 700, fontSize: '0.9rem', textDecoration: 'none' }}>← Retour à la connexion</Link>
        </div>
      </Shell>
    );
  }

  if (state === 'success') {
    return (
      <Shell>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, margin: '0 auto 16px', borderRadius: '50%', background: '#ecfdf5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem' }}>✅</div>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#111827', margin: '0 0 8px' }}>Compte activé&nbsp;!</h2>
          <p style={{ color: '#6b7280', fontSize: '0.9rem', margin: '0 0 26px', lineHeight: 1.5 }}>
            Votre mot de passe a bien été défini.<br />Vous pouvez maintenant vous connecter à LabFlow.
          </p>
          <button onClick={() => navigate('/login')} style={{
            width: '100%', padding: '13px', border: 'none', borderRadius: 10,
            background: 'linear-gradient(135deg, #4338ca, #6366f1)', color: '#fff',
            fontWeight: 800, fontSize: '0.95rem', cursor: 'pointer', boxShadow: '0 8px 20px rgba(67,56,202,0.35)',
          }}>
            Se connecter
          </button>
        </div>
      </Shell>
    );
  }

  const pwdOk = PWD_RULES.every((r) => r.test(password));
  const match = password.length > 0 && password === confirm;

  return (
    <Shell>
      {/* Badge + titre */}
      <div style={{ marginBottom: 22 }}>
        <span style={{ display: 'inline-block', fontSize: '0.66rem', fontWeight: 800, color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 20, padding: '4px 11px', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
          🔑 Activation du compte
        </span>
        <h1 style={{ fontSize: '1.45rem', fontWeight: 900, color: '#0f172a', margin: '0 0 5px', letterSpacing: '-0.02em' }}>
          Bonjour, {nom}&nbsp;!
        </h1>
        <p style={{ color: '#6b7280', fontSize: '0.88rem', margin: 0, lineHeight: 1.5 }}>
          Choisissez un mot de passe pour activer le compte<br /><strong style={{ color: '#4338ca' }}>{email}</strong>.
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Mot de passe</label>
          <div style={{ position: 'relative' }}>
            <input
              type={showPwd ? 'text' : 'password'}
              style={{ ...inputStyle, paddingRight: 44 }}
              placeholder="Votre mot de passe"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onFocus={(e) => (e.currentTarget.style.borderColor = '#6366f1')}
              onBlur={(e) => (e.currentTarget.style.borderColor = '#e5e7eb')}
              autoFocus
            />
            <button type="button" onClick={() => setShowPwd((v) => !v)} aria-label="Afficher/masquer"
              style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '1.05rem', padding: 4 }}>
              {showPwd ? '🙈' : '👁'}
            </button>
          </div>
          {password.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
              {PWD_RULES.map((r) => {
                const ok = r.test(password);
                return (
                  <span key={r.label} style={{
                    fontSize: '0.68rem', fontWeight: 600, padding: '3px 9px', borderRadius: 20,
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    background: ok ? '#ecfdf5' : '#f3f4f6', color: ok ? '#059669' : '#9ca3af',
                    border: `1px solid ${ok ? '#a7f3d0' : '#e5e7eb'}`,
                  }}>
                    {ok ? '✓' : '○'} {r.label}
                  </span>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>Confirmer le mot de passe</label>
          <input
            type={showPwd ? 'text' : 'password'}
            style={{ ...inputStyle, borderColor: confirm.length > 0 ? (match ? '#a7f3d0' : '#fecaca') : '#e5e7eb' }}
            placeholder="Répétez votre mot de passe"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          {confirm.length > 0 && !match && (
            <span style={{ fontSize: '0.72rem', color: '#dc2626', marginTop: 5, display: 'block' }}>Les mots de passe ne correspondent pas.</span>
          )}
        </div>

        {err && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', marginBottom: 16, color: '#b91c1c', fontSize: '0.84rem' }}>
            {err}
          </div>
        )}

        <button type="submit" disabled={saving || !pwdOk || !match} style={{
          width: '100%', padding: '13px', border: 'none', borderRadius: 10, color: '#fff',
          fontWeight: 800, fontSize: '0.95rem', letterSpacing: '0.02em',
          cursor: saving || !pwdOk || !match ? 'not-allowed' : 'pointer',
          background: saving || !pwdOk || !match ? '#c7d2fe' : 'linear-gradient(135deg, #4338ca, #6366f1)',
          boxShadow: saving || !pwdOk || !match ? 'none' : '0 8px 20px rgba(67,56,202,0.35)',
          transition: 'background 0.2s, box-shadow 0.2s',
        }}>
          {saving ? 'Activation…' : 'Activer mon compte'}
        </button>

        <p style={{ textAlign: 'center', fontSize: '0.72rem', color: '#9ca3af', margin: '16px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
          🔒 Connexion sécurisée &middot; vos données sont chiffrées
        </p>
      </form>
    </Shell>
  );
}
