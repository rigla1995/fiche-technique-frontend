import { useState, useEffect } from 'react';
import api from '../../api/client';
import type { TarifsConfig as TarifsConfigData } from '../../types';

const LABELS: Record<string, string> = {
  indep_mensuel:         'Mensuel Indépendant (DT)',
  indep_onboarding:      'Onboarding Indépendant (DT)',
  entreprise_mensuel:    'Mensuel Entreprise (DT)',
  entreprise_onboarding: 'Onboarding Entreprise (DT)',
  gerant_sup_mensuel:    'Gérant supplémentaire / mois (DT)',
  labo_sup_mensuel:      'Labo supplémentaire / mois (DT)',
};

export default function TarifsConfig() {
  const [tarifs, setTarifs] = useState<TarifsConfigData>({});
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});

  useEffect(() => {
    api.get('/api/abonnements/tarifs').then((res) => {
      setTarifs(res.data);
      const init: Record<string, string> = {};
      Object.entries(res.data as TarifsConfigData).forEach(([k, v]) => { init[k] = String(v.valeur); });
      setEditing(init);
    });
  }, []);

  const save = async (cle: string) => {
    setSaving((s) => ({ ...s, [cle]: true }));
    try {
      await api.put(`/api/abonnements/tarifs/${cle}`, { valeur: Number(editing[cle]) });
      setTarifs((t) => ({ ...t, [cle]: { ...t[cle], valeur: Number(editing[cle]) } }));
      setSaved((s) => ({ ...s, [cle]: true }));
      setTimeout(() => setSaved((s) => ({ ...s, [cle]: false })), 2000);
    } finally {
      setSaving((s) => ({ ...s, [cle]: false }));
    }
  };

  return (
    <div style={{ maxWidth: 600 }}>
      <h2 style={{ margin: '0 0 24px', fontSize: 20, fontWeight: 700, color: '#111827' }}>Configuration des tarifs</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {Object.entries(LABELS).map(([cle, label]) => (
          <div key={cle} style={{ background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{label}</div>
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{tarifs[cle]?.description || ''}</div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="number"
                value={editing[cle] || ''}
                onChange={(e) => setEditing((ed) => ({ ...ed, [cle]: e.target.value }))}
                style={{ width: 100, padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 14, textAlign: 'right' }}
              />
              <button
                onClick={() => save(cle)}
                disabled={saving[cle]}
                style={{
                  padding: '6px 14px', background: saved[cle] ? '#16a34a' : '#2563eb',
                  color: '#fff', border: 'none', borderRadius: 8, fontSize: 13,
                  fontWeight: 600, cursor: 'pointer', minWidth: 70,
                }}
              >
                {saving[cle] ? '...' : saved[cle] ? '✓' : 'Sauv.'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
