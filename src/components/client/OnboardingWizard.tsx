import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/client';
import ActivitesPage from './ActivitesPage';

// Steps: 1=change password, 2=activites, 3=referentiel articles, 4=done
const STEPS = [
  { step: 1, label: 'Mot de passe', icon: '🔒' },
  { step: 2, label: 'Mes activités', icon: '🏢' },
  { step: 3, label: 'Mes articles', icon: '🧂' },
];

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="onboarding-steps">
      {STEPS.map((s, i) => (
        <div key={s.step} className="onboarding-step-item">
          <div className={`onboarding-step-circle ${current === s.step ? 'active' : current > s.step ? 'done' : ''}`}>
            {current > s.step ? '✓' : s.icon}
          </div>
          <span className="onboarding-step-label">{s.label}</span>
          {i < STEPS.length - 1 && <div className="onboarding-step-line" />}
        </div>
      ))}
    </div>
  );
}

function PasswordStep({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const PASSWORD_RULES = [
    { test: (v: string) => v.length >= 8, label: t('validation.password_min') },
    { test: (v: string) => /[A-Z]/.test(v), label: t('validation.password_upper') },
    { test: (v: string) => /[a-z]/.test(v), label: t('validation.password_lower') },
    { test: (v: string) => /[0-9]/.test(v), label: t('validation.password_digit') },
    { test: (v: string) => /[@$!%*?&_\-#]/.test(v), label: t('validation.password_special') },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!current) { setError(t('validation.current_password_required')); return; }
    for (const rule of PASSWORD_RULES) {
      if (!rule.test(next)) { setError(rule.label); return; }
    }
    if (next !== confirm) { setError(t('validation.passwords_mismatch')); return; }
    setSaving(true);
    setError('');
    try {
      await api.put('/auth/profile', { password: next, currentPassword: current });
      onDone();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || t('common.error'));
    }
    setSaving(false);
  };

  return (
    <div style={{ maxWidth: 480, margin: '0 auto' }}>
      <h2 style={{ marginBottom: 8 }}>Modifiez votre mot de passe</h2>
      <p className="text-muted" style={{ marginBottom: 24 }}>
        Votre compte a été créé par l'administrateur. Veuillez définir un nouveau mot de passe sécurisé.
      </p>
      <form onSubmit={handleSubmit} className="card" style={{ padding: 24 }}>
        <div className="form-group">
          <label>{t('client.profile.current_password')}</label>
          <input className="input" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </div>
        <div className="form-group">
          <label>{t('client.profile.new_password')}</label>
          <input className="input" type="password" value={next} onChange={(e) => setNext(e.target.value)} />
          {next && (
            <ul style={{ margin: '6px 0 0', padding: 0, listStyle: 'none', fontSize: '0.8rem' }}>
              {PASSWORD_RULES.map((r) => (
                <li key={r.label} style={{ color: r.test(next) ? 'var(--success)' : 'var(--danger)' }}>
                  {r.test(next) ? '✓' : '✗'} {r.label}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="form-group">
          <label>{t('client.profile.confirm_password')}</label>
          <input className="input" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </div>
        {error && <p className="form-error">{error}</p>}
        <button type="submit" className="btn btn-primary btn-full" style={{ marginTop: 8 }} disabled={saving}>
          {saving ? t('common.loading') : 'Valider et continuer →'}
        </button>
      </form>
    </div>
  );
}

function ActivitesStep({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const [count, setCount] = useState(0);

  useEffect(() => {
    api.get('/api/entreprise/activites').then(({ data }) => setCount(data.length)).catch(() => {});
  }, []);

  const handleCreated = () => {
    api.get('/api/entreprise/activites').then(({ data }) => setCount(data.length)).catch(() => {});
  };

  return (
    <div>
      <h2 style={{ marginBottom: 8 }}>{t('client.entreprise.activities_section')}</h2>
      <p className="text-muted" style={{ marginBottom: 24 }}>
        Ajoutez au moins une activité (restaurant, café...) pour continuer.
      </p>
      <ActivitesPage onCreated={handleCreated} minimal />
      {count > 0 && (
        <div style={{ marginTop: 24, textAlign: 'right' }}>
          <button className="btn btn-primary" onClick={onDone}>
            Continuer → ({count} activité{count > 1 ? 's' : ''})
          </button>
        </div>
      )}
    </div>
  );
}

function ArticlesStep({ onDone }: { onDone: () => void }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    api.get('/api/articles/has-articles').then(({ data }) => setCount(data.count || 0)).catch(() => {});
  }, []);

  const refresh = () => {
    api.get('/api/articles/has-articles').then(({ data }) => setCount(data.count || 0)).catch(() => {});
  };

  return (
    <div style={{ maxWidth: 600, margin: '0 auto' }}>
      <h2 style={{ marginBottom: 8 }}>Créez vos premiers articles</h2>
      <p className="text-muted" style={{ marginBottom: 24 }}>
        Votre référentiel d'articles est votre catalogue personnel. Créez les articles que vous utilisez dans votre activité (ingrédients, matières premières, etc.).
      </p>

      <div style={{ background: '#fff', borderRadius: 14, border: '1.5px solid #e2e8f0', padding: 24, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: '#e0e7ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>🧂</div>
          <div>
            <div style={{ fontWeight: 700, color: '#1e293b', fontSize: 16 }}>Référentiel Articles</div>
            <div style={{ color: '#64748b', fontSize: 13 }}>{count} article{count !== 1 ? 's' : ''} créé{count !== 1 ? 's' : ''}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <a
            href="/client/referentiel/unites"
            target="_blank"
            rel="noopener noreferrer"
            style={{ background: '#f1f5f9', color: '#475569', borderRadius: 9, padding: '9px 16px', fontSize: 13, fontWeight: 600, textDecoration: 'none', display: 'inline-block' }}
          >
            📏 Gérer les unités
          </a>
          <a
            href="/client/referentiel/familles"
            target="_blank"
            rel="noopener noreferrer"
            style={{ background: '#f1f5f9', color: '#475569', borderRadius: 9, padding: '9px 16px', fontSize: 13, fontWeight: 600, textDecoration: 'none', display: 'inline-block' }}
            onClick={refresh}
          >
            🗂️ Gérer les familles
          </a>
          <a
            href="/client/referentiel/categories"
            target="_blank"
            rel="noopener noreferrer"
            style={{ background: '#f1f5f9', color: '#475569', borderRadius: 9, padding: '9px 16px', fontSize: 13, fontWeight: 600, textDecoration: 'none', display: 'inline-block' }}
          >
            🏷️ Gérer les catégories
          </a>
          <a
            href="/client/referentiel/articles"
            target="_blank"
            rel="noopener noreferrer"
            style={{ background: '#6366f1', color: '#fff', borderRadius: 9, padding: '9px 16px', fontSize: 13, fontWeight: 600, textDecoration: 'none', display: 'inline-block' }}
            onClick={refresh}
          >
            🧂 Créer des articles →
          </a>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button onClick={refresh} style={{ background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 9, padding: '9px 18px', fontWeight: 600, cursor: 'pointer' }}>
          Actualiser
        </button>
        <button onClick={onDone} style={{ background: '#6366f1', color: '#fff', border: 'none', borderRadius: 9, padding: '9px 24px', fontWeight: 700, cursor: 'pointer' }}>
          {count > 0 ? `Continuer (${count} article${count > 1 ? 's' : ''}) →` : 'Ignorer et continuer →'}
        </button>
      </div>
    </div>
  );
}

export default function OnboardingWizard() {
  const { user, advanceOnboarding } = useAuth();
  const navigate = useNavigate();
  const step = user?.onboardingStep ?? 1;

  const goNext = async (nextStep: number) => {
    if (nextStep >= 4) {
      await advanceOnboarding(0);
      navigate('/client/rapports', { replace: true });
    } else {
      await advanceOnboarding(nextStep);
    }
  };

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '32px 24px' }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ marginBottom: 4 }}>Bienvenue ! Configuration initiale</h1>
        <p className="text-muted">Complétez ces étapes pour accéder à votre espace.</p>
      </div>

      <StepIndicator current={step} />

      <div style={{ marginTop: 32 }}>
        {step === 1 && <PasswordStep onDone={() => goNext(2)} />}
        {step === 2 && <ActivitesStep onDone={() => goNext(3)} />}
        {step === 3 && <ArticlesStep onDone={() => goNext(0)} />}
      </div>
    </div>
  );
}
