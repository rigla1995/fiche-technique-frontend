import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/client';

export default function UpgradeWizard() {
  const { updateUser } = useAuth();
  const navigate = useNavigate();
  const [activiteNom, setActiviteNom] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.post('/auth/upgrade-wizard-complete', {
        activiteNom: activiteNom.trim() || undefined,
      });
      updateUser({ onboardingStep: 0 });
      navigate('/client/rapports', { replace: true });
    } catch {
      setError('Une erreur est survenue. Veuillez réessayer.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ maxWidth: 520, width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🏢</div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#111827', margin: '0 0 8px' }}>
            Votre compte a été migré vers Entreprise
          </h1>
          <p style={{ fontSize: 14, color: '#6b7280', margin: 0 }}>
            Une dernière étape : nommez votre activité pour finaliser la migration.
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ background: '#fff', borderRadius: 14, border: '1px solid #e5e7eb', padding: 28 }}>
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
