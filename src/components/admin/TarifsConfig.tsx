import { useState, useEffect } from 'react';
import api from '../../api/client';
import type { TarifsConfig as TarifsConfigData } from '../../types';

interface TarifSection {
  title: string;
  icon: string;
  color: string;
  bg: string;
  keys: { cle: string; label: string; hint?: string }[];
}

const SECTIONS: TarifSection[] = [
  {
    title: 'Compte Indépendant',
    icon: '👤',
    color: '#1d4ed8',
    bg: '#eff6ff',
    keys: [
      { cle: 'indep_mensuel',    label: 'Abonnement mensuel',  hint: 'Facturé chaque mois' },
      { cle: 'indep_onboarding', label: 'Frais d\'onboarding', hint: 'Formation + 7j support' },
    ],
  },
  {
    title: 'Compte Entreprise',
    icon: '🏢',
    color: '#6d28d9',
    bg: '#f5f3ff',
    keys: [
      { cle: 'entreprise_mensuel',    label: 'Abonnement mensuel',  hint: 'Facturé chaque mois' },
      { cle: 'entreprise_onboarding', label: 'Frais d\'onboarding', hint: 'Formation + 7j support' },
    ],
  },
  {
    title: 'Options supplémentaires',
    icon: '➕',
    color: '#047857',
    bg: '#f0fdf4',
    keys: [
      { cle: 'gerant_sup_mensuel', label: 'Gérant supplémentaire', hint: 'Par gérant / mois' },
      { cle: 'labo_sup_mensuel',   label: 'Labo supplémentaire',   hint: 'Par labo / mois' },
    ],
  },
];

export default function TarifsConfig() {
  const [tarifs, setTarifs] = useState<TarifsConfigData>({});
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});

  useEffect(() => {
    api.get('/api/abonnements/tarifs').then((res) => {
      setTarifs(res.data);
      const init: Record<string, string> = {};
      Object.entries(res.data as TarifsConfigData).forEach(([k, v]) => {
        init[k] = String(v.valeur);
      });
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

  const isDirty = (cle: string) => tarifs[cle] && String(tarifs[cle].valeur) !== editing[cle];

  return (
    <div className="page">
      <div className="page-header">
        <h1>⚙️ Configuration des tarifs</h1>
        <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
          Tarifs en Dinars Tunisiens (DT)
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 680 }}>
        {SECTIONS.map((section) => (
          <div key={section.title} className="card" style={{ overflow: 'hidden', padding: 0 }}>
            {/* Section header */}
            <div style={{
              background: section.bg, borderBottom: `1px solid var(--border)`,
              padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span style={{ fontSize: '1.1rem' }}>{section.icon}</span>
              <span style={{ fontWeight: 700, fontSize: '0.95rem', color: section.color }}>
                {section.title}
              </span>
            </div>

            {/* Tarif rows */}
            <div style={{ padding: '4px 0' }}>
              {section.keys.map(({ cle, label, hint }) => (
                <div key={cle} style={{
                  display: 'flex', alignItems: 'center', gap: 16,
                  padding: '14px 20px', borderBottom: '1px solid var(--border)',
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{label}</div>
                    {hint && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>{hint}</div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <div style={{ position: 'relative' }}>
                      <input
                        type="number"
                        min={0}
                        step={10}
                        className="input"
                        style={{ width: 110, textAlign: 'right', paddingRight: 36 }}
                        value={editing[cle] ?? ''}
                        onChange={(e) => setEditing((ed) => ({ ...ed, [cle]: e.target.value }))}
                      />
                      <span style={{
                        position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                        fontSize: '0.75rem', color: 'var(--text-muted)', pointerEvents: 'none',
                      }}>DT</span>
                    </div>
                    <button
                      className={`btn btn-sm ${saved[cle] ? '' : 'btn-primary'}`}
                      style={saved[cle] ? { background: '#16a34a', color: '#fff', border: 'none' } : {}}
                      onClick={() => save(cle)}
                      disabled={saving[cle] || !isDirty(cle)}
                    >
                      {saving[cle] ? '…' : saved[cle] ? '✓ Sauvegardé' : 'Sauvegarder'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
