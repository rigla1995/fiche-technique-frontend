import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';

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
  const { user, updateUser } = useAuth();
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

  if (loading) return <div className="loading-text">{t('common.loading')}</div>;

  return (
    <div className="page" style={{ maxWidth: 560 }}>
      <div className="page-header">
        <h1>{t('client.profile.title')}</h1>
      </div>

      {/* Account type + upgrade */}
      <div className="card" style={{ padding: '16px 24px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700 }}>{t('client.profile.account_type')}</span>
          <div style={{ marginTop: 4 }}>
            {user?.compteType === 'entreprise' ? (
              <span className="role-badge" style={{ background: '#fef9c3', color: '#854d0e', borderRadius: 20, padding: '3px 12px', fontSize: '0.8rem', fontWeight: 700 }}>🏢 {t('client.profile.type_entreprise')}</span>
            ) : (
              <span className="role-badge" style={{ background: 'var(--primary-light)', color: 'var(--primary)', borderRadius: 20, padding: '3px 12px', fontSize: '0.8rem', fontWeight: 700 }}>👤 {t('client.profile.type_client')}</span>
            )}
          </div>
        </div>
        {user?.compteType !== 'entreprise' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {upgradeMsg && <span style={{ fontSize: '0.875rem', color: upgradeMsg === t('common.error') ? 'var(--danger)' : 'var(--success)' }}>{upgradeMsg}</span>}
            <button className="btn btn-primary btn-sm" onClick={handleUpgrade} disabled={upgrading}>
              {upgrading ? t('common.loading') : `🏢 ${t('client.profile.upgrade_btn')}`}
            </button>
          </div>
        )}
      </div>

      <div className="card" style={{ padding: '24px' }}>
        {success && (
          <div style={{ background: '#e6f9ee', color: '#1a7a40', border: '1px solid #b2dfc5', borderRadius: 8, padding: '10px 16px', marginBottom: 16 }}>
            {t('client.profile.success')}
          </div>
        )}
        {errors.global && (
          <div style={{ background: '#fff0f0', color: '#c00', border: '1px solid #fbb', borderRadius: 8, padding: '10px 16px', marginBottom: 16 }}>
            {errors.global}
          </div>
        )}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>{t('common.name')}</label>
            <input
              className={`input${errors.name ? ' input-error' : ''}`}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
            {errors.name && <span className="field-error">{errors.name}</span>}
          </div>
          <div className="form-group">
            <label>{t('common.email')}</label>
            <input
              className={`input${errors.email ? ' input-error' : ''}`}
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
            {errors.email && <span className="field-error">{errors.email}</span>}
          </div>
          <div className="form-group">
            <label>{t('common.phone')} <span style={{ fontSize: '0.8em', color: '#888' }}>{t('validation.phone_hint')}</span></label>
            <input
              className={`input${errors.phone ? ' input-error' : ''}`}
              value={form.phone}
              placeholder={t('validation.phone_placeholder')}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            />
            {errors.phone && <span className="field-error">{errors.phone}</span>}
          </div>

          <hr style={{ margin: '20px 0', borderColor: '#eee' }} />
          <p style={{ fontSize: '0.875rem', color: '#666', marginBottom: 12 }}>
            {t('client.profile.password_section_hint')}
          </p>

          <div className="form-group">
            <label>{t('client.profile.current_password')}</label>
            <input
              className={`input${errors.currentPassword ? ' input-error' : ''}`}
              type="password"
              value={form.currentPassword}
              onChange={(e) => setForm((f) => ({ ...f, currentPassword: e.target.value }))}
            />
            {errors.currentPassword && <span className="field-error">{errors.currentPassword}</span>}
          </div>
          <div className="form-group">
            <label>{t('client.profile.new_password')}</label>
            <input
              className={`input${errors.password ? ' input-error' : ''}`}
              type="password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            />
            {form.password && (
              <ul style={{ margin: '6px 0 0 4px', padding: 0, listStyle: 'none', fontSize: '0.8rem' }}>
                {PASSWORD_RULES.map((r) => (
                  <li key={r.label} style={{ color: r.test(form.password) ? '#1a7a40' : '#c00' }}>
                    {r.test(form.password) ? '✓' : '✗'} {r.label}
                  </li>
                ))}
              </ul>
            )}
            {errors.password && <span className="field-error">{errors.password}</span>}
          </div>
          <div className="form-group">
            <label>{t('client.profile.confirm_password')}</label>
            <input
              className={`input${errors.confirmPassword ? ' input-error' : ''}`}
              type="password"
              value={form.confirmPassword}
              onChange={(e) => setForm((f) => ({ ...f, confirmPassword: e.target.value }))}
            />
            {errors.confirmPassword && <span className="field-error">{errors.confirmPassword}</span>}
          </div>

          <div style={{ marginTop: 24 }}>
            <button type="submit" className="btn btn-primary" disabled={saving} style={{ width: '100%' }}>
              {saving ? t('common.loading') : t('client.profile.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
