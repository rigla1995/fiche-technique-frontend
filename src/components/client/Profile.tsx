import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useEmailCheck } from '../../hooks/useEmailCheck';

interface ProfileForm {
  name: string;
  email: string;
  phone: string;
  currentPassword: string;
  password: string;
  confirmPassword: string;
}

const TUNISIAN_PHONE = /^(\+216[\s-]?)?[2579]\d{7}$/;

export default function Profile() {
  const { t } = useTranslation();
  const { user, updateUser, advanceOnboarding } = useAuth();
  const { emailExists: profileEmailExists, emailChecking: profileEmailChecking } = useEmailCheck(form.email, user?.id);
  const navigate = useNavigate();
  const [upgrading, setUpgrading] = useState(false);
  const [upgradeMsg, setUpgradeMsg] = useState('');

  const PASSWORD_RULES = [
    { test: (v: string) => v.length >= 8, label: t('validation.password_min') },
    { test: (v: string) => /[A-Z]/.test(v), label: t('validation.password_upper') },
    { test: (v: string) => /[a-z]/.test(v), label: t('validation.password_lower') },
    { test: (v: string) => /[0-9]/.test(v), label: t('validation.password_digit') },
    { test: (v: string) => /[@$!%*?&_\-#]/.test(v), label: t('validation.password_special') },
  ];

  const [form, setForm] = useState<ProfileForm>({
    name: '', email: '', phone: '', currentPassword: '', password: '', confirmPassword: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    api.get('/auth/me').then(({ data }) => {
      setForm((f) => ({ ...f, name: data.name || '', email: data.email || '', phone: data.phone || '' }));
    }).finally(() => setLoading(false));
  }, []);

  const validate = (): Record<string, string> => {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = t('validation.name_required');
    if (!form.email.trim()) errs.email = t('validation.email_required');
    else if (!/\S+@\S+\.\S+/.test(form.email)) errs.email = t('validation.email_invalid');
    else if (profileEmailExists) errs.email = 'Cet email est déjà utilisé.';
    if (form.phone && !TUNISIAN_PHONE.test(form.phone.replace(/\s/g, ''))) {
      errs.phone = t('validation.phone_invalid');
    }
    if (form.password) {
      for (const rule of PASSWORD_RULES) {
        if (!rule.test(form.password)) { errs.password = rule.label; break; }
      }
      if (!errs.password && form.password !== form.confirmPassword) {
        errs.confirmPassword = t('validation.passwords_mismatch');
      }
      if (!form.currentPassword) errs.currentPassword = t('validation.current_password_required');
    }
    return errs;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSaving(true);
    setSuccess(false);
    try {
      const payload: Record<string, string> = {
        name: form.name,
        email: form.email,
        phone: form.phone,
      };
      if (form.password) {
        payload.password = form.password;
        payload.currentPassword = form.currentPassword;
      }
      const { data } = await api.put('/auth/profile', payload);
      updateUser({ name: data.name, email: data.email, phone: data.phone });
      setForm((f) => ({ ...f, currentPassword: '', password: '', confirmPassword: '' }));
      // Advance onboarding: step 1 (password change) → step 2 (activites)
      if (form.password && user?.onboardingStep === 1) {
        await advanceOnboarding(2);
        navigate('/client/activites', { replace: true });
        return;
      }
      setSuccess(true);
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.response?.data?.errors?.[0]?.msg || t('common.error');
      setErrors({ global: msg });
    } finally {
      setSaving(false);
    }
  };

  const handleUpgrade = async () => {
    if (!window.confirm(t('client.profile.upgrade_confirm'))) return;
    setUpgrading(true);
    setUpgradeMsg('');
    try {
      await api.post('/auth/upgrade');
      updateUser({ compteType: 'entreprise' });
      setUpgradeMsg(t('client.profile.upgrade_success'));
    } catch {
      setUpgradeMsg(t('common.error'));
    }
    setUpgrading(false);
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>{t('common.loading')}</div>;

  const initials = form.name ? form.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase() : '?';

  return (
    <div className="page" style={{ maxWidth: 620 }}>
      {/* ── Hero ── */}
      <div style={{
        background: 'linear-gradient(135deg, #1e1b4b 0%, #4338ca 55%, #6366f1 100%)',
        borderRadius: 18, padding: '24px 28px', marginBottom: 24,
        boxShadow: '0 8px 32px rgba(67,56,202,0.28)',
        display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap',
      }}>
        <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', border: '2px solid rgba(255,255,255,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', fontWeight: 800, color: '#fff', flexShrink: 0 }}>
          {initials}
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 900, color: '#fff' }}>{form.name || t('client.profile.title')}</h1>
          <span style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.7)', marginTop: 4, display: 'block' }}>{form.email}</span>
        </div>
      </div>

      {user?.onboardingStep === 1 && (
        <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 12, padding: '12px 18px', marginBottom: 20, fontSize: '0.85rem', color: '#92400e', fontWeight: 600 }}>
          🔒 Bienvenue ! Veuillez définir un nouveau mot de passe pour accéder à votre espace.
        </div>
      )}

      {success && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, padding: '12px 18px', marginBottom: 20, fontSize: '0.85rem', color: '#166534', fontWeight: 600 }}>
          ✓ {t('client.profile.success')}
        </div>
      )}
      {errors.global && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: '12px 18px', marginBottom: 20, fontSize: '0.85rem', color: '#dc2626', fontWeight: 600 }}>
          ⚠ {errors.global}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* ── Informations personnelles ── */}
        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', marginBottom: 20 }}>
          <div style={{ background: 'linear-gradient(135deg,#f5f3ff,#ede9fe)', padding: '14px 20px', borderBottom: '1px solid #ddd6fe', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '1rem' }}>👤</span>
            <span style={{ fontWeight: 800, fontSize: '0.88rem', color: '#4c1d95' }}>Informations personnelles</span>
          </div>
          <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={lbl}>{t('common.name')} *</label>
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                style={{ ...inp, borderColor: errors.name ? '#ef4444' : '#e2e8f0' }} />
              {errors.name && <span style={err}>{errors.name}</span>}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label style={lbl}>{t('common.email')} *</label>
                <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  style={{ ...inp, borderColor: errors.email || profileEmailExists ? '#fca5a5' : '#e2e8f0', background: profileEmailExists ? '#fff5f5' : '#fff' }} />
                {profileEmailChecking && <span style={{ fontSize: 11, color: '#94a3b8', marginTop: 3, display: 'block' }}>Vérification…</span>}
                {!profileEmailChecking && profileEmailExists && <span style={{ fontSize: 11, color: '#dc2626', marginTop: 3, display: 'block' }}>Cet email est déjà utilisé.</span>}
                {errors.email && <span style={err}>{errors.email}</span>}
              </div>
              <div>
                <label style={lbl}>{t('common.phone')} <span style={{ fontWeight: 400, textTransform: 'none' }}>{t('validation.phone_hint')}</span></label>
                <input value={form.phone} placeholder={t('validation.phone_placeholder')} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  style={{ ...inp, borderColor: errors.phone ? '#ef4444' : '#e2e8f0' }} />
                {errors.phone && <span style={err}>{errors.phone}</span>}
              </div>
            </div>
          </div>
        </div>

        {/* ── Sécurité ── */}
        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', marginBottom: 24 }}>
          <div style={{ background: 'linear-gradient(135deg,#f0f9ff,#e0f2fe)', padding: '14px 20px', borderBottom: '1px solid #bae6fd', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '1rem' }}>🔒</span>
            <span style={{ fontWeight: 800, fontSize: '0.88rem', color: '#0369a1' }}>Sécurité — Changer le mot de passe</span>
          </div>
          <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={{ margin: 0, fontSize: '0.82rem', color: '#6b7280' }}>{t('client.profile.password_section_hint')}</p>
            <div>
              <label style={lbl}>{t('client.profile.current_password')}</label>
              <input type="password" value={form.currentPassword} onChange={(e) => setForm((f) => ({ ...f, currentPassword: e.target.value }))}
                style={{ ...inp, borderColor: errors.currentPassword ? '#ef4444' : '#e2e8f0' }} />
              {errors.currentPassword && <span style={err}>{errors.currentPassword}</span>}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label style={lbl}>{t('client.profile.new_password')}</label>
                <input type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  style={{ ...inp, borderColor: errors.password ? '#ef4444' : '#e2e8f0' }} />
                {form.password && (
                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {PASSWORD_RULES.map((r) => (
                      <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.75rem', color: r.test(form.password) ? '#16a34a' : '#dc2626' }}>
                        <span style={{ width: 14, height: 14, borderRadius: '50%', background: r.test(form.password) ? '#dcfce7' : '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', flexShrink: 0 }}>
                          {r.test(form.password) ? '✓' : '✗'}
                        </span>
                        {r.label}
                      </div>
                    ))}
                  </div>
                )}
                {errors.password && <span style={err}>{errors.password}</span>}
              </div>
              <div>
                <label style={lbl}>{t('client.profile.confirm_password')}</label>
                <input type="password" value={form.confirmPassword} onChange={(e) => setForm((f) => ({ ...f, confirmPassword: e.target.value }))}
                  style={{ ...inp, borderColor: errors.confirmPassword ? '#ef4444' : '#e2e8f0' }} />
                {errors.confirmPassword && <span style={err}>{errors.confirmPassword}</span>}
                {form.confirmPassword && !errors.confirmPassword && form.password === form.confirmPassword && (
                  <div style={{ marginTop: 6, fontSize: '0.75rem', color: '#16a34a' }}>✓ Mots de passe identiques</div>
                )}
              </div>
            </div>
          </div>
        </div>

        <button type="submit" disabled={saving}
          style={{ width: '100%', padding: '13px', borderRadius: 12, border: 'none', background: saving ? '#e5e7eb' : 'linear-gradient(135deg,#4338ca,#6366f1)', color: saving ? '#9ca3af' : '#fff', fontSize: '0.95rem', fontWeight: 800, cursor: saving ? 'default' : 'pointer', boxShadow: saving ? 'none' : '0 4px 16px rgba(99,102,241,0.35)' }}>
          {saving ? t('common.loading') : `💾 ${t('client.profile.save')}`}
        </button>
      </form>
    </div>
  );
}

const lbl: React.CSSProperties = { fontSize: '0.72rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' };
const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 9, border: '1.5px solid #e2e8f0', fontSize: '0.88rem', color: '#0f172a', outline: 'none', boxSizing: 'border-box', background: '#fff' };
const err: React.CSSProperties = { fontSize: '0.75rem', color: '#dc2626', marginTop: 4, display: 'block' };
