import { useState } from 'react';
import LabFlowLogo from '../common/LabFlowLogo';

// ─────────────────────────────────────────────────────────────────────────────
// Habillage commun des pages d'authentification hors connexion (activation,
// mot de passe oublié, réinitialisation) : carte épurée, logo hors carte,
// liseré ambre signature. Un seul endroit à retoucher pour rethémer.
// ─────────────────────────────────────────────────────────────────────────────

export const PWD_RULES: { test: (v: string) => boolean; label: string }[] = [
  { test: (v) => v.length >= 8, label: '8 caractères' },
  { test: (v) => /[A-Z]/.test(v), label: 'une majuscule' },
  { test: (v) => /[a-z]/.test(v), label: 'une minuscule' },
  { test: (v) => /[0-9]/.test(v), label: 'un chiffre' },
  { test: (v) => /[@$!%*?&_\-#]/.test(v), label: 'un caractère spécial' },
];

export const pwdValid = (v: string) => PWD_RULES.every((r) => r.test(v));

export const authInput: React.CSSProperties = {
  width: '100%', padding: '12px 14px', borderRadius: 12, border: '1.5px solid #e5e7eb',
  fontSize: '0.93rem', outline: 'none', background: '#f8fafc', color: '#0f172a',
  transition: 'border-color 0.15s, background 0.15s, box-shadow 0.15s',
};

export const authLabel: React.CSSProperties = {
  display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#475569',
  marginBottom: 7, letterSpacing: '0.02em',
};

export const onAuthFocus = (e: React.FocusEvent<HTMLInputElement>) => {
  e.currentTarget.style.borderColor = '#6366f1';
  e.currentTarget.style.background = '#fff';
  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.12)';
};
export const onAuthBlur = (e: React.FocusEvent<HTMLInputElement>) => {
  e.currentTarget.style.borderColor = '#e5e7eb';
  e.currentTarget.style.background = '#f8fafc';
  e.currentTarget.style.boxShadow = 'none';
};

export const authSubmit = (disabled: boolean): React.CSSProperties => ({
  width: '100%', padding: '13px', border: 'none', borderRadius: 12, color: '#fff',
  fontWeight: 800, fontSize: '0.95rem', letterSpacing: '0.02em',
  cursor: disabled ? 'not-allowed' : 'pointer',
  background: disabled ? '#c7d2fe' : 'linear-gradient(135deg, #4338ca, #6366f1)',
  boxShadow: disabled ? 'none' : '0 8px 20px rgba(67,56,202,0.3)',
  transition: 'background 0.2s, box-shadow 0.2s',
});

export const authErrorBox: React.CSSProperties = {
  background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10,
  padding: '10px 14px', marginBottom: 16, color: '#b91c1c', fontSize: '0.84rem',
};

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'radial-gradient(900px 520px at 80% -10%, rgba(99,102,241,0.12) 0%, transparent 60%), radial-gradient(700px 400px at 10% 110%, rgba(217,119,6,0.07) 0%, transparent 60%), linear-gradient(150deg, #f7f8ff 0%, #eef2ff 60%, #f5f1ff 100%)',
      padding: 24,
    }}>
      <div style={{ width: '100%', maxWidth: 424 }}>
        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          <LabFlowLogo height={34} variant="dark" />
        </div>
        <div style={{ background: '#fff', borderRadius: 20, boxShadow: '0 22px 60px rgba(67,56,202,0.13)', overflow: 'hidden' }}>
          <div style={{ height: 4, background: 'linear-gradient(90deg, #d97706, #f59e0b)' }} />
          <div style={{ padding: '32px 38px 34px' }}>
            {children}
          </div>
        </div>
        <p style={{ textAlign: 'center', fontSize: '0.72rem', color: '#94a3b8', margin: '18px 0 0' }}>
          🔒 Connexion sécurisée · LabFlow
        </p>
      </div>
    </div>
  );
}

const EyeIcon = ({ off }: { off: boolean }) => off ? (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
) : (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
);

// Champs mot de passe + confirmation, avec retour compact (jauge 5 segments +
// une seule ligne d'aide) — remplace les 5 chips de règles de l'ancien design.
export function PasswordFields({ password, confirm, onPassword, onConfirm, label = 'Mot de passe' }: {
  password: string;
  confirm: string;
  onPassword: (v: string) => void;
  onConfirm: (v: string) => void;
  label?: string;
}) {
  const [show, setShow] = useState(false);
  const passed = PWD_RULES.filter((r) => r.test(password)).length;
  const ok = passed === PWD_RULES.length;
  const missing = PWD_RULES.filter((r) => !r.test(password)).map((r) => r.label);
  const match = password.length > 0 && password === confirm;

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <label style={authLabel}>{label}</label>
        <div style={{ position: 'relative' }}>
          <input
            type={show ? 'text' : 'password'}
            style={{ ...authInput, paddingRight: 44 }}
            placeholder="••••••••"
            value={password}
            onChange={(e) => onPassword(e.target.value)}
            onFocus={onAuthFocus}
            onBlur={onAuthBlur}
            autoComplete="new-password"
            autoFocus
          />
          <button type="button" onClick={() => setShow((v) => !v)} tabIndex={-1} aria-label={show ? 'Masquer' : 'Afficher'}
            style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4, display: 'flex' }}>
            <EyeIcon off={show} />
          </button>
        </div>
        {password.length === 0 ? (
          <p style={{ margin: '7px 0 0', fontSize: '0.72rem', color: '#9ca3af' }}>
            8 caractères min. — majuscule, minuscule, chiffre et caractère spécial.
          </p>
        ) : (
          <div style={{ marginTop: 9 }}>
            <div style={{ display: 'flex', gap: 4 }}>
              {PWD_RULES.map((r, i) => (
                <span key={r.label} style={{ height: 4, flex: 1, borderRadius: 2, background: i < passed ? (ok ? '#10b981' : '#f59e0b') : '#e5e7eb', transition: 'background 0.2s' }} />
              ))}
            </div>
            <p style={{ margin: '7px 0 0', fontSize: '0.74rem', color: ok ? '#059669' : '#94a3b8' }}>
              {ok ? '✓ Mot de passe valide' : `Il manque : ${missing.join(' · ')}`}
            </p>
          </div>
        )}
      </div>

      <div style={{ marginBottom: 20 }}>
        <label style={authLabel}>Confirmation</label>
        <input
          type={show ? 'text' : 'password'}
          style={{ ...authInput, borderColor: confirm.length > 0 ? (match ? '#a7f3d0' : '#fecaca') : '#e5e7eb' }}
          placeholder="Répétez le mot de passe"
          value={confirm}
          onChange={(e) => onConfirm(e.target.value)}
          autoComplete="new-password"
        />
        {confirm.length > 0 && !match && (
          <span style={{ fontSize: '0.72rem', color: '#dc2626', marginTop: 5, display: 'block' }}>Les mots de passe ne correspondent pas.</span>
        )}
      </div>
    </>
  );
}
