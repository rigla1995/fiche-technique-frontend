import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/client';

export default function UpgradeWizard() {
  const { updateUser } = useAuth();
  const navigate = useNavigate();
  const [activiteType, setActiviteType] = useState<'franchise' | 'distincte'>('distincte');
  const [franchiseGroup, setFranchiseGroup] = useState('');
  const [activiteNom, setActiviteNom] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (activiteType === 'franchise' && !franchiseGroup.trim()) {
      setError('Le nom du groupe franchise est requis.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.post('/auth/upgrade-wizard-complete', {
        activiteType,
        franchiseGroup: franchiseGroup.trim() || undefined,
        activiteNom: activiteNom.trim() || undefined,
      });
      updateUser({ onboardingStep: 0 });
      navigate('/client', { replace: true });
    } catch {
      setError('Une erreur est survenue. Veuillez réessayer.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ maxWidth: 520, width: '100%' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🏢</div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#111827', margin: '0 0 8px' }}>
            Votre compte a été migré vers Entreprise
          </h1>
          <p style={{ fontSize: 14, color: '#6b7280', margin: 0 }}>
            Une dernière étape : configurez votre activité pour finaliser la migration.
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ background: '#fff', borderRadius: 14, border: '1px solid #e5e7eb', padding: 28 }}>
          {/* Activite nom */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
              Nom de votre activité
            </label>
            <input
              value={activiteNom}
              onChange={(e) => setActiviteNom(e.target.value)}
              placeholder="Ex : Mon Restaurant, Ma Boulangerie..."
              style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, boxSizing: 'border-box' }}
            />
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
              Laissez vide pour conserver votre nom de compte actuel.
            </div>
          </div>

          {/* Type activite */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 10 }}>
              Type d'activité
            </label>
            <div style={{ display: 'flex', gap: 12 }}>
              {([
                { value: 'distincte', label: 'Activité distincte', desc: 'Activité indépendante avec ses propres ingrédients et catalogue.' },
                { value: 'franchise', label: 'Franchise', desc: 'Activité rattachée à un groupe franchise avec catalogue partagé.' },
              ] as const).map((opt) => (
                <label key={opt.value} style={{
                  flex: 1, cursor: 'pointer', borderRadius: 10,
                  border: `2px solid ${activiteType === opt.value ? '#2563eb' : '#e5e7eb'}`,
                  background: activiteType === opt.value ? '#eff6ff' : '#fafafa',
                  padding: '14px 16px',
                  transition: 'all 0.15s',
                }}>
                  <input
                    type="radio"
                    name="activiteType"
                    value={opt.value}
                    checked={activiteType === opt.value}
                    onChange={() => setActiviteType(opt.value)}
                    style={{ display: 'none' }}
                  />
                  <div style={{ fontWeight: 700, fontSize: 14, color: activiteType === opt.value ? '#1d4ed8' : '#374151', marginBottom: 4 }}>
                    {opt.label}
                  </div>
                  <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.4 }}>{opt.desc}</div>
                </label>
              ))}
            </div>
          </div>

          {/* Franchise group (only if franchise) */}
          {activiteType === 'franchise' && (
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                Groupe franchise <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <input
                value={franchiseGroup}
                onChange={(e) => setFranchiseGroup(e.target.value)}
                placeholder="Ex : McDonald's, Paul, Costa Coffee..."
                style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, boxSizing: 'border-box' }}
              />
            </div>
          )}

          {/* Info box */}
          <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: '10px 14px', marginBottom: 20, fontSize: 13, color: '#0369a1' }}>
            Vos fournisseurs, votre stock et vos ingrédients ont été automatiquement transférés vers votre nouvelle activité.
          </div>

          {error && (
            <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: '8px 12px', marginBottom: 16, fontSize: 13, color: '#991b1b' }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            style={{
              width: '100%', padding: '11px 0', background: saving ? '#93c5fd' : '#2563eb',
              color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: saving ? 'default' : 'pointer',
            }}
          >
            {saving ? 'Configuration en cours...' : 'Terminer la configuration →'}
          </button>
        </form>
      </div>
    </div>
  );
}
