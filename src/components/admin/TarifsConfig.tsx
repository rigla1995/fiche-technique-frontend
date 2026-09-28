import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import type { TarifsConfig as TarifsConfigData } from '../../types';

// Définitions de la grille (clés, défauts, sections, style) : ./tarifsDefs (module sans composant)
import { TARIF_KEYS, DEFAULTS, TARIF_SECTIONS, tarifCardStyle } from './tarifsDefs';
import type { TarifKey, TarifSectionDef } from './tarifsDefs';

type Formule = 'basique' | 'premium';

export function TarifSectionHeader({ icon, title, subtitle, gradient, textColor }: Pick<TarifSectionDef, 'icon' | 'title' | 'subtitle' | 'gradient' | 'textColor'>) {
  return (
    <div style={{ background: gradient, padding: '16px 22px', borderBottom: '1px solid rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(255,255,255,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 15, fontWeight: 800, color: textColor }}>{title}</div>
        <div style={{ fontSize: 11, color: textColor + 'aa', marginTop: 1 }}>{subtitle}</div>
      </div>
    </div>
  );
}

// ── Aperçu des valeurs SAISIES (hints) ───────────────────────────────────────
// Ces aperçus reflètent les champs en cours d'édition (même non sauvegardés) pour
// aider la saisie ; ils ne sont PAS un prix : le simulateur (colonne de droite)
// interroge le serveur sur la grille enregistrée.

const round2 = (x: number) => Math.round(x * 100) / 100;
const apercuRemise = (base: number, pct: number) => round2(base * (1 - pct / 100));

function getVals(editing: Record<string, string>): Record<TarifKey, number> {
  return Object.fromEntries(
    TARIF_KEYS.map((k) => {
      const x = Number(editing[k]);
      // Une valeur 0 saisie est valide (l'ancien `|| DEFAULTS[k]` la faisait retomber sur le défaut).
      return [k, Number.isFinite(x) && editing[k] !== undefined && editing[k] !== '' ? x : DEFAULTS[k]];
    })
  ) as Record<TarifKey, number>;
}

// ── Champ tarif (partagé grille générale / grille par domaine) ───────────────

export interface TarifFieldProps {
  cle: string; label: string; hint?: string; unit?: string; min?: number; max?: number; step?: number; accentColor: string;
  editing: Record<string, string>; onChange: (cle: string, val: string) => void;
  onSave: (cle: string) => void; saving: Record<string, boolean>; saved: Record<string, boolean>; isDirty: (cle: string) => boolean;
  /** Mode « grille par domaine » : valeur héritée de la grille générale (placeholder + ligne grisée). */
  inherited?: number | null;
  /** Une surcharge est ENREGISTRÉE pour cette clé (bordure accent, tag « Surcharge », bouton « ↺ Hériter »). */
  surcharge?: boolean;
  /** Retour à la valeur héritée (DELETE de la surcharge). */
  onReset?: (cle: string) => void;
}

export function TarifField({
  cle, label, hint, unit = 'DT', min = 0, max, step = 1, accentColor,
  editing, onChange, onSave, saving, saved, isDirty,
  inherited, surcharge = false, onReset,
}: TarifFieldProps) {
  const dirty = isDirty(cle);
  const isSaving = saving[cle];
  const isSaved = saved[cle];
  const domaineMode = inherited !== undefined;
  const value = editing[cle] ?? '';
  const highlight = dirty || surcharge;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 22px', borderBottom: '1px solid #f1f5f9', flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: 180 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {label}
          {surcharge && (
            <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '2px 8px', borderRadius: 10, background: accentColor + '18', color: accentColor, border: `1px solid ${accentColor}55` }}>
              Surcharge
            </span>
          )}
        </div>
        {hint && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{hint}</div>}
        {domaineMode && (
          <div style={{ fontSize: 11, color: surcharge ? '#94a3b8' : '#64748b', marginTop: 3, fontStyle: surcharge ? 'italic' : 'normal' }}>
            Héritée : {inherited ?? '—'} {unit}
            {!surcharge && !dirty && <span style={{ color: '#94a3b8' }}> · valeur de la grille générale appliquée</span>}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ position: 'relative' }}>
          <input
            type="number" min={min} max={max} step={step}
            value={value}
            placeholder={domaineMode && inherited != null ? String(inherited) : undefined}
            onChange={(e) => onChange(cle, e.target.value)}
            style={{
              width: 110, textAlign: 'right', paddingRight: 36,
              padding: '7px 36px 7px 10px', borderRadius: 8, fontSize: 14, fontWeight: 700,
              border: `1.5px solid ${highlight ? accentColor : '#e2e8f0'}`,
              background: highlight ? accentColor + '08' : '#fff',
              color: domaineMode && value === '' ? '#94a3b8' : '#0f172a',
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
        {domaineMode && surcharge && onReset && (
          <button
            onClick={() => onReset(cle)}
            disabled={isSaving}
            title="Supprimer la surcharge : la valeur de la grille générale s'applique de nouveau"
            style={{ padding: '7px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: isSaving ? 'default' : 'pointer', border: `1px solid ${accentColor}`, background: '#fff', color: accentColor, whiteSpace: 'nowrap' }}
          >
            ↺ Hériter
          </button>
        )}
      </div>
    </div>
  );
}

// ── Simulateur (serveur : GET /api/abonnements/pricing-preview) ──────────────

interface PreviewLine { label: string; unitPrice?: number; total: number }
interface PricingPreview {
  formuleActivites: Formule | null;
  activite: { nb: number; total: number; lines: PreviewLine[] };
  labo: { nb: number; unitPrice: number; total: number };
  gerant: { nb: number; unitPrice: number; total: number };
  acheteurs: { nb: number; palier: number | null; total: number };
  totalMensuel: number;
  onboardingPrice: number;
  domaine?: { id: number; slug: string; nom: string } | null;
}
interface DomaineOption { id: number; nom: string }

const simLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 };
const simSelect: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 9, border: '1.5px solid #e2e8f0', fontSize: 13, fontWeight: 600, color: '#374151', background: '#f8fafc', cursor: 'pointer', outline: 'none' };
const simRow: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 14px', borderBottom: '1px solid #f1f5f9' };

function SimButton({ on, color, onClick, children, width }: { on: boolean; color: string; onClick: () => void; children: ReactNode; width?: number }) {
  return (
    <button onClick={onClick} style={{
      width, height: 38, padding: width ? 0 : '7px 16px', borderRadius: 9, border: `1.5px solid ${on ? color : '#e2e8f0'}`,
      background: on ? color : '#f8fafc', color: on ? '#fff' : '#374151',
      fontWeight: 700, fontSize: width ? 14 : 12, cursor: 'pointer',
    }}>{children}</button>
  );
}

function Simulateur({ domaines, refreshTick }: { domaines: DomaineOption[]; refreshTick: number }) {
  const [simAct, setSimAct] = useState(2);
  const [simLabo, setSimLabo] = useState(false);
  const [simNbLabos, setSimNbLabos] = useState(1);
  const [simGerants, setSimGerants] = useState(0);
  const [simFormule, setSimFormule] = useState<Formule>('premium');
  const [simPalier, setSimPalier] = useState(0);
  const [simDomaineId, setSimDomaineId] = useState<number | ''>('');
  const [preview, setPreview] = useState<PricingPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [erreur, setErreur] = useState('');

  const nbLabos = simLabo ? simNbLabos : 0;
  const palier = simLabo ? simPalier : 0;

  // Débounce 400 ms : chaque changement de paramètre (ou sauvegarde d'un tarif → refreshTick)
  // relance l'appel serveur — le simulateur reflète la grille ENREGISTRÉE.
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      setLoading(true);
      const params: Record<string, string | number> = {
        nbActivites: simAct, nbLabos, nbGerants: simGerants, nbAcheteurs: palier, formuleActivites: simFormule,
      };
      if (simDomaineId !== '') params.domaineId = simDomaineId;
      api.get('/api/abonnements/pricing-preview', { params })
        .then(({ data }) => { if (!cancelled) { setPreview(data as PricingPreview); setErreur(''); } })
        .catch(() => { if (!cancelled) setErreur('Simulation indisponible.'); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 400);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [simAct, nbLabos, simGerants, palier, simFormule, simDomaineId, refreshTick]);

  const domaineNom = simDomaineId === '' ? 'Grille générale' : (domaines.find((d) => d.id === simDomaineId)?.nom || preview?.domaine?.nom || 'Domaine');

  return (
    <div style={{ ...tarifCardStyle, overflow: 'visible' }}>
      <div style={{ background: 'linear-gradient(135deg,#1e1b4b,#3730a3)', padding: '18px 22px', borderRadius: '16px 16px 0 0', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🧮</div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>Simulateur</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 1 }}>Calcul serveur · grille enregistrée</div>
        </div>
      </div>

      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '8px 12px', fontSize: 11, color: '#92400e', lineHeight: 1.45 }}>
          Le simulateur applique la grille <strong>enregistrée</strong> (celle qui tarife réellement les comptes). Les saisies non sauvegardées à gauche ne sont pas prises en compte.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Grille (domaine) */}
          <div>
            <div style={simLabel}>Grille tarifaire</div>
            <select value={simDomaineId} onChange={(e) => setSimDomaineId(e.target.value === '' ? '' : Number(e.target.value))} style={simSelect}>
              <option value="">Grille générale</option>
              {domaines.map((d) => <option key={d.id} value={d.id}>{d.nom}</option>)}
            </select>
            {simDomaineId !== '' && (
              <div style={{ fontSize: 11, marginTop: 5 }}>
                <Link to={`/admin/domaines/${simDomaineId}`} style={{ color: '#4338ca', fontWeight: 600 }}>Régler les surcharges de « {domaineNom} » →</Link>
              </div>
            )}
          </div>

          {/* Formule */}
          <div>
            <div style={simLabel}>Formule</div>
            <select value={simFormule} onChange={(e) => setSimFormule(e.target.value as Formule)} style={simSelect}>
              <option value="basique">Basique</option>
              <option value="premium">Premium</option>
            </select>
          </div>

          {/* Nb activités */}
          <div>
            <div style={simLabel}>Activités</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[1, 2, 3, 4, 5].map((n) => <SimButton key={n} width={38} on={simAct === n} color="#4338ca" onClick={() => setSimAct(n)}>{n}</SimButton>)}
            </div>
          </div>

          {/* Labo toggle */}
          <div>
            <div style={simLabel}>Labo</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {[false, true].map((has) => (
                <SimButton key={String(has)} on={simLabo === has} color="#7c3aed" onClick={() => { setSimLabo(has); if (!has) setSimPalier(0); }}>
                  {has ? '✓ Avec labo' : '✕ Sans labo'}
                </SimButton>
              ))}
            </div>
          </div>

          {simLabo && (
            <div>
              <div style={simLabel}>Nb de labos</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {[1, 2, 3].map((n) => <SimButton key={n} width={38} on={simNbLabos === n} color="#7c3aed" onClick={() => setSimNbLabos(n)}>{n}</SimButton>)}
              </div>
            </div>
          )}

          {/* Nb gérants */}
          <div>
            <div style={simLabel}>Gérants supplémentaires</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {[0, 1, 2, 3].map((n) => <SimButton key={n} width={38} on={simGerants === n} color="#0369a1" onClick={() => setSimGerants(n)}>{n}</SimButton>)}
            </div>
          </div>

          {/* Palier acheteurs — l'option nécessite au moins 1 labo : désactivé (et remis à 0) en mode « Sans labo » */}
          <div>
            <div style={simLabel}>Palier acheteurs</div>
            <select
              value={palier}
              disabled={!simLabo}
              title={!simLabo ? "L'option Acheteurs nécessite au moins 1 labo" : undefined}
              onChange={(e) => setSimPalier(Number(e.target.value))}
              style={{ ...simSelect, cursor: simLabo ? 'pointer' : 'not-allowed', opacity: simLabo ? 1 : 0.55 }}
            >
              <option value={0}>Aucun</option>
              <option value={10}>1 à 10 acheteurs</option>
              <option value={20}>11 à 20 acheteurs</option>
              <option value={50}>21 à 50 acheteurs</option>
              <option value={100}>51 à 100 acheteurs</option>
            </select>
          </div>
        </div>

        {/* Result breakdown */}
        <div style={{ background: '#f8fafc', borderRadius: 12, overflow: 'hidden', border: '1px solid #e2e8f0', opacity: loading ? 0.6 : 1, transition: 'opacity 0.15s' }}>
          <div style={{ padding: '10px 14px', background: '#f1f5f9', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Détail mensuel</div>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#4338ca', background: '#e0e7ff', borderRadius: 10, padding: '2px 8px' }}>Grille : {domaineNom}</span>
          </div>

          {erreur && <div style={{ padding: '10px 14px', fontSize: 12, color: '#b91c1c' }}>{erreur}</div>}
          {!erreur && !preview && <div style={{ padding: '10px 14px', fontSize: 12, color: '#94a3b8' }}>Calcul…</div>}

          {preview && (
            <>
              {preview.activite.lines.map((l, i) => (
                <div key={`act-${i}`} style={simRow}>
                  <span style={{ fontSize: 12, color: '#374151' }}>{l.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{l.total} DT</span>
                </div>
              ))}
              {preview.labo.nb > 0 && (
                <div style={simRow}>
                  <span style={{ fontSize: 12, color: '#374151' }}>{preview.labo.nb} labo{preview.labo.nb > 1 ? 's' : ''} × {preview.labo.unitPrice} DT</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{preview.labo.total} DT</span>
                </div>
              )}
              {preview.gerant.nb > 0 && (
                <div style={simRow}>
                  <span style={{ fontSize: 12, color: '#374151' }}>{preview.gerant.nb} gérant{preview.gerant.nb > 1 ? 's' : ''} supp. × {preview.gerant.unitPrice} DT</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{preview.gerant.total} DT</span>
                </div>
              )}
              {preview.acheteurs.nb > 0 && (
                <div style={simRow}>
                  <span style={{ fontSize: 12, color: '#374151' }}>Option Acheteurs <span style={{ fontSize: 10, color: '#b45309', marginLeft: 4 }}>(palier {preview.acheteurs.palier ?? preview.acheteurs.nb})</span></span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{preview.acheteurs.total} DT</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: 'linear-gradient(135deg,#eff6ff,#dbeafe)', borderTop: '2px solid #bfdbfe' }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: '#1e40af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total mensuel</span>
                <span style={{ fontSize: 22, fontWeight: 900, color: '#1d4ed8' }}>{preview.totalMensuel} DT</span>
              </div>
            </>
          )}
        </div>

        {/* Onboarding */}
        {preview && (
          <div style={{ background: simLabo ? '#f5f3ff' : '#f0f9ff', borderRadius: 12, padding: '12px 16px', border: `1px solid ${simLabo ? '#ddd6fe' : '#bae6fd'}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: simLabo ? '#7c3aed' : '#0369a1', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Onboarding</div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>{simLabo ? 'Avec labo' : 'Sans labo'} · versement unique</div>
            </div>
            <span style={{ fontSize: 20, fontWeight: 900, color: simLabo ? '#4c1d95' : '#0c4a6e' }}>{preview.onboardingPrice} DT</span>
          </div>
        )}
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
  const [domaines, setDomaines] = useState<DomaineOption[]>([]);
  const [refreshTick, setRefreshTick] = useState(0);

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
    api.get('/api/domaines')
      .then(({ data }) => setDomaines((Array.isArray(data) ? data : []).map((d: { id: number; nom: string }) => ({ id: d.id, nom: d.nom }))))
      .catch(() => setDomaines([]));
  }, []);

  const handleChange = (cle: string, val: string) => setEditing((ed) => ({ ...ed, [cle]: val }));

  const save = async (cle: string) => {
    setSaving((s) => ({ ...s, [cle]: true }));
    try {
      await api.put(`/api/abonnements/tarifs/${cle}`, { valeur: Number(editing[cle]) });
      setTarifs((t) => ({ ...t, [cle]: { ...(t[cle] || {}), valeur: Number(editing[cle]), valeurGenerale: Number(editing[cle]) } }));
      setSaved((s) => ({ ...s, [cle]: true }));
      setRefreshTick((n) => n + 1);
      setTimeout(() => setSaved((s) => ({ ...s, [cle]: false })), 2500);
    } finally {
      setSaving((s) => ({ ...s, [cle]: false }));
    }
  };

  const isDirty = (cle: string) =>
    String(tarifs[cle]?.valeur ?? DEFAULTS[cle as TarifKey]) !== editing[cle];

  const fieldProps = { editing, onChange: handleChange, onSave: save, saving, saved, isDirty };
  const v = getVals(editing);

  // Hints dynamiques (aperçu des valeurs saisies) pour les remises
  const dynamicHint: Partial<Record<TarifKey, string>> = {
    remise_2eme_sans_labo: `Effectif : ${apercuRemise(v.prix_base_activite_basique, v.remise_2eme_sans_labo)} DT (Basique) · ${apercuRemise(v.prix_base_activite_premium, v.remise_2eme_sans_labo)} DT (Premium) / mois`,
    remise_3eme_plus_sans_labo: `Effectif : ${apercuRemise(v.prix_base_activite_basique, v.remise_3eme_plus_sans_labo)} DT (Basique) · ${apercuRemise(v.prix_base_activite_premium, v.remise_3eme_plus_sans_labo)} DT (Premium) / mois · s'applique aussi aux suppléments`,
  };

  const apercuSection = (key: string): ReactNode => {
    if (key === 'sans_labo') {
      return (
        <div style={{ padding: '16px 22px 4px', display: 'flex', gap: 10 }}>
          {([
            { tier: 1, pct: 0, label: '1ʳᵉ activité', badge: 'Base', badgeBg: '#dcfce7', badgeText: '#15803d' },
            { tier: 2, pct: v.remise_2eme_sans_labo, label: '2ᵉ activité', badge: `-${v.remise_2eme_sans_labo}%`, badgeBg: '#fef3c7', badgeText: '#92400e' },
            { tier: 3, pct: v.remise_3eme_plus_sans_labo, label: '3ᵉ+ activités', badge: `-${v.remise_3eme_plus_sans_labo}%`, badgeBg: '#fee2e2', badgeText: '#991b1b' },
          ]).map(({ tier, pct, label, badge, badgeBg, badgeText }) => (
            <div key={tier} style={{ flex: 1, background: '#f8fafc', borderRadius: 12, padding: '14px 12px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
              <div style={{ fontSize: 17, fontWeight: 900, color: '#0f172a' }}>{apercuRemise(v.prix_base_activite_basique, pct)} DT <span style={{ fontSize: 10, fontWeight: 700, color: '#0ea5e9' }}>Basique</span></div>
              <div style={{ fontSize: 17, fontWeight: 900, color: '#0f172a', marginBottom: 6 }}>{apercuRemise(v.prix_base_activite_premium, pct)} DT <span style={{ fontSize: 10, fontWeight: 700, color: '#2563eb' }}>Premium</span></div>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: badgeBg, color: badgeText }}>{badge}</span>
            </div>
          ))}
        </div>
      );
    }
    if (key === 'avec_labo') {
      const bas = apercuRemise(v.prix_base_activite_basique, v.remise_avec_labo);
      const pre = apercuRemise(v.prix_base_activite_premium, v.remise_avec_labo);
      return (
        <div style={{ padding: '16px 22px 4px', display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ flex: 1, background: '#f5f3ff', borderRadius: 12, padding: '14px 18px', border: '1px solid #ddd6fe' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Toutes les activités</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#4c1d95' }}>{bas} DT <span style={{ fontSize: 10, fontWeight: 700, color: '#7c3aed' }}>Basique</span></div>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#4c1d95' }}>{pre} DT <span style={{ fontSize: 10, fontWeight: 700, color: '#7c3aed' }}>Premium</span></div>
            <div style={{ fontSize: 11, color: '#7c3aed', marginTop: 4 }}>par activité / mois · s'applique aussi aux suppléments</div>
          </div>
          <div style={{ textAlign: 'center', color: '#c4b5fd', fontSize: 22, padding: '0 4px' }}>→</div>
          <div style={{ flex: 1, background: '#f0fdf4', borderRadius: 12, padding: '14px 18px', border: '1px solid #bbf7d0' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#15803d', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Économie vs base</div>
            <div style={{ fontSize: 26, fontWeight: 900, color: '#166534' }}>-{v.remise_avec_labo}%</div>
            <div style={{ fontSize: 11, color: '#15803d', marginTop: 4 }}>soit -{round2(v.prix_base_activite_basique - bas)} DT (Basique) · -{round2(v.prix_base_activite_premium - pre)} DT (Premium) par activité</div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="page">
      {/* Page header */}
      <div style={{
        background: 'linear-gradient(135deg, #0f766e 0%, #0d9488 55%, #14b8a6 100%)',
        borderRadius: 18, padding: '22px 28px', marginBottom: 20,
        boxShadow: '0 8px 32px rgba(39,39,42,0.28)',
        display: 'flex', alignItems: 'center', gap: 16,
      }}>
        <div style={{ width: 48, height: 48, borderRadius: 14, background: 'rgba(255,255,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>⚙️</div>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 900, color: '#fff' }}>Configuration des Tarifs</h1>
          <p style={{ margin: '3px 0 0', fontSize: '0.82rem', color: 'rgba(255,255,255,0.65)' }}>
            Grille générale · Dinars Tunisiens (DT)
          </p>
        </div>
      </div>

      {/* Bandeau : surcharges par domaine */}
      <div style={{ background: 'linear-gradient(135deg,#fffbeb,#fef3c7)', border: '1px solid #fcd34d', borderRadius: 12, padding: '12px 16px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 18 }}>🗂️</span>
        <div style={{ flex: 1, fontSize: '0.84rem', color: '#78350f', lineHeight: 1.45 }}>
          Cette page règle la <strong>grille générale</strong>. Les <strong>surcharges par domaine</strong> se règlent dans{' '}
          <Link to="/admin/domaines" style={{ color: '#b45309', fontWeight: 700 }}>Domaines d'activités</Link> → [domaine] → onglet <strong>Grille tarifaire</strong>.
          {domaines.length > 0 && (
            <span style={{ display: 'block', marginTop: 4, fontSize: '0.78rem' }}>
              {domaines.map((d, i) => (
                <span key={d.id}>{i > 0 && ' · '}<Link to={`/admin/domaines/${d.id}`} style={{ color: '#92400e', fontWeight: 600 }}>{d.nom}</Link></span>
              ))}
            </span>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 24, alignItems: 'start' }}>
        {/* Left column — tarif sections */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {TARIF_SECTIONS.map((s) => (
            <div key={s.key} style={tarifCardStyle}>
              <TarifSectionHeader icon={s.icon} title={s.title} subtitle={s.subtitle} gradient={s.gradient} textColor={s.textColor} />
              {apercuSection(s.key)}
              {s.fields.map((f) => (
                <TarifField key={f.cle} {...f} hint={dynamicHint[f.cle] ?? f.hint} {...fieldProps} />
              ))}
            </div>
          ))}
        </div>

        {/* Right column — simulator (serveur) */}
        <div style={{ position: 'sticky', top: 24 }}>
          <Simulateur domaines={domaines} refreshTick={refreshTick} />
        </div>
      </div>
    </div>
  );
}
