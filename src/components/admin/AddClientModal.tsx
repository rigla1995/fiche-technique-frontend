import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../../api/client';
import type { DomaineActivite, Promotion } from '../../types';
import { MonthPicker } from './MonthPicker';
import { useEmailCheck } from '../../hooks/useEmailCheck';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ActLine { label: string; unitPrice?: number; total: number; }
interface PricingPreview {
  formuleActivites?: 'basique' | 'premium' | null;
  activite: { nb: number; total: number; lines?: ActLine[] };
  labo:     { nb: number; unitPrice: number; total: number };
  gerant:   { nb: number; unitPrice: number; total: number };
  acheteurs?: { nb: number; palier: 10 | 20 | 50 | 100 | null; total: number };
  totalMensuel: number;
  onboardingPrice?: number;
}

type Formule = 'basique' | 'premium';

interface PromoForm {
  type: Promotion['type'];
  appliesTo: string;
  moisDebut: string;
  months: string;
  discountVal: string;
  fixedVal: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const TUNISIAN_PHONE = /^(\+216[\s-]?)?[2579]\d{7}$/;
const fmt = (n: number) => `${n.toLocaleString('fr-FR')} DT`;

// ── Step indicator ────────────────────────────────────────────────────────────

const STEPS = ['Informations', 'Configuration', 'Promotions', 'Contrat'];

function StepIndicator({ current }: { current: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 28 }}>
      {STEPS.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : 0 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: done ? '#4338ca' : active ? '#6366f1' : '#e2e8f0',
                color: done || active ? '#fff' : '#9ca3af',
                fontSize: 13, fontWeight: 700,
                boxShadow: active ? '0 0 0 3px #c7d2fe' : 'none',
                transition: 'all 0.2s',
              }}>
                {done ? '✓' : i + 1}
              </div>
              <span style={{ fontSize: 10, fontWeight: active ? 700 : 500, color: active ? '#4338ca' : done ? '#6366f1' : '#9ca3af', whiteSpace: 'nowrap' }}>
                {s}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div style={{ flex: 1, height: 2, background: done ? '#6366f1' : '#e2e8f0', margin: '0 6px', marginBottom: 18, transition: 'background 0.2s' }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Promo helpers ─────────────────────────────────────────────────────────────

function applyPromoToBase(base: number, p: PromoForm): number {
  if (p.type === 'free_months') return 0;
  if (p.type === 'percent_off' && p.discountVal) return Math.round(base * (1 - parseFloat(p.discountVal) / 100) * 100) / 100;
  if (p.type === 'fixed_price' && p.fixedVal) return parseFloat(p.fixedVal);
  return base;
}
function promoShortLabel(p: PromoForm): string {
  if (p.type === 'free_months') return 'Gratuit';
  if (p.type === 'percent_off') return `-${p.discountVal}%`;
  return `-${p.fixedVal} DT`;
}
function promoDurStr(p: PromoForm): string {
  if (!p.months) return 'Permanent';
  return `${p.months} mois${p.moisDebut ? ` à partir de ${p.moisDebut}` : ''}`;
}

// ── Pricing card ──────────────────────────────────────────────────────────────

function PricingCard({ preview, promos }: { preview: PricingPreview | null; promos?: PromoForm[] }) {
  if (!preview) return null;
  const ob = preview.onboardingPrice ?? 0;

  const mensPromo = promos?.find((p) => ['mensualite', 'les_deux'].includes(p.appliesTo));
  const obPromo   = promos?.find((p) => ['onboarding', 'les_deux'].includes(p.appliesTo));

  const effectifMensuel    = mensPromo ? applyPromoToBase(preview.totalMensuel, mensPromo) : preview.totalMensuel;
  const effectifOnboarding = obPromo   ? applyPromoToBase(ob, obPromo) : ob;

  const PromoRow = ({ p, base, effectif }: { p: PromoForm; base: number; effectif: number }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', paddingLeft: 8, marginTop: 2 }}>
      <span style={{ fontSize: 11, color: '#94a3b8', textDecoration: 'line-through' }}>{fmt(base)}</span>
      <span style={{ fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 6, background: '#fef3c7', color: '#92400e' }}>
        🏷️ {promoShortLabel(p)}
      </span>
      <span style={{ fontSize: 10, color: '#6b7280' }}>{promoDurStr(p)}</span>
      <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 800, color: effectif === 0 ? '#16a34a' : '#1d4ed8' }}>{fmt(effectif)}</span>
    </div>
  );

  const row = (label: string, total: number, sub?: string) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 12 }}>
      <span style={{ color: '#374151' }}>{label}{sub && <span style={{ color: '#94a3b8', marginLeft: 4 }}>{sub}</span>}</span>
      <span style={{ fontWeight: 700, color: '#1d4ed8', whiteSpace: 'nowrap', marginLeft: 8 }}>{fmt(total)}</span>
    </div>
  );

  return (
    <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 12, padding: '16px 18px', marginTop: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#1d4ed8', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Récapitulatif tarifaire</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {/* Formule d'activités — entête des lignes activités */}
        {preview.formuleActivites && preview.activite.nb > 0 && (
          <div style={{ fontSize: 10, fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Formule : Activité {preview.formuleActivites === 'basique' ? 'Basique' : 'Premium'}
          </div>
        )}
        {/* Activity breakdown — tier lines */}
        {preview.activite.lines && preview.activite.lines.length > 0
          ? preview.activite.lines.map((l, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, paddingLeft: i > 0 ? 8 : 0 }}>
                <span style={{ color: i === 0 ? '#374151' : '#64748b' }}>
                  {i > 0 && <span style={{ marginRight: 4, color: '#c7d2fe' }}>↳</span>}
                  {l.label}
                </span>
                <span style={{ fontWeight: i === 0 ? 600 : 500, color: '#1d4ed8' }}>{fmt(l.total)}</span>
              </div>
            ))
          : preview.activite.nb > 0 && row(`${preview.activite.nb} Activité${preview.activite.nb > 1 ? 's' : ''}`, preview.activite.total)
        }
        {preview.activite.lines && preview.activite.lines.length > 1 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#6366f1', fontWeight: 700, marginTop: 2 }}>
            <span>Total activités ({preview.activite.nb})</span>
            <span>{fmt(preview.activite.total)}</span>
          </div>
        )}
        {preview.labo.nb > 0 && row(`${preview.labo.nb} Labo${preview.labo.nb > 1 ? 's' : ''}`, preview.labo.total, `(${preview.labo.nb} × ${fmt(preview.labo.unitPrice)})`)}
        {preview.gerant.nb > 0 && row(`${preview.gerant.nb} Gérant${preview.gerant.nb > 1 ? 's' : ''}`, preview.gerant.total, `(${preview.gerant.nb} × ${fmt(preview.gerant.unitPrice)})`)}
        {preview.acheteurs && preview.acheteurs.total > 0 && row(`Option Acheteurs (palier jusqu'à ${preview.acheteurs.palier ?? preview.acheteurs.nb})`, preview.acheteurs.total)}

        {/* Mensualité total + optional promo */}
        <div style={{ borderTop: '1px solid #bfdbfe', paddingTop: 8, marginTop: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#1e40af' }}>Mensualité</span>
            <span style={{ fontSize: mensPromo ? 12 : 14, fontWeight: 800, color: '#1e40af', textDecoration: mensPromo ? 'line-through' : 'none', opacity: mensPromo ? 0.5 : 1 }}>
              {fmt(preview.totalMensuel)}
            </span>
          </div>
          {mensPromo && <PromoRow p={mensPromo} base={preview.totalMensuel} effectif={effectifMensuel} />}
          {mensPromo && (
            <div style={{ fontSize: 10, color: '#6b7280', marginTop: 3, paddingLeft: 8 }}>
              Puis {fmt(preview.totalMensuel)}/mois après expiration de la promo
            </div>
          )}
        </div>

        {/* Onboarding + optional promo */}
        {ob > 0 && (
          <div style={{ background: '#fff', borderRadius: 6, padding: '8px 10px', marginTop: 2, border: '1px solid #dbeafe' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 12, color: '#374151' }}>Onboarding <span style={{ color: '#94a3b8' }}>(paiement unique)</span></span>
              <span style={{ fontSize: obPromo ? 11 : 12, fontWeight: 700, color: '#0369a1', textDecoration: obPromo ? 'line-through' : 'none', opacity: obPromo ? 0.5 : 1 }}>
                {fmt(ob)}
              </span>
            </div>
            {obPromo && <PromoRow p={obPromo} base={ob} effectif={effectifOnboarding} />}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Counter input ─────────────────────────────────────────────────────────────

function Counter({ label, sub, value, onChange, min = 0 }: {
  label: string; sub: string; value: number; onChange: (n: number) => void; min?: number;
}) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{label}</div>
        <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{sub}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          style={{
            width: 32, height: 32, borderRadius: '50%', border: '1.5px solid #e2e8f0',
            background: value <= min ? '#f8fafc' : '#f1f5f9',
            color: value <= min ? '#cbd5e1' : '#334155',
            fontSize: 18, cursor: value <= min ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, lineHeight: 1,
          }}>−</button>
        <span style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', minWidth: 24, textAlign: 'center' }}>{value}</span>
        <button
          type="button"
          onClick={() => onChange(value + 1)}
          style={{
            width: 32, height: 32, borderRadius: '50%', border: '1.5px solid #6366f1',
            background: '#6366f1', color: '#fff',
            fontSize: 18, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, lineHeight: 1,
          }}>+</button>
      </div>
    </div>
  );
}

// ── Main Modal ────────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

export default function AddClientModal({ onClose, onCreated }: Props) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1
  const [nom, setNom] = useState('');
  const [email, setEmail] = useState('');
  const [tel, setTel] = useState('');
  const [telTouched, setTelTouched] = useState(false);
  const [domaines, setDomaines] = useState<DomaineActivite[]>([]);
  const [selectedDomaines, setSelectedDomaines] = useState<number[]>([]);

  // Step 2
  const [nbActivites, setNbActivites] = useState(1);
  const [nbLabos, setNbLabos] = useState(0);
  const [nbGerants, setNbGerants] = useState(0);
  const [formuleActivites, setFormuleActivites] = useState<Formule>('premium');
  const [nbAcheteurs, setNbAcheteurs] = useState(0);
  const [montantOnboarding, setMontantOnboarding] = useState('');
  const [preview, setPreview] = useState<PricingPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Step 3 — promo
  const [promos, setPromos] = useState<PromoForm[]>([]);
  const [promoForm, setPromoForm] = useState<PromoForm>({ type: 'percent_off', appliesTo: 'mensualite', moisDebut: '', months: '', discountVal: '', fixedVal: '' });
  const [promoError, setPromoError] = useState<string | null>(null);

  // Step 4
  const [pdfBase64, setPdfBase64] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState(false);
  const previewSeq = useRef(0);

  useEffect(() => {
    api.get('/api/domaines?hasIngredients=true').then(({ data }) => setDomaines(data)).catch(() => {});
  }, []);

  // Fetch pricing preview whenever config changes; auto-set onboarding price from response
  const fetchPreview = useCallback(async (na: number, nl: number, ng: number, nach: number, formule: Formule) => {
    setPreviewLoading(true);
    try {
      const { data } = await api.get('/api/abonnements/pricing-preview', { params: { nbActivites: na, nbLabos: nl, nbGerants: ng, nbAcheteurs: nach, formuleActivites: formule } });
      setPreview(data);
      if (data.onboardingPrice != null) setMontantOnboarding(String(data.onboardingPrice));
    } catch { setPreview(null); }
    finally { setPreviewLoading(false); }
  }, []);

  useEffect(() => {
    if (step === 1 || step === 3) fetchPreview(nbActivites, nbLabos, nbGerants, nbAcheteurs, formuleActivites);
  }, [step, nbActivites, nbLabos, nbGerants, nbAcheteurs, formuleActivites, fetchPreview]);

  // Step 4 : le contrat téléchargeable = EXACTEMENT le document contractuel
  // généré par le backend (même builder/charte que l'envoi en signature DocuSeal).
  useEffect(() => {
    if (step !== 3) return;
    const seq = ++previewSeq.current;
    setPdfBase64(null);
    setPdfError(false);
    api.post('/api/abonnements/contrat-preview', {
      nom, email, telephone: tel,
      nbActivites, nbLabos, nbGerants, formuleActivites, nbAcheteurs,
      montantOnboarding: parseFloat(montantOnboarding) || 0,
      promotions: promos.map(mapPromoForApi),
    })
      .then(({ data }) => {
        if (seq !== previewSeq.current) return;
        if (data?.pdfBase64) setPdfBase64(data.pdfBase64);
        else setPdfError(true);
      })
      .catch(() => { if (seq === previewSeq.current) setPdfError(true); });
    // mapPromoForApi est stable (fonction pure du composant) — promos suffit en dépendance
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, nom, email, tel, nbActivites, nbLabos, nbGerants, formuleActivites, nbAcheteurs, montantOnboarding, promos]);

  // ── Step validation ──

  const { emailExists, emailChecking, emailCheckFailed } = useEmailCheck(email);
  const telValid = TUNISIAN_PHONE.test(tel.replace(/\s/g, ''));
  const step1Valid =
    nom.trim().length > 0 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
    !emailExists &&
    !emailChecking &&
    !emailCheckFailed &&
    telValid &&
    selectedDomaines.length > 0;
  // 0 activité = compte dépôt : exige au moins 1 labo ET l'option Acheteurs
  // (un labo seul n'est pas une composition valide — labo+activités / labo+acheteurs / les trois).
  const step2Valid = (nbActivites >= 1 || (nbActivites === 0 && nbLabos >= 1 && nbAcheteurs > 0)) && montantOnboarding !== '';
  const nextDisabled = (step === 0 && !step1Valid) || (step === 1 && !step2Valid);

  const next = () => {
    setError(null);
    if (step === 0) {
      if (!nom.trim()) { setError('Le nom est obligatoire.'); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError('Email invalide.'); return; }
      if (emailChecking) { setError('Vérification de l\'email en cours…'); return; }
      if (emailCheckFailed) { setError('Impossible de vérifier l\'email — vérifiez votre connexion.'); return; }
      if (emailExists) { setError('Cet email est déjà utilisé.'); return; }
      if (!telValid) { setError('Téléphone invalide — format tunisien requis (ex: 20 123 456 ou +216 20 123 456).'); return; }
      if (selectedDomaines.length === 0) { setError('Veuillez sélectionner au moins un domaine d\'activité.'); return; }
    }
    if (step === 1 && !step2Valid) {
      setError(nbActivites === 0
        ? "Un compte sans activité (dépôt) nécessite au moins 1 labo ET l'option Acheteurs."
        : 'Configurez au moins 1 activité (chargement du tarif en cours…).');
      return;
    }
    setStep((s) => s + 1);
  };
  const prev = () => { setError(null); setStep((s) => s - 1); };

  // ── Promo management ──

  const addPromo = () => {
    const { type, appliesTo, moisDebut, discountVal, fixedVal } = promoForm;
    if (type !== 'free_months') {
      if (appliesTo !== 'onboarding' && !moisDebut) { setPromoError('Mois début requis'); return; }
      if (type === 'percent_off' && !discountVal)   { setPromoError('% requis'); return; }
      if (type === 'fixed_price' && !fixedVal)      { setPromoError('Montant requis'); return; }
    }
    setPromos((prev) => [...prev, { ...promoForm }]);
    setPromoForm({ type: 'percent_off', appliesTo: 'mensualite', moisDebut: '', months: '', discountVal: '', fixedVal: '' });
    setPromoError(null);
  };

  const removePromo = (i: number) => setPromos((p) => p.filter((_, j) => j !== i));

  // ── Submit ──

  const mapPromoForApi = (p: PromoForm) => {
    const today = new Date().toISOString().slice(0, 10);
    const dateDebut = p.appliesTo === 'onboarding'
      ? today
      : (p.moisDebut ? `${p.moisDebut}-01` : `${today.slice(0, 7)}-01`);
    const isOb = ['onboarding', 'les_deux'].includes(p.appliesTo);
    const isMens = ['mensualite', 'les_deux'].includes(p.appliesTo);
    const isSup = p.appliesTo.startsWith('supplement');
    return {
      type: p.type,
      appliesTo: p.appliesTo,
      dateDebut,
      monthsDuration: p.months ? parseInt(p.months) : null,
      discountOnboarding: p.type === 'percent_off' && isOb ? parseFloat(p.discountVal) : null,
      discountMensualite: p.type === 'percent_off' && isMens ? parseFloat(p.discountVal) : null,
      discountSupplement: p.type === 'percent_off' && isSup ? parseFloat(p.discountVal) : null,
      fixedOnboarding: p.type === 'fixed_price' && isOb ? parseFloat(p.fixedVal) : null,
      fixedMensualite: p.type === 'fixed_price' && isMens ? parseFloat(p.fixedVal) : null,
      fixedSupplement: p.type === 'fixed_price' && isSup ? parseFloat(p.fixedVal) : null,
    };
  };

  const handleSubmit = async () => {
    // Génération en cours : on attend. Échec de génération : on N'EMPÊCHE PAS la
    // création — le backend génère lui-même le document (repli) et le flux
    // DocuSeal produit de toute façon son propre contrat à la signature.
    if (!pdfBase64 && !pdfError) { setError('Génération du contrat en cours…'); return; }
    setSaving(true);
    setError(null);
    try {
      await api.post('/admin/clients', {
        nom, email, telephone: tel,
        domaineIds: selectedDomaines,
        nbActivites, nbLabos, nbGerants,
        formuleActivites, nbAcheteurs,
        montantOnboarding: parseFloat(montantOnboarding) || 0,
        contractPdfBase64: pdfBase64 || null,
        promotions: promos.map(mapPromoForApi),
      });
      onCreated();
      onClose();
    } catch (err: unknown) {
      setError((err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Erreur lors de la création');
    } finally {
      setSaving(false);
    }
  };

  // ── Render helpers ──

  const promoLabel = (p: PromoForm) => {
    const applyLbl: Record<string, string> = { onboarding: 'OnBoarding', mensualite: 'Mensualité' };
    const typeLbl = p.type === 'free_months' ? 'Gratuit' : p.type === 'percent_off' ? `−${p.discountVal}%` : `${p.fixedVal} DT`;
    const dur = p.months ? ` · ${p.months} mois` : ' · Permanent';
    const start = p.appliesTo !== 'onboarding' && p.moisDebut ? ` · À partir de ${p.moisDebut}` : '';
    return `${applyLbl[p.appliesTo] || p.appliesTo} — ${typeLbl}${dur}${start}`;
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 640, maxHeight: '92vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 32px 80px rgba(0,0,0,0.22)' }}>

        {/* Header */}
        <div style={{ padding: '24px 28px 0', borderBottom: '1px solid #f1f5f9', paddingBottom: 20, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>Nouveau Client</div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>Étape {step + 1} sur {STEPS.length} — {STEPS[step]}</div>
            </div>
            <button onClick={onClose} style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', background: '#f1f5f9', color: '#64748b', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
          </div>
          <StepIndicator current={step} />
        </div>

        {/* Body */}
        <div style={{ padding: '24px 28px', overflowY: 'auto', flex: 1 }}>

          {/* ── STEP 1: Informations ── */}
          {step === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={labelStyle}>Nom complet *</label>
                <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nom du client" style={inputStyle} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Email *</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="email@exemple.com"
                    style={{
                      ...inputStyle,
                      borderColor: (emailExists || emailCheckFailed) ? '#fca5a5' : inputStyle.borderColor,
                      background: (emailExists || emailCheckFailed) ? '#fff5f5' : inputStyle.background,
                    }}
                  />
                  {emailChecking && <div style={{ fontSize: 11, color: '#6366f1', marginTop: 3, fontWeight: 500 }}>⏳ Vérification en cours…</div>}
                  {!emailChecking && emailExists && (
                    <div style={{ fontSize: 11, color: '#dc2626', marginTop: 3, fontWeight: 600 }}>❌ Cet email est déjà associé à un compte existant.</div>
                  )}
                  {!emailChecking && emailCheckFailed && (
                    <div style={{ fontSize: 11, color: '#dc2626', marginTop: 3, fontWeight: 600 }}>❌ Impossible de vérifier cet email — réessayez.</div>
                  )}
                </div>
                <div>
                  <label style={labelStyle}>Téléphone * <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: '#94a3b8' }}>(format tunisien)</span></label>
                  <input
                    type="tel"
                    value={tel}
                    onChange={(e) => setTel(e.target.value)}
                    onBlur={() => setTelTouched(true)}
                    placeholder="20 123 456"
                    style={{
                      ...inputStyle,
                      borderColor: telTouched && tel && !telValid ? '#fca5a5' : inputStyle.borderColor,
                      background: telTouched && tel && !telValid ? '#fff5f5' : inputStyle.background,
                    }}
                  />
                  {telTouched && tel && !telValid && (
                    <div style={{ fontSize: 11, color: '#dc2626', marginTop: 4 }}>
                      Format invalide — ex: 20 123 456 ou +216 20 123 456
                    </div>
                  )}
                </div>
              </div>

              {/* Domaines — restructured */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <label style={{ ...labelStyle, marginBottom: 0 }}>
                    Domaine(s) d'activité *
                  </label>
                  {selectedDomaines.length > 0 && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#4338ca', background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 12, padding: '2px 10px' }}>
                      {selectedDomaines.length} sélectionné{selectedDomaines.length > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                <div style={{ border: '1.5px solid #e2e8f0', borderRadius: 10, padding: 12, background: '#fafbff' }}>
                  {domaines.length === 0 ? (
                    <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>Chargement des domaines…</p>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {domaines.map((d) => {
                        const sel = selectedDomaines.includes(d.id);
                        return (
                          <button key={d.id} type="button"
                            onClick={() => setSelectedDomaines((p) => sel ? p.filter((x) => x !== d.id) : [...p, d.id])}
                            style={{
                              padding: '7px 16px', borderRadius: 20,
                              border: `1.5px solid ${sel ? '#6366f1' : '#e2e8f0'}`,
                              background: sel ? '#eef2ff' : '#fff',
                              color: sel ? '#4338ca' : '#64748b',
                              fontSize: 13, fontWeight: sel ? 700 : 500,
                              cursor: 'pointer', transition: 'all 0.15s',
                              display: 'flex', alignItems: 'center', gap: 6,
                            }}>
                            {sel && <span style={{ fontSize: 10 }}>✓</span>}
                            {d.nom}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 5 }}>
                  Sélectionnez au moins un domaine — détermine les ingrédients accessibles au client
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 2: Configuration ── */}
          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Counter label="Activités" sub="Unités de production / points de vente — 0 = compte dépôt (labo + acheteurs)" value={nbActivites} onChange={(n) => setNbActivites(n)} min={0} />

              {/* Formule d'activités */}
              {nbActivites >= 1 && (
                <div>
                  <label style={labelStyle}>Formule d'activités</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {([
                      { value: 'basique' as Formule, title: 'Activité Basique', desc: 'Stock + Ventes d\'articles, sans Espace Produit' },
                      { value: 'premium' as Formule, title: 'Activité Premium', desc: 'Stock + Ventes + Espace Produit complet' },
                    ]).map((f) => {
                      const sel = formuleActivites === f.value;
                      return (
                        <button key={f.value} type="button" onClick={() => setFormuleActivites(f.value)}
                          style={{
                            textAlign: 'left', padding: '12px 14px', borderRadius: 12, cursor: 'pointer',
                            border: `1.5px solid ${sel ? '#6366f1' : '#e2e8f0'}`,
                            background: sel ? '#eef2ff' : '#fff',
                            transition: 'all 0.15s',
                          }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{
                              width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
                              border: `1.5px solid ${sel ? '#6366f1' : '#cbd5e1'}`,
                              background: sel ? '#6366f1' : '#fff',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              color: '#fff', fontSize: 9, fontWeight: 700,
                            }}>{sel ? '✓' : ''}</span>
                            <span style={{ fontSize: 13, fontWeight: 700, color: sel ? '#4338ca' : '#0f172a' }}>{f.title}</span>
                          </div>
                          <div style={{ fontSize: 11, color: sel ? '#6366f1' : '#64748b', marginTop: 4, lineHeight: 1.4 }}>{f.desc}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <Counter label="Labos" sub="Laboratoires de production centralisée" value={nbLabos} onChange={(n) => { setNbLabos(n); if (n === 0) setNbAcheteurs(0); }} />
              {nbActivites === 0 && nbLabos < 1 && (
                <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 8, padding: '8px 12px', fontSize: '0.78rem', color: '#92400e', fontWeight: 600 }}>
                  ⚠️ Un compte sans activité (dépôt) doit avoir au moins un labo.
                </div>
              )}
              {nbActivites === 0 && nbLabos >= 1 && nbAcheteurs === 0 && (
                <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 8, padding: '8px 12px', fontSize: '0.78rem', color: '#92400e', fontWeight: 600 }}>
                  ⚠️ Un labo sans activité nécessite l'option Acheteurs (compte dépôt = labo + acheteurs) — sélectionnez un palier ci-dessous.
                </div>
              )}

              {/* Option Acheteurs */}
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '14px 16px', opacity: nbLabos === 0 ? 0.6 : 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>Option Acheteurs</div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2, marginBottom: 8 }}>Carnet d'acheteurs B2B facturé par palier — nécessite au moins un labo</div>
                <select
                  value={nbAcheteurs}
                  onChange={(e) => setNbAcheteurs(parseInt(e.target.value, 10) || 0)}
                  disabled={nbLabos === 0}
                  style={{ ...selectStyle, cursor: nbLabos === 0 ? 'default' : 'pointer', background: nbLabos === 0 ? '#f8fafc' : '#fff' }}
                >
                  <option value={0}>Aucun</option>
                  <option value={10}>Palier 1 à 10 acheteurs</option>
                  <option value={20}>Palier 11 à 20 acheteurs</option>
                  <option value={50}>Palier 21 à 50 acheteurs</option>
                  <option value={100}>Palier 51 à 100 acheteurs</option>
                </select>
              </div>

              <Counter label="Gérants" sub="Comptes gérants supplémentaires" value={nbGerants} onChange={(n) => setNbGerants(n)} />
              {previewLoading ? (
                <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 12, padding: 12 }}>Calcul en cours…</div>
              ) : (
                <PricingCard preview={preview} promos={promos} />
              )}
            </div>
          )}

          {/* ── STEP 3: Promotions ── */}
          {step === 2 && (() => {
            // Current month as minimum (new client starts today)
            const nowYM = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

            // Months blocked by promos already added in this session (mensualite only)
            const promoBlockedMonths = new Set<string>();
            promos
              .filter((p) => ['mensualite', 'les_deux'].includes(p.appliesTo))
              .forEach((p) => {
                if (!p.moisDebut) return;
                const start = new Date(p.moisDebut + '-01T00:00:00');
                const end = p.months
                  ? (() => { const d = new Date(start); d.setMonth(d.getMonth() + parseInt(p.months)); d.setDate(d.getDate() - 1); return d; })()
                  : new Date(new Date().getFullYear() + 3, 11, 31);
                const cur = new Date(start.getFullYear(), start.getMonth(), 1);
                while (cur <= end) {
                  promoBlockedMonths.add(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`);
                  cur.setMonth(cur.getMonth() + 1);
                }
              });

            const isMonthDisabled = (ym: string) => {
              if (ym < nowYM) return true;
              if (promoBlockedMonths.has(ym)) return true;
              return false;
            };

            const hasObPromo = promos.some((p) => p.appliesTo === 'onboarding');
            const visibleApplies = [
              (!hasObPromo && parseFloat(montantOnboarding) > 0) ? { value: 'onboarding', label: 'OnBoarding' } : null,
              { value: 'mensualite', label: 'Mensualité' },
            ].filter(Boolean) as { value: string; label: string }[];

            return (
              <div>
                <div style={{ fontSize: 13, color: '#374151', marginBottom: 14, lineHeight: 1.5 }}>
                  Optionnel — ajoutez des promotions de lancement. Elles seront appliquées dès la création du compte.
                </div>

                {promos.length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    {promos.map((p, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '8px 12px', marginBottom: 6 }}>
                        <span style={{ flex: 1, fontSize: 12, color: '#166534' }}>✓ {promoLabel(p)}</span>
                        <button onClick={() => removePromo(i)} style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 5, padding: '2px 8px', fontSize: 11, cursor: 'pointer' }}>✕</button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Mini promo form */}
                <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, padding: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#78350f', marginBottom: 12 }}>Ajouter une promotion</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10, alignItems: 'start' }}>
                    <div>
                      <label style={labelStyle}>Appliqué à</label>
                      <select
                        value={visibleApplies.find((o) => o.value === promoForm.appliesTo) ? promoForm.appliesTo : visibleApplies[0]?.value || 'mensualite'}
                        onChange={(e) => setPromoForm((f) => ({ ...f, appliesTo: e.target.value, moisDebut: '' }))}
                        style={selectStyle}
                      >
                        {visibleApplies.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Type</label>
                      <select value={promoForm.type} onChange={(e) => setPromoForm((f) => ({ ...f, type: e.target.value as PromoForm['type'], discountVal: '', fixedVal: '' }))} style={selectStyle}>
                        <option value="percent_off">% Réduction</option>
                        <option value="free_months">Gratuit</option>
                        <option value="fixed_price">Prix fixe</option>
                      </select>
                    </div>
                    {promoForm.appliesTo !== 'onboarding' && (
                      <div>
                        <label style={labelStyle}>Mois début</label>
                        <MonthPicker
                          value={promoForm.moisDebut}
                          onChange={(ym) => setPromoForm((f) => ({ ...f, moisDebut: ym }))}
                          isDisabled={isMonthDisabled}
                        />
                      </div>
                    )}
                    {promoForm.type !== 'free_months' && (
                      <div>
                        <label style={labelStyle}>{promoForm.type === 'percent_off' ? 'Réduction (%)' : 'Montant fixe (DT)'}</label>
                        <input type="number" min="0" value={promoForm.type === 'percent_off' ? promoForm.discountVal : promoForm.fixedVal}
                          onChange={(e) => setPromoForm((f) => promoForm.type === 'percent_off' ? { ...f, discountVal: e.target.value } : { ...f, fixedVal: e.target.value })}
                          style={inputStyle} />
                      </div>
                    )}
                    {promoForm.appliesTo !== 'onboarding' && (
                      <div>
                        <label style={labelStyle}>Durée (mois, vide = permanent)</label>
                        <input type="number" min="1" value={promoForm.months} onChange={(e) => setPromoForm((f) => ({ ...f, months: e.target.value }))} placeholder="permanent" style={inputStyle} />
                      </div>
                    )}
                  </div>
                  {promoError && <div style={{ color: '#dc2626', fontSize: 12, marginBottom: 8 }}>{promoError}</div>}
                  <button onClick={addPromo} style={{ padding: '7px 18px', borderRadius: 8, border: 'none', background: '#d97706', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                    + Ajouter
                  </button>
                </div>
              </div>
            );
          })()}

          {/* ── STEP 4: Contrat ── */}
          {step === 3 && (
            <div>
              {/* Summary */}
              <div style={{ background: 'linear-gradient(135deg,#f0f9ff 0%,#e0f2fe 100%)', border: '1px solid #bae6fd', borderRadius: 14, padding: '14px 18px', marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#0c4a6e', marginBottom: 10 }}>📋 Récapitulatif</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  <div style={{ display: 'flex', gap: 8, fontSize: 12 }}>
                    <span style={{ color: '#64748b', fontWeight: 600 }}>👤 Client</span>
                    <span style={{ color: '#0f172a', fontWeight: 700 }}>{nom}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, fontSize: 12 }}>
                    <span style={{ color: '#64748b', fontWeight: 600 }}>📧</span>
                    <span style={{ color: '#0f172a' }}>{email}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, fontSize: 12 }}>
                    <span style={{ color: '#64748b', fontWeight: 600 }}>📱</span>
                    <span style={{ color: '#0f172a' }}>{tel}</span>
                  </div>
                </div>
              </div>

              <PricingCard preview={preview} promos={promos} />

              {/* Contrat : téléchargement uniquement (pas d'aperçu embarqué) */}
              <div style={{ marginTop: 14, background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 42, height: 42, borderRadius: 10, background: '#eef2ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>📄</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>Contrat d'abonnement</div>
                  <div style={{ fontSize: 11, color: pdfError ? '#dc2626' : '#64748b', marginTop: 2 }}>
                    {pdfBase64
                      ? 'Prêt — téléchargez-le pour le consulter avant l\'envoi. C\'est le document exact qui partira en signature.'
                      : pdfError
                        ? 'Impossible de générer le contrat — revenez en arrière puis réessayez.'
                        : 'Génération du contrat…'}
                  </div>
                </div>
                <button
                  disabled={!pdfBase64}
                  onClick={() => {
                    if (!pdfBase64) return;
                    const link = document.createElement('a');
                    link.href = `data:application/pdf;base64,${pdfBase64}`;
                    link.download = `contrat-${nom.replace(/\s+/g, '-').toLowerCase()}.pdf`;
                    link.click();
                  }}
                  style={{
                    fontSize: 12, fontWeight: 700, borderRadius: 8, padding: '9px 16px', cursor: pdfBase64 ? 'pointer' : 'default',
                    color: pdfBase64 ? '#fff' : '#9ca3af',
                    background: pdfBase64 ? 'linear-gradient(135deg,#4338ca,#6366f1)' : '#e5e7eb',
                    border: 'none', whiteSpace: 'nowrap',
                    boxShadow: pdfBase64 ? '0 4px 12px rgba(99,102,241,0.3)' : 'none',
                  }}
                >
                  ⬇ Télécharger le contrat
                </button>
              </div>

              <div style={{ marginTop: 12, background: '#fefce8', border: '1px solid #fde68a', borderRadius: 10, padding: '10px 14px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#713f12', marginBottom: 4 }}>📬 Ce qui sera envoyé au client :</div>
                <div style={{ fontSize: 11, color: '#92400e', lineHeight: 1.7 }}>
                  ✉️ Email de bienvenue · 📎 Contrat PDF · 🔗 Lien d'activation (48h)
                </div>
              </div>
            </div>
          )}

          {error && (
            <div style={{ marginTop: 14, background: '#fee2e2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#dc2626' }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 28px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <button
            onClick={step === 0 ? onClose : prev}
            style={{ padding: '9px 22px', borderRadius: 9, border: '1px solid #e2e8f0', background: '#fff', color: '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            {step === 0 ? 'Annuler' : '← Retour'}
          </button>

          {step < 3 ? (
            <button onClick={next} disabled={nextDisabled}
              style={{ padding: '9px 28px', borderRadius: 9, border: 'none', background: nextDisabled ? '#e5e7eb' : 'linear-gradient(135deg,#4338ca,#6366f1)', color: nextDisabled ? '#9ca3af' : '#fff', fontSize: 13, fontWeight: 700, cursor: nextDisabled ? 'default' : 'pointer', boxShadow: nextDisabled ? 'none' : '0 4px 14px rgba(99,102,241,0.35)' }}>
              {step === 0 && emailChecking ? 'Vérification…' : 'Suivant →'}
            </button>
          ) : (() => {
            // Désactivé pendant la génération seulement — un échec de génération
            // n'empêche pas la création (repli backend).
            const waiting = !pdfBase64 && !pdfError;
            const disabled = saving || waiting;
            return (
              <button
                onClick={handleSubmit}
                disabled={disabled}
                style={{ padding: '9px 28px', borderRadius: 9, border: 'none', background: disabled ? '#e5e7eb' : 'linear-gradient(135deg,#059669,#10b981)', color: disabled ? '#9ca3af' : '#fff', fontSize: 13, fontWeight: 700, cursor: disabled ? 'default' : 'pointer', boxShadow: disabled ? 'none' : '0 4px 14px rgba(16,185,129,0.35)' }}>
                {saving ? 'Création en cours…' : '✓ Créer le compte & Envoyer'}
              </button>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5,
  textTransform: 'uppercase', letterSpacing: '0.04em',
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0',
  fontSize: 13, color: '#0f172a', outline: 'none', boxSizing: 'border-box',
  background: '#fff', transition: 'border-color 0.15s',
};

const selectStyle: React.CSSProperties = {
  ...inputStyle, cursor: 'pointer',
};
