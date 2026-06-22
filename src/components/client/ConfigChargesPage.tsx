import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../api/client';
import HelpButton from '../common/HelpButton';
import type { Activite } from '../../types';

const apiMsg = (e: unknown, fallback = 'Erreur') =>
  (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;

const fmtMoney = (n: number | null | undefined) => {
  if (n == null) return '—';
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' DT';
};

const C = '#b45309';
const CD = '#78350f';
const CL = '#fffbeb';
const CB = '#fcd34d';

interface ChargesFixes {
  id?: string;
  activite_id?: number;
  mode: 'global' | 'detail';
  montant_global?: number | null;
  loyer?: number | null;
  charges_personnel?: number | null;
  electricite_gaz?: number | null;
  eau?: number | null;
}

const DETAIL_FIELDS = [
  { key: 'loyer' as const, label: '🏠 Loyer', icon: '🏠' },
  { key: 'charges_personnel' as const, label: '👥 Charges personnel', icon: '👥' },
  { key: 'electricite_gaz' as const, label: '⚡ Électricité / Gaz', icon: '⚡' },
  { key: 'eau' as const, label: '💧 Eau', icon: '💧' },
] as const;

export default function ConfigChargesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activites, setActivites] = useState<Activite[]>([]);
  const [selectedActiviteId, setSelectedActiviteId] = useState<number | null>(null);
  const [charges, setCharges] = useState<ChargesFixes | null>(null);
  const [chargesForm, setChargesForm] = useState<ChargesFixes>({ mode: 'global' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get('/api/entreprise/activites').then(({ data }) => {
      const acts = data as Activite[];
      setActivites(acts);
      const paramId = searchParams.get('activiteId');
      const found = acts.find(a => String(a.id) === paramId);
      setSelectedActiviteId(found ? found.id : acts[0]?.id ?? null);
    }).catch(() => {});
  }, []);

  const loadCharges = useCallback(() => {
    if (!selectedActiviteId) return;
    api.get(`/api/charges-fixes?activiteId=${selectedActiviteId}`).then(({ data }) => {
      const ch = data as ChargesFixes | null;
      setCharges(ch);
      setChargesForm(ch || { mode: 'global' });
    }).catch(() => {});
  }, [selectedActiviteId]);

  useEffect(() => { loadCharges(); }, [loadCharges]);

  const handleSave = async () => {
    if (!selectedActiviteId) return;
    setSaving(true); setError(''); setSaved(false);
    try {
      await api.post('/api/charges-fixes', { ...chargesForm, activite_id: selectedActiviteId });
      setSaved(true);
      loadCharges();
      setTimeout(() => setSaved(false), 2500);
    } catch (e: unknown) {
      setError(apiMsg(e));
    } finally {
      setSaving(false);
    }
  };

  const totalCharges = chargesForm.mode === 'global'
    ? (chargesForm.montant_global ?? 0)
    : DETAIL_FIELDS.reduce((s, f) => s + (chargesForm[f.key] ?? 0), 0);

  const chargesMensuelles = totalCharges / 12;

  return (
    <div className="page-content">
      {/* Hero */}
      <div style={{
        background: `linear-gradient(135deg, ${CD} 0%, ${C} 55%, #d97706 100%)`,
        borderRadius: 18, padding: '24px 28px', marginBottom: 24,
        boxShadow: '0 8px 32px rgba(180,83,9,0.28)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>🏗️</div>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>
              Config Charges
            <HelpButton section="charges" variant="solid" size={18} tip="Aide" /></h1>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.82)', margin: 0, fontSize: '0.85rem' }}>
            Charges fixes annuelles — utilisées pour calculer le seuil de rentabilité
          </p>
        </div>
        {totalCharges > 0 && (
          <div style={{ background: 'rgba(255,255,255,0.18)', borderRadius: 12, padding: '10px 18px', textAlign: 'center' }}>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#fff' }}>{fmtMoney(totalCharges)}</div>
            <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.8)' }}>charges annuelles</div>
          </div>
        )}
      </div>

      {/* Activité selector */}
      {activites.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 20, padding: '10px 14px', background: '#fff', borderRadius: 10, border: `1px solid ${CB}` }}>
          {activites.map(a => (
            <button key={a.id} onClick={() => { setSelectedActiviteId(a.id); setSearchParams({ activiteId: String(a.id) }); }}
              style={{
                padding: '4px 14px', borderRadius: 20, cursor: 'pointer', fontSize: '0.82rem',
                border: selectedActiviteId === a.id ? `1.5px solid ${C}` : `1.5px solid ${CB}`,
                background: selectedActiviteId === a.id ? C : CL,
                color: selectedActiviteId === a.id ? '#fff' : CD,
                fontWeight: selectedActiviteId === a.id ? 700 : 400,
              }}>
              {a.nom}
            </button>
          ))}
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', alignSelf: 'center', marginLeft: 4 }}>← sélectionner l'activité</span>
        </div>
      )}

      {!selectedActiviteId ? (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '60px 0' }}>Aucune activité disponible</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Mode toggle */}
          <div style={{ background: '#fff', borderRadius: 16, border: `1.5px solid ${CB}`, overflow: 'hidden', boxShadow: '0 4px 20px rgba(180,83,9,0.08)' }}>
            <div style={{ background: `linear-gradient(135deg, ${CD}18 0%, ${C}12 100%)`, borderBottom: `1.5px solid ${CB}`, padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ background: C + '22', borderRadius: 8, padding: '6px 8px', fontSize: '1rem' }}>🏗️</div>
              <div>
                <div style={{ fontSize: '1rem', fontWeight: 800, color: CD }}>Mode de saisie</div>
                <div style={{ fontSize: '0.72rem', color: C }}>Choisissez entre montant global ou détail par poste</div>
              </div>
            </div>
            <div style={{ padding: '20px 24px' }}>
              <div style={{ display: 'flex', gap: 10 }}>
                {(['global', 'detail'] as const).map(m => (
                  <button key={m} onClick={() => setChargesForm(f => ({ ...f, mode: m }))}
                    style={{
                      padding: '10px 22px', borderRadius: 10, cursor: 'pointer', fontWeight: chargesForm.mode === m ? 700 : 500, fontSize: '0.9rem',
                      background: chargesForm.mode === m ? C : 'var(--bg)',
                      color: chargesForm.mode === m ? '#fff' : 'var(--text)',
                      border: chargesForm.mode === m ? `1.5px solid ${C}` : '1.5px solid var(--border)',
                      boxShadow: chargesForm.mode === m ? `0 2px 8px ${C}44` : 'none',
                    }}>
                    {m === 'global' ? '📊 Montant global' : '📋 Détail par poste'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Form */}
          <div style={{ background: '#fff', borderRadius: 16, border: `1.5px solid ${CB}`, overflow: 'hidden', boxShadow: '0 4px 20px rgba(180,83,9,0.08)' }}>
            <div style={{ background: `linear-gradient(135deg, ${CD}18 0%, ${C}12 100%)`, borderBottom: `1.5px solid ${CB}`, padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ background: C + '22', borderRadius: 8, padding: '6px 8px', fontSize: '1rem' }}>
                {chargesForm.mode === 'global' ? '📊' : '📋'}
              </div>
              <div>
                <div style={{ fontSize: '1rem', fontWeight: 800, color: CD }}>
                  {chargesForm.mode === 'global' ? 'Montant annuel global' : 'Détail par poste de charge'}
                </div>
                <div style={{ fontSize: '0.72rem', color: C }}>Saisissez les charges en dinars tunisiens (DT/an)</div>
              </div>
            </div>
            <div style={{ padding: '24px' }}>
              {chargesForm.mode === 'global' ? (
                <div style={{ maxWidth: 400 }}>
                  <label style={{ fontSize: '0.82rem', fontWeight: 700, display: 'block', marginBottom: 8, color: CD }}>Charges fixes annuelles totales (DT)</label>
                  <div style={{ position: 'relative' }}>
                    <input type="number" min="0" step="100" value={chargesForm.montant_global ?? ''}
                      onChange={e => setChargesForm(f => ({ ...f, montant_global: e.target.value ? parseFloat(e.target.value) : null }))}
                      placeholder="0.00"
                      style={{ width: '100%', padding: '12px 50px 12px 14px', borderRadius: 10, border: `1.5px solid ${CB}`, background: CL, fontSize: '1.1rem', fontWeight: 700, color: CD, outline: 'none', boxSizing: 'border-box' }} />
                    <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: C, fontWeight: 700, fontSize: '0.85rem', pointerEvents: 'none' }}>DT</span>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
                  {DETAIL_FIELDS.map(({ key, label, icon }) => (
                    <div key={key} style={{ background: CL, borderRadius: 12, padding: '16px', border: `1px solid ${CB}` }}>
                      <label style={{ fontSize: '0.82rem', fontWeight: 700, display: 'block', marginBottom: 8, color: CD }}>
                        {icon} {label.replace(/^[^\s]+\s/, '')} (DT/an)
                      </label>
                      <div style={{ position: 'relative' }}>
                        <input type="number" min="0" step="100" value={chargesForm[key] ?? ''}
                          onChange={e => setChargesForm(f => ({ ...f, [key]: e.target.value ? parseFloat(e.target.value) : null }))}
                          placeholder="0.00"
                          style={{ width: '100%', padding: '9px 45px 9px 12px', borderRadius: 9, border: `1.5px solid ${CB}`, background: '#fff', fontSize: '1rem', fontWeight: 600, color: CD, outline: 'none', boxSizing: 'border-box' }} />
                        <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: C, fontWeight: 700, fontSize: '0.75rem', pointerEvents: 'none' }}>DT</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Totaux */}
          {totalCharges > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
              {[
                { icon: '📅', label: 'Total annuel', value: fmtMoney(totalCharges), highlight: true },
                { icon: '📆', label: 'Mensuel (÷12)', value: fmtMoney(chargesMensuelles), highlight: false },
              ].map(({ icon, label, value, highlight }) => (
                <div key={label} style={{ background: highlight ? CL : '#fff', borderRadius: 12, border: `1.5px solid ${highlight ? C : CB}`, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ fontSize: '1.5rem' }}>{icon}</div>
                  <div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 800, color: C }}>{value}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{label}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {error && (
            <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 10, padding: '10px 16px', color: '#dc2626', fontSize: '0.85rem' }}>
              ⚠️ {error}
            </div>
          )}

          {saved && (
            <div style={{ background: '#dcfce7', border: '1px solid #86efac', borderRadius: 10, padding: '10px 16px', color: '#166534', fontSize: '0.88rem', fontWeight: 600 }}>
              ✓ Charges fixes enregistrées avec succès
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={handleSave} disabled={saving}
              style={{ padding: '11px 28px', borderRadius: 10, border: 'none', background: saving ? '#d1d5db' : `linear-gradient(135deg, ${CD} 0%, ${C} 100%)`, color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.95rem', boxShadow: saving ? 'none' : `0 4px 14px ${C}44` }}>
              {saving ? 'Enregistrement…' : charges ? '✓ Mettre à jour' : '✓ Enregistrer'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
