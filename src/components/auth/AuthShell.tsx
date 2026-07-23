import { useState } from 'react';
import LabFlowLogo from '../common/LabFlowLogo';

// ─────────────────────────────────────────────────────────────────────────────
// Habillage commun des pages d'authentification hors connexion (activation,
// mot de passe oublié, réinitialisation) — thème « Nuit & Lumière » aligné sur
// le site vitrine (v4) : fond nuit + aurore, carte verre, liseré dégradé du
// logo. Un seul endroit à retoucher pour rethémer.
// ─────────────────────────────────────────────────────────────────────────────

export const PWD_RULES: { test: (v: string) => boolean; label: string }[] = [
  { test: (v) => v.length >= 8, label: '8 caractères' },
  { test: (v) => /[A-Z]/.test(v), label: 'une majuscule' },
  { test: (v) => /[a-z]/.test(v), label: 'une minuscule' },
  { test: (v) => /[0-9]/.test(v), label: 'un chiffre' },
  { test: (v) => /[@$!%*?&_\-#]/.test(v), label: 'un caractère spécial' },
];

export const pwdValid = (v: string) => PWD_RULES.every((r) => r.test(v));

// Drapeau tunisien en SVG inline — Windows ne rend pas l'emoji 🇹🇳 (affiche « TN »).
export const FlagTN = () => (
  <svg width="13" height="13" viewBox="0 0 20 20" style={{ verticalAlign: '-2px', display: 'inline-block' }} aria-label="Tunisie" role="img">
    <circle cx="10" cy="10" r="10" fill="#E70013" />
    <circle cx="10" cy="10" r="5.8" fill="#fff" />
    <circle cx="10" cy="10" r="4.4" fill="#E70013" />
    <circle cx="11.3" cy="10" r="3.6" fill="#fff" />
    <path fill="#E70013" d="M12.6 7.9l.55 1.55 1.65.05-1.3 1 .47 1.58-1.37-.95-1.37.95.47-1.58-1.3-1 1.65-.05z" />
  </svg>
);

export const authInput: React.CSSProperties = {
  width: '100%', padding: '12px 14px', borderRadius: 12,
  border: '1px solid rgba(255,255,255,0.22)',
  fontSize: '0.93rem', outline: 'none',
  background: 'rgba(255,255,255,0.035)', color: '#F2F4FF',
  transition: 'border-color 0.25s, background 0.25s, box-shadow 0.25s',
};

export const authLabel: React.CSSProperties = {
  display: 'block', fontSize: '0.76rem', fontWeight: 600, color: '#D4D9EC',
  marginBottom: 7, letterSpacing: '0.02em',
};

export const onAuthFocus = (e: React.FocusEvent<HTMLInputElement>) => {
  e.currentTarget.style.borderColor = '#A5B4FC';
  e.currentTarget.style.background = 'rgba(255,255,255,0.055)';
  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.28)';
};
export const onAuthBlur = (e: React.FocusEvent<HTMLInputElement>) => {
  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.22)';
  e.currentTarget.style.background = 'rgba(255,255,255,0.035)';
  e.currentTarget.style.boxShadow = 'none';
};

export const authSubmit = (disabled: boolean): React.CSSProperties => ({
  width: '100%', padding: '13px', border: 'none', borderRadius: 12, color: '#fff',
  fontWeight: 700, fontSize: '0.95rem', letterSpacing: '0.02em',
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.55 : 1,
  background: 'linear-gradient(120deg, #0A78AB 0%, #4F46E5 52%, #8B33D4 100%)',
  boxShadow: disabled ? 'none' : '0 10px 26px rgba(79,70,229,0.35)',
  transition: 'opacity 0.2s, box-shadow 0.2s',
});

export const authErrorBox: React.CSSProperties = {
  background: 'rgba(252,105,105,0.09)', border: '1px solid rgba(252,120,120,0.4)',
  borderRadius: 10, padding: '10px 14px', marginBottom: 16,
  color: '#FCA5A5', fontSize: '0.84rem',
};

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-nuit" style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background:
        'radial-gradient(760px 500px at 15% -10%, rgba(14,165,233,0.15) 0%, transparent 62%), '
        + 'radial-gradient(820px 560px at 90% 10%, rgba(168,85,247,0.12) 0%, transparent 64%), '
        + 'radial-gradient(700px 480px at 50% 115%, rgba(99,102,241,0.13) 0%, transparent 60%), #04050B',
      padding: 24,
    }}>
      <div style={{ width: '100%', maxWidth: 424 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 22 }}>
          <LabFlowLogo height={34} variant="light" />
        </div>
        <div style={{
          background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.10)',
          borderRadius: 20, boxShadow: '0 30px 80px rgba(0,0,0,0.45)', overflow: 'hidden',
          backdropFilter: 'blur(10px)',
        }}>
          <div style={{ height: 3, background: 'linear-gradient(120deg, #0EA5E9 0%, #6366F1 52%, #A855F7 100%)' }} />
          <div style={{ padding: '32px 38px 34px' }}>
            {children}
          </div>
        </div>
        <p style={{ textAlign: 'center', fontSize: '0.72rem', color: '#7C84A0', margin: '18px 0 0' }}>
          🔒 Connexion sécurisée · LabFlow · <span style={{ color: '#A6ACC4' }}>Conçu en Tunisie <FlagTN /></span>
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
            style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#7C84A0', padding: 4, display: 'flex' }}>
            <EyeIcon off={show} />
          </button>
        </div>
        {password.length === 0 ? (
          <p style={{ margin: '7px 0 0', fontSize: '0.72rem', color: '#7C84A0' }}>
            8 caractères min. — majuscule, minuscule, chiffre et caractère spécial.
          </p>
        ) : (
          <div style={{ marginTop: 9 }}>
            <div style={{ display: 'flex', gap: 4 }}>
              {PWD_RULES.map((r, i) => (
                <span key={r.label} style={{ height: 4, flex: 1, borderRadius: 2, background: i < passed ? (ok ? '#34D399' : '#FBBF24') : 'rgba(255,255,255,0.12)', transition: 'background 0.2s' }} />
              ))}
            </div>
            <p style={{ margin: '7px 0 0', fontSize: '0.74rem', color: ok ? '#6EE7B7' : '#A6ACC4' }}>
              {ok ? '✓ Mot de passe valide' : `Il manque : ${missing.join(' · ')}`}
            </p>
          </div>
        )}
      </div>

      <div style={{ marginBottom: 20 }}>
        <label style={authLabel}>Confirmation</label>
        <input
          type={show ? 'text' : 'password'}
          style={{ ...authInput, borderColor: confirm.length > 0 ? (match ? 'rgba(52,211,153,0.55)' : 'rgba(252,120,120,0.55)') : 'rgba(255,255,255,0.22)' }}
          placeholder="Répétez le mot de passe"
          value={confirm}
          onChange={(e) => onConfirm(e.target.value)}
          autoComplete="new-password"
        />
        {confirm.length > 0 && !match && (
          <span style={{ fontSize: '0.72rem', color: '#FCA5A5', marginTop: 5, display: 'block' }}>Les mots de passe ne correspondent pas.</span>
        )}
      </div>
    </>
  );
}
