import { useState, useEffect } from 'react';
import api from '../../api/client';
import type { TarifsConfig as TarifsConfigData } from '../../types';

// Keys used in the tarifs API
const TARIF_KEYS = [
  'prix_base_activite_basique',
  'prix_base_activite_premium',
  'remise_2eme_sans_labo',
  'remise_3eme_plus_sans_labo',
  'remise_avec_labo',
  'labo_sup_mensuel',
  'gerant_sup_mensuel',
  'onboarding_sans_labo',
  'onboarding_avec_labo',
  'acheteurs_palier_10',
  'acheteurs_palier_20',
  'acheteurs_palier_50',
  'acheteurs_palier_100',
] as const;

type TarifKey = typeof TARIF_KEYS[number];
type Formule = 'basique' | 'premium';

const DEFAULTS: Record<TarifKey, number> = {
  prix_base_activite_basique:  150,
  prix_base_activite_premium:  200,
  remise_2eme_sans_labo:       20,
  remise_3eme_plus_sans_labo:  40,
  remise_avec_labo:            30,
  labo_sup_mensuel:            160,
  gerant_sup_mensuel:          80,
  onboarding_sans_labo:        500,
  onboarding_avec_labo:        700,
  acheteurs_palier_10:         50,
  acheteurs_palier_20:         90,
  acheteurs_palier_50:         150,
  acheteurs_palier_100:        220,
};

// ── Calculation helpers ──────────────────────────────────────────────────────

// Arrondi à 2 décimales — identique au calcul backend (pas d'arrondi à l'entier).
const round2 = (x: number) => Math.round(x * 100) / 100;

function getVals(editing: Record<string, string>): Record<TarifKey, number> {
  return Object.fromEntries(
    TARIF_KEYS.map((k) => [k, Number(editing[k] ?? DEFAULTS[k]) || DEFAULTS[k]])
  ) as Record<TarifKey, number>;
}

function basePrice(formule: Formule, v: Record<TarifKey, number>): number {
  return formule === 'basique' ? v.prix_base_activite_basique : v.prix_base_activite_premium;
}

function palierPrice(palier: number, v: Record<TarifKey, number>): number {
  if (palier === 10) return v.acheteurs_palier_10;
  if (palier === 20) return v.acheteurs_palier_20;
  if (palier === 50) return v.acheteurs_palier_50;
  if (palier === 100) return v.acheteurs_palier_100;
  return 0;
}

function calcMensuel(
  nbAct: number,
  hasLabo: boolean,
  nbLabos: number,
  nbGerants: number,
  formule: Formule,
  palier: number,
  v: Record<TarifKey, number>
): { activites: number; labos: number; gerants: number; acheteurs: number; total: number } {
  const base = basePrice(formule, v);
  let activites = 0;
  if (hasLabo) {
    activites = round2(nbAct * base * (1 - v.remise_avec_labo / 100));
  } else {
    for (let i = 1; i <= nbAct; i++) {
      if (i === 1) activites += base;
      else if (i === 2) activites += round2(base * (1 - v.remise_2eme_sans_labo / 100));
      else activites += round2(base * (1 - v.remise_3eme_plus_sans_labo / 100));
    }
    activites = round2(activites);
  }
  const labos = nbLabos * v.labo_sup_mensuel;
  const gerants = nbGerants * v.gerant_sup_mensuel;
  const acheteurs = palierPrice(palier, v);
  return { activites, labos, gerants, acheteurs, total: round2(activites + labos + gerants + acheteurs) };
}

function priceForTier(tier: 1 | 2 | 3, formule: Formule, v: Record<TarifKey, number>): number {
  const base = basePrice(formule, v);
  if (tier === 1) return base;
  if (tier === 2) return round2(base * (1 - v.remise_2eme_sans_labo / 100));
  return round2(base * (1 - v.remise_3eme_plus_sans_labo / 100));
}

function priceWithLabo(formule: Formule, v: Record<TarifKey, number>): number {
  return round2(basePrice(formule, v) * (1 - v.remise_avec_labo / 100));
}

// ── Inline field component ────────────────────────────────────────────────────

function TarifField({
  cle, label, hint, unit = 'DT', min = 0, max, step = 1, accentColor,
  editing, onChange, onSave, saving, saved, isDirty,
}: {
  cle: string; label: string; hint?: string; unit?: string; min?: number; max?: number; step?: number; accentColor: string;
  editing: Record<string, string>; onChange: (cle: string, val: string) => void;
  onSave: (cle: string) => void; saving: Record<string, boolean>; saved: Record<string, boolean>; isDirty: (cle: string) => boolean;
}) {
  const dirty = isDirty(cle);
  const isSaving = saving[cle];
  const isSaved = saved[cle];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 22px', borderBottom: '1px solid #f1f5f9' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{label}</div>
        {hint && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{hint}</div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ position: 'relative' }}>
          <input
            type="number" min={min} max={max} step={step}
            value={editing[cle] ?? ''}
            onChange={(e) => onChange(cle, e.target.value)}
            style={{
              width: 110, textAlign: 'right', paddingRight: 36,
              padding: '7px 36px 7px 10px', borderRadius: 8, fontSize: 14, fontWeight: 700,
              border: `1.5px solid ${dirty ? accentColor : '#e2e8f0'}`,
              background: dirty ? accentColor + '08' : '#fff',
              outline: 'none',
            }}
          />
          <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: '#94a3b8', pointerEvents: 'none' }}>
            {unit}
          </span>
        </div>
        <button
          onClick={() => onSave(cle)}
          disabled={isSaving || !dirty}
          style={{
            padding: '7px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: dirty ? 'pointer' : 'default',
            border: 'none', whiteSpace: 'nowrap', transition: 'all 0.15s',
            background: isSaved ? '#16a34a' : dirty ? accentColor : '#f1f5f9',
            color: (isSaved || dirty) ? '#fff' : '#94a3b8',
          }}
        >
          {isSaving ? '…' : isSaved ? '✓ Sauvegardé' : 'Sauvegarder'}
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function TarifsConfig() {
  const [tarifs, setTarifs] = useState<TarifsConfigData>({});
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});

  // Simulator state
  const [simAct, setSimAct] = useState(2);
  const [simLabo, setSimLabo] = useState(false);
  const [simNbLabos, setSimNbLabos] = useState(1);
  const [simGerants, setSimGerants] = useState(0);
  const [simFormule, setSimFormule] = useState<Formule>('premium');
  const [simPalier, setSimPalier] = useState(0);

  useEffect(() => {
    api.get('/api/abonnements/tarifs').then((res) => {
      setTarifs(res.data);
      const init: Record<string, string> = {};
      // Set defaults first, then override with API values
      TARIF_KEYS.forEach((k) => { init[k] = String(DEFAULTS[k]); });
      Object.entries(res.data as TarifsConfigData).forEach(([k, v]) => {
        init[k] = String(v.valeur);
      });
      setEditing(init);
    });
  }, []);

  const handleChange = (cle: string, val: string) => setEditing((ed) => ({ ...ed, [cle]: val }));

  const save = async (cle: string) => {
    setSaving((s) => ({ ...s, [cle]: true }));
    try {
      await api.put(`/api/abonnements/tarifs/${cle}`, { valeur: Number(editing[cle]) });
      setTarifs((t) => ({ ...t, [cle]: { ...(t[cle] || {}), valeur: Number(editing[cle]) } }));
      setSaved((s) => ({ ...s, [cle]: true }));
      setTimeout(() => setSaved((s) => ({ ...s, [cle]: false })), 2500);
    } finally {
      setSaving((s) => ({ ...s, [cle]: false }));
    }
  };

  const isDirty = (cle: string) =>
    String(tarifs[cle]?.valeur ?? DEFAULTS[cle as TarifKey]) !== editing[cle];

  const fieldProps = { editing, onChange: handleChange, onSave: save, saving, saved, isDirty };
  const v = getVals(editing);
  const sim = calcMensuel(simAct, simLabo, simLabo ? simNbLabos : 0, simGerants, simFormule, simLabo ? simPalier : 0, v);
  const simOnboarding = simLabo ? v.onboarding_avec_labo : v.onboarding_sans_labo;

  const cardStyle: React.CSSProperties = {
    background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb',
    overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
  };

  const sectionHeader = (icon: string, title: string, subtitle: string, gradient: string, textColor: string) => (
    <div style={{
      background: gradient, padding: '16px 22px',
      borderBottom: '1px solid rgba(0,0,0,0.06)',
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(255,255,255,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 15, fontWeight: 800, color: textColor }}>{title}</div>
        <div style={{ fontSize: 11, color: textColor + 'aa', marginTop: 1 }}>{subtitle}</div>
      </div>
    </div>
  );

  return (
    <div className="page">
      {/* Page header */}
      <div style={{
        background: 'linear-gradient(135deg, #0f766e 0%, #0d9488 55%, #14b8a6 100%)',
        borderRadius: 18, padding: '22px 28px', marginBottom: 28,
        boxShadow: '0 8px 32px rgba(39,39,42,0.28)',
        display: 'flex', alignItems: 'center', gap: 16,
      }}>
        <div style={{ width: 48, height: 48, borderRadius: 14, background: 'rgba(255,255,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>⚙️</div>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 900, color: '#fff' }}>Configuration des Tarifs</h1>
          <p style={{ margin: '3px 0 0', fontSize: '0.82rem', color: 'rgba(255,255,255,0.65)' }}>
            Carte de tarification · Dinars Tunisiens (DT)
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 24, alignItems: 'start' }}>
        {/* Left column — tarif sections */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* ── 1. Formules d'activités ─────────────────────────────── */}
          <div style={cardStyle}>
            {sectionHeader('💰', 'Formules d\'activités', 'Prix de base par activité selon la formule — référence pour le calcul des remises', 'linear-gradient(135deg,#eff6ff,#dbeafe)', '#1e40af')}
            <TarifField cle="prix_base_activite_basique" label="Formule Basique" hint="Stock + Ventes d'articles, sans Espace Produit" unit="DT/mois" min={0} step={10} accentColor="#0ea5e9" {...fieldProps} />
            <TarifField cle="prix_base_activite_premium" label="Formule Premium" hint="Basique + Espace Produit complet" unit="DT/mois" min={0} step={10} accentColor="#2563eb" {...fieldProps} />
          </div>

          {/* ── 2. Matrice sans labo ─────────────────────────────────── */}
          <div style={cardStyle}>
            {sectionHeader('📉', 'Remises dégressive — Sans Labo', 'Applicable aux clients qui n\'ont pas de labo', 'linear-gradient(135deg,#f0fdf4,#dcfce7)', '#15803d')}

            {/* Visual matrix */}
            <div style={{ padding: '16px 22px 4px', display: 'flex', gap: 10 }}>
              {([
                { tier: 1 as const, label: '1ʳᵉ activité', badge: 'Base', badgeBg: '#dcfce7', badgeText: '#15803d' },
                { tier: 2 as const, label: '2ᵉ activité',  badge: `-${v.remise_2eme_sans_labo}%`, badgeBg: '#fef3c7', badgeText: '#92400e' },
                { tier: 3 as const, label: '3ᵉ+ activités', badge: `-${v.remise_3eme_plus_sans_labo}%`, badgeBg: '#fee2e2', badgeText: '#991b1b' },
              ]).map(({ tier, label, badge, badgeBg, badgeText }) => (
                <div key={tier} style={{ flex: 1, background: '#f8fafc', borderRadius: 12, padding: '14px 12px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
                  <div style={{ fontSize: 17, fontWeight: 900, color: '#0f172a' }}>{priceForTier(tier, 'basique', v)} DT <span style={{ fontSize: 10, fontWeight: 700, color: '#0ea5e9' }}>Basique</span></div>
                  <div style={{ fontSize: 17, fontWeight: 900, color: '#0f172a', marginBottom: 6 }}>{priceForTier(tier, 'premium', v)} DT <span style={{ fontSize: 10, fontWeight: 700, color: '#2563eb' }}>Premium</span></div>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: badgeBg, color: badgeText }}>{badge}</span>
                </div>
              ))}
            </div>

            <TarifField cle="remise_2eme_sans_labo" label="Remise — 2ème activité" hint={`Effectif : ${priceForTier(2, 'basique', v)} DT (Basique) · ${priceForTier(2, 'premium', v)} DT (Premium) / mois`} unit="%" min={0} max={100} step={1} accentColor="#15803d" {...fieldProps} />
            <TarifField cle="remise_3eme_plus_sans_labo" label="Remise — 3ème activité et suivantes" hint={`Effectif : ${priceForTier(3, 'basique', v)} DT (Basique) · ${priceForTier(3, 'premium', v)} DT (Premium) / mois · s'applique aussi aux suppléments`} unit="%" min={0} max={100} step={1} accentColor="#15803d" {...fieldProps} />
          </div>

          {/* ── 3. Remise avec labo ──────────────────────────────────── */}
          <div style={cardStyle}>
            {sectionHeader('🏭', 'Remise forfaitaire — Avec Labo', 'Déclenché dès qu\'au moins 1 labo est configuré · s\'applique à toutes les activités', 'linear-gradient(135deg,#f5f3ff,#ede9fe)', '#5b21b6')}

            <div style={{ padding: '16px 22px 4px', display: 'flex', gap: 10, alignItems: 'center' }}>
              <div style={{ flex: 1, background: '#f5f3ff', borderRadius: 12, padding: '14px 18px', border: '1px solid #ddd6fe' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Toutes les activités</div>
                <div style={{ fontSize: 20, fontWeight: 900, color: '#4c1d95' }}>{priceWithLabo('basique', v)} DT <span style={{ fontSize: 10, fontWeight: 700, color: '#7c3aed' }}>Basique</span></div>
                <div style={{ fontSize: 20, fontWeight: 900, color: '#4c1d95' }}>{priceWithLabo('premium', v)} DT <span style={{ fontSize: 10, fontWeight: 700, color: '#7c3aed' }}>Premium</span></div>
                <div style={{ fontSize: 11, color: '#7c3aed', marginTop: 4 }}>par activité / mois · s'applique aussi aux suppléments</div>
              </div>
              <div style={{ textAlign: 'center', color: '#c4b5fd', fontSize: 22, padding: '0 4px' }}>→</div>
              <div style={{ flex: 1, background: '#f0fdf4', borderRadius: 12, padding: '14px 18px', border: '1px solid #bbf7d0' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#15803d', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Économie vs base</div>
                <div style={{ fontSize: 26, fontWeight: 900, color: '#166534' }}>-{v.remise_avec_labo}%</div>
                <div style={{ fontSize: 11, color: '#15803d', marginTop: 4 }}>soit -{round2(v.prix_base_activite_basique - priceWithLabo('basique', v))} DT (Basique) · -{round2(v.prix_base_activite_premium - priceWithLabo('premium', v))} DT (Premium) par activité</div>
              </div>
            </div>

            <TarifField cle="remise_avec_labo" label="Remise toutes activités — Avec Labo" hint="Appliqué dès qu'au moins 1 labo est configuré sur le compte" unit="%" min={0} max={100} step={1} accentColor="#7c3aed" {...fieldProps} />
          </div>

          {/* ── 4. Tarifs fixes ──────────────────────────────────────── */}
          <div style={cardStyle}>
            {sectionHeader('🔧', 'Tarifs fixes', 'Labo et gérant supplémentaire — prix par unité / mois', 'linear-gradient(135deg,#fff7ed,#fed7aa)', '#9a3412')}
            <TarifField cle="labo_sup_mensuel" label="Prix par Labo" hint="Par labo configuré · mois" unit="DT/mois" min={0} step={10} accentColor="#ea580c" {...fieldProps} />
            <TarifField cle="gerant_sup_mensuel" label="Prix par Gérant supplémentaire" hint="Par gérant ajouté au-delà du premier · mois" unit="DT/mois" min={0} step={10} accentColor="#ea580c" {...fieldProps} />
          </div>

          {/* ── 5. Onboarding ────────────────────────────────────────── */}
          <div style={cardStyle}>
            {sectionHeader('🎯', 'Frais d\'intégration — Onboarding', 'Versement unique à l\'activation du compte', 'linear-gradient(135deg,#f0f9ff,#bae6fd)', '#0369a1')}
            <TarifField cle="onboarding_sans_labo" label="Onboarding — Client sans Labo" hint="Versement unique · pas de labo sur le compte" unit="DT" min={0} step={50} accentColor="#0ea5e9" {...fieldProps} />
            <TarifField cle="onboarding_avec_labo" label="Onboarding — Client avec Labo" hint="Versement unique · au moins 1 labo sur le compte" unit="DT" min={0} step={50} accentColor="#0ea5e9" {...fieldProps} />
          </div>

          {/* ── 6. Option Acheteurs (paliers) ───────────────────────── */}
          <div style={cardStyle}>
            {sectionHeader('🤝', 'Option Acheteurs (paliers)', 'Supplément mensuel selon le palier d\'acheteurs · nécessite au moins 1 labo', 'linear-gradient(135deg,#fffbeb,#fef3c7)', '#78350f')}
            <TarifField cle="acheteurs_palier_10" label="Palier — 1 à 10 acheteurs" hint="Supplément mensuel pour un quota jusqu'à 10 acheteurs" unit="DT/mois" min={0} step={10} accentColor="#b45309" {...fieldProps} />
            <TarifField cle="acheteurs_palier_20" label="Palier — 11 à 20 acheteurs" hint="Supplément mensuel pour un quota jusqu'à 20 acheteurs" unit="DT/mois" min={0} step={10} accentColor="#b45309" {...fieldProps} />
            <TarifField cle="acheteurs_palier_50" label="Palier — 21 à 50 acheteurs" hint="Supplément mensuel pour un quota jusqu'à 50 acheteurs" unit="DT/mois" min={0} step={10} accentColor="#b45309" {...fieldProps} />
            <TarifField cle="acheteurs_palier_100" label="Palier — 51 à 100 acheteurs" hint="Supplément mensuel pour un quota jusqu'à 100 acheteurs" unit="DT/mois" min={0} step={10} accentColor="#b45309" {...fieldProps} />
          </div>

        </div>

        {/* Right column — simulator */}
        <div style={{ position: 'sticky', top: 24 }}>
          <div style={{ ...cardStyle, overflow: 'visible' }}>
            <div style={{
              background: 'linear-gradient(135deg,#1e1b4b,#3730a3)',
              padding: '18px 22px', borderRadius: '16px 16px 0 0',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🧮</div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>Simulateur</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 1 }}>Calcul en temps réel</div>
              </div>
            </div>

            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Controls */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* Formule */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Formule</div>
                  <select
                    value={simFormule}
                    onChange={(e) => setSimFormule(e.target.value as Formule)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 9, border: '1.5px solid #e2e8f0', fontSize: 13, fontWeight: 600, color: '#374151', background: '#f8fafc', cursor: 'pointer', outline: 'none' }}
                  >
                    <option value="basique">Basique — {v.prix_base_activite_basique} DT</option>
                    <option value="premium">Premium — {v.prix_base_activite_premium} DT</option>
                  </select>
                </div>

                {/* Nb activités */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Activités</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button key={n} onClick={() => setSimAct(n)} style={{
                        width: 38, height: 38, borderRadius: 9, border: `1.5px solid ${simAct === n ? '#4338ca' : '#e2e8f0'}`,
                        background: simAct === n ? '#4338ca' : '#f8fafc',
                        color: simAct === n ? '#fff' : '#374151',
                        fontWeight: 700, fontSize: 14, cursor: 'pointer',
                      }}>{n}</button>
                    ))}
                  </div>
                </div>

                {/* Labo toggle */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Labo</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {[false, true].map((has) => (
                      <button key={String(has)} onClick={() => { setSimLabo(has); if (!has) setSimPalier(0); }} style={{
                        padding: '7px 16px', borderRadius: 9, border: `1.5px solid ${simLabo === has ? '#7c3aed' : '#e2e8f0'}`,
                        background: simLabo === has ? '#7c3aed' : '#f8fafc',
                        color: simLabo === has ? '#fff' : '#374151',
                        fontWeight: 600, fontSize: 12, cursor: 'pointer',
                      }}>{has ? '✓ Avec labo' : '✕ Sans labo'}</button>
                    ))}
                  </div>
                </div>

                {/* Nb labos (visible only if simLabo) */}
                {simLabo && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Nb de labos</div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {[1, 2, 3].map((n) => (
                        <button key={n} onClick={() => setSimNbLabos(n)} style={{
                          width: 38, height: 38, borderRadius: 9, border: `1.5px solid ${simNbLabos === n ? '#7c3aed' : '#e2e8f0'}`,
                          background: simNbLabos === n ? '#7c3aed' : '#f8fafc',
                          color: simNbLabos === n ? '#fff' : '#374151',
                          fontWeight: 700, fontSize: 14, cursor: 'pointer',
                        }}>{n}</button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Nb gérants */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Gérants supplémentaires</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {[0, 1, 2, 3].map((n) => (
                      <button key={n} onClick={() => setSimGerants(n)} style={{
                        width: 38, height: 38, borderRadius: 9, border: `1.5px solid ${simGerants === n ? '#0369a1' : '#e2e8f0'}`,
                        background: simGerants === n ? '#0369a1' : '#f8fafc',
                        color: simGerants === n ? '#fff' : '#374151',
                        fontWeight: 700, fontSize: 14, cursor: 'pointer',
                      }}>{n}</button>
                    ))}
                  </div>
                </div>

                {/* Palier acheteurs — l'option nécessite au moins 1 labo : désactivé (et remis à 0) en mode « Sans labo » */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Palier acheteurs</div>
                  <select
                    value={simLabo ? simPalier : 0}
                    disabled={!simLabo}
                    title={!simLabo ? "L'option Acheteurs nécessite au moins 1 labo" : undefined}
                    onChange={(e) => setSimPalier(Number(e.target.value))}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 9, border: '1.5px solid #e2e8f0', fontSize: 13, fontWeight: 600, color: '#374151', background: '#f8fafc', cursor: simLabo ? 'pointer' : 'not-allowed', opacity: simLabo ? 1 : 0.55, outline: 'none' }}
                  >
                    <option value={0}>Aucun</option>
                    <option value={10}>1 à 10 acheteurs — {v.acheteurs_palier_10} DT</option>
                    <option value={20}>11 à 20 acheteurs — {v.acheteurs_palier_20} DT</option>
                    <option value={50}>21 à 50 acheteurs — {v.acheteurs_palier_50} DT</option>
                    <option value={100}>51 à 100 acheteurs — {v.acheteurs_palier_100} DT</option>
                  </select>
                </div>
              </div>

              {/* Result breakdown */}
              <div style={{ background: '#f8fafc', borderRadius: 12, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                <div style={{ padding: '10px 14px', background: '#f1f5f9', borderBottom: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Détail mensuel</div>
                </div>

                {/* Activities breakdown */}
                {Array.from({ length: simAct }, (_, i) => {
                  const tier = i + 1;
                  const price = simLabo
                    ? priceWithLabo(simFormule, v)
                    : tier === 1 ? basePrice(simFormule, v)
                    : tier === 2 ? priceForTier(2, simFormule, v)
                    : priceForTier(3, simFormule, v);
                  return (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 14px', borderBottom: '1px solid #f1f5f9' }}>
                      <span style={{ fontSize: 12, color: '#374151' }}>
                        Activité {tier} {simFormule === 'basique' ? 'Basique' : 'Premium'}
                        {!simLabo && tier === 2 && <span style={{ fontSize: 10, color: '#d97706', marginLeft: 4 }}>(-{v.remise_2eme_sans_labo}%)</span>}
                        {!simLabo && tier >= 3 && <span style={{ fontSize: 10, color: '#dc2626', marginLeft: 4 }}>(-{v.remise_3eme_plus_sans_labo}%)</span>}
                        {simLabo && <span style={{ fontSize: 10, color: '#7c3aed', marginLeft: 4 }}>(-{v.remise_avec_labo}%)</span>}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{price} DT</span>
                    </div>
                  );
                })}

                {/* Labos */}
                {simLabo && Array.from({ length: simNbLabos }, (_, i) => (
                  <div key={`labo-${i}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 14px', borderBottom: '1px solid #f1f5f9' }}>
                    <span style={{ fontSize: 12, color: '#374151' }}>Labo {i + 1}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{v.labo_sup_mensuel} DT</span>
                  </div>
                ))}

                {/* Gérants */}
                {Array.from({ length: simGerants }, (_, i) => (
                  <div key={`gerant-${i}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 14px', borderBottom: '1px solid #f1f5f9' }}>
                    <span style={{ fontSize: 12, color: '#374151' }}>Gérant {i + 1}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{v.gerant_sup_mensuel} DT</span>
                  </div>
                ))}

                {/* Option Acheteurs */}
                {simPalier > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 14px', borderBottom: '1px solid #f1f5f9' }}>
                    <span style={{ fontSize: 12, color: '#374151' }}>Option Acheteurs <span style={{ fontSize: 10, color: '#b45309', marginLeft: 4 }}>(palier {simPalier})</span></span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{sim.acheteurs} DT</span>
                  </div>
                )}

                {/* Total mensuel */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: 'linear-gradient(135deg,#eff6ff,#dbeafe)', borderTop: '2px solid #bfdbfe' }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#1e40af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total mensuel</span>
                  <span style={{ fontSize: 22, fontWeight: 900, color: '#1d4ed8' }}>{sim.total} DT</span>
                </div>
              </div>

              {/* Onboarding */}
              <div style={{ background: simLabo ? '#f5f3ff' : '#f0f9ff', borderRadius: 12, padding: '12px 16px', border: `1px solid ${simLabo ? '#ddd6fe' : '#bae6fd'}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: simLabo ? '#7c3aed' : '#0369a1', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Onboarding</div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>{simLabo ? 'Avec labo' : 'Sans labo'} · versement unique</div>
                </div>
                <span style={{ fontSize: 20, fontWeight: 900, color: simLabo ? '#4c1d95' : '#0c4a6e' }}>{simOnboarding} DT</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
