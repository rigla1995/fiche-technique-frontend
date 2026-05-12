import { useState, useEffect, useCallback } from 'react';
import api from '../../api/client';
import type { DomaineActivite, Promotion } from '../../types';
import { generateContractPdf } from '../../utils/contractPdf';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ActLine { label: string; unitPrice?: number; total: number; }
interface PricingPreview {
  activite: { nb: number; total: number; lines?: ActLine[] };
  labo:     { nb: number; unitPrice: number; total: number };
  gerant:   { nb: number; unitPrice: number; total: number };
  totalMensuel: number;
  onboardingPrice?: number;
}

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

// ── Pricing card ──────────────────────────────────────────────────────────────

function PricingCard({ preview }: { preview: PricingPreview | null }) {
  if (!preview) return null;
  const ob = preview.onboardingPrice ?? 0;
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
        {/* Subtotal activités when multiple lines */}
        {preview.activite.lines && preview.activite.lines.length > 1 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, paddingLeft: 0, color: '#6366f1', fontWeight: 700, marginTop: 2 }}>
            <span>Total activités ({preview.activite.nb})</span>
            <span>{fmt(preview.activite.total)}</span>
          </div>
        )}
        {preview.labo.nb > 0 && row(
          `${preview.labo.nb} Labo${preview.labo.nb > 1 ? 's' : ''}`,
          preview.labo.total,
          `(${preview.labo.nb} × ${fmt(preview.labo.unitPrice)})`
        )}
        {preview.gerant.nb > 0 && row(
          `${preview.gerant.nb} Gérant${preview.gerant.nb > 1 ? 's' : ''}`,
          preview.gerant.total,
          `(${preview.gerant.nb} × ${fmt(preview.gerant.unitPrice)})`
        )}
        <div style={{ borderTop: '1px solid #bfdbfe', paddingTop: 8, marginTop: 4, display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#1e40af' }}>Mensualité</span>
          <span style={{ fontSize: 14, fontWeight: 800, color: '#1e40af' }}>{fmt(preview.totalMensuel)}</span>
        </div>
        {ob > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', background: '#fff', borderRadius: 6, padding: '6px 10px', marginTop: 2, border: '1px solid #dbeafe' }}>
            <span style={{ fontSize: 12, color: '#374151' }}>Onboarding <span style={{ color: '#94a3b8' }}>(paiement unique)</span></span>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#0369a1' }}>{fmt(ob)}</span>
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
  const [montantOnboarding, setMontantOnboarding] = useState('');
  const [preview, setPreview] = useState<PricingPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Step 3 — promo
  const [promos, setPromos] = useState<PromoForm[]>([]);
  const [promoForm, setPromoForm] = useState<PromoForm>({ type: 'percent_off', appliesTo: 'mensualite', moisDebut: '', months: '', discountVal: '', fixedVal: '' });
  const [promoError, setPromoError] = useState<string | null>(null);

  // Step 4
  const [pdfBase64, setPdfBase64] = useState<string | null>(null);
  const [pdfObjectUrl, setPdfObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    api.get('/api/domaines?hasIngredients=true').then(({ data }) => setDomaines(data)).catch(() => {});
  }, []);

  // Build blob URL for PDF preview
  useEffect(() => {
    if (!pdfBase64) { setPdfObjectUrl(null); return; }
    const byteChars = atob(pdfBase64);
    const byteArr = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i);
    const blob = new Blob([byteArr], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    setPdfObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pdfBase64]);

  // Fetch pricing preview whenever config changes; auto-set onboarding price from response
  const fetchPreview = useCallback(async (na: number, nl: number, ng: number) => {
    setPreviewLoading(true);
    try {
      const { data } = await api.get('/api/abonnements/pricing-preview', { params: { nbActivites: na, nbLabos: nl, nbGerants: ng } });
      setPreview(data);
      if (data.onboardingPrice != null) setMontantOnboarding(String(data.onboardingPrice));
    } catch { setPreview(null); }
    finally { setPreviewLoading(false); }
  }, []);

  useEffect(() => {
    if (step === 1 || step === 3) fetchPreview(nbActivites, nbLabos, nbGerants);
  }, [step, nbActivites, nbLabos, nbGerants, fetchPreview]);

  // Step 4: generate PDF whenever we arrive
  useEffect(() => {
    if (step === 3) {
      const base64 = generateContractPdf({
        clientNom: nom, clientEmail: email, clientTel: tel,
        nbActivites, nbLabos, nbGerants,
        montantOnboarding: parseFloat(montantOnboarding) || 0,
        totalMensuel: preview?.totalMensuel || 0,
        appName: 'Fiche Technique',
      });
      setPdfBase64(base64);
    }
  }, [step, nom, email, tel, nbActivites, nbLabos, nbGerants, montantOnboarding, preview]);

  // ── Step validation ──

  const telValid = TUNISIAN_PHONE.test(tel.replace(/\s/g, ''));
  const step1Valid =
    nom.trim().length > 0 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
    telValid &&
    selectedDomaines.length > 0;
  const step2Valid = nbActivites >= 1 && montantOnboarding !== '';

  const next = () => {
    setError(null);
    if (step === 0) {
      if (!nom.trim()) { setError('Le nom est obligatoire.'); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError('Email invalide.'); return; }
      if (!telValid) { setError('Téléphone invalide — format tunisien requis (ex: 20 123 456 ou +216 20 123 456).'); return; }
      if (selectedDomaines.length === 0) { setError('Veuillez sélectionner au moins un domaine d\'activité.'); return; }
    }
    if (step === 1 && !step2Valid) { setError('Configurez au moins 1 activité (chargement du tarif en cours…).'); return; }
    setStep((s) => s + 1);
  };
  const prev = () => { setError(null); setStep((s) => s - 1); };

  // ── Promo management ──

  const addPromo = () => {
    const { type, appliesTo, moisDebut, months, discountVal, fixedVal } = promoForm;
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

  const handleSubmit = async () => {
    if (!pdfBase64) { setError('Génération du contrat en cours…'); return; }
    setSaving(true);
    setError(null);
    try {
      await api.post('/admin/clients', {
        nom, email, telephone: tel,
        domaineIds: selectedDomaines,
        nbActivites, nbLabos, nbGerants,
        montantOnboarding: parseFloat(montantOnboarding) || 0,
        contractPdfBase64: pdfBase64,
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
    const applyLbl: Record<string, string> = { onboarding: 'OnBoarding', mensualite: 'Mensualité', supplement_gerant: 'Sup. Gérant', supplement_labo: 'Sup. Labo' };
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
                <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nom du client ou de l'entreprise" style={inputStyle} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Email *</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@exemple.com" style={inputStyle} />
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
              <Counter label="Activités" sub="Unités de production / points de vente" value={nbActivites} onChange={(n) => setNbActivites(n)} min={1} />
              <Counter label="Labos" sub="Laboratoires de production centralisée" value={nbLabos} onChange={(n) => setNbLabos(n)} />
              <Counter label="Gérants" sub="Comptes gérants supplémentaires" value={nbGerants} onChange={(n) => setNbGerants(n)} />
              {previewLoading ? (
                <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 12, padding: 12 }}>Calcul en cours…</div>
              ) : (
                <PricingCard preview={preview} />
              )}
            </div>
          )}

          {/* ── STEP 3: Promotions ── */}
          {step === 2 && (
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
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                  <div>
                    <label style={labelStyle}>Appliqué à</label>
                    <select value={promoForm.appliesTo} onChange={(e) => setPromoForm((f) => ({ ...f, appliesTo: e.target.value, moisDebut: '' }))} style={selectStyle}>
                      {parseFloat(montantOnboarding) > 0 && <option value="onboarding">OnBoarding</option>}
                      <option value="mensualite">Mensualité</option>
                      <option value="supplement_gerant">Sup. Gérant</option>
                      <option value="supplement_labo">Sup. Labo</option>
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
                      <input type="month" value={promoForm.moisDebut} onChange={(e) => setPromoForm((f) => ({ ...f, moisDebut: e.target.value }))} style={inputStyle} />
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
          )}

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

              <PricingCard preview={preview} />

              {promos.length > 0 && (
                <div style={{ marginTop: 10, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '10px 14px' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#166534', marginBottom: 6 }}>🏷️ Promotions</div>
                  {promos.map((p, i) => (
                    <div key={i} style={{ fontSize: 12, color: '#15803d', marginBottom: 3 }}>• {promoLabel(p)}</div>
                  ))}
                </div>
              )}

              {/* PDF Preview */}
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8 }}>
                  📄 Aperçu du contrat
                  {pdfBase64 && (
                    <button
                      onClick={() => {
                        const link = document.createElement('a');
                        link.href = `data:application/pdf;base64,${pdfBase64}`;
                        link.download = `contrat-${nom.replace(/\s+/g, '-').toLowerCase()}.pdf`;
                        link.click();
                      }}
                      style={{ marginLeft: 10, fontSize: 11, fontWeight: 600, color: '#4338ca', background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 6, padding: '2px 10px', cursor: 'pointer' }}
                    >
                      ⬇ Télécharger
                    </button>
                  )}
                </div>
                {pdfObjectUrl ? (
                  <iframe
                    src={pdfObjectUrl}
                    title="Aperçu du contrat"
                    style={{ width: '100%', height: 420, border: '1.5px solid #e2e8f0', borderRadius: 10, display: 'block' }}
                  />
                ) : (
                  <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', border: '1.5px dashed #e2e8f0', borderRadius: 10 }}>
                    <span style={{ fontSize: 12, color: '#94a3b8' }}>Génération du contrat…</span>
                  </div>
                )}
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
            <button onClick={next} style={{ padding: '9px 28px', borderRadius: 9, border: 'none', background: 'linear-gradient(135deg,#4338ca,#6366f1)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 14px rgba(99,102,241,0.35)' }}>
              Suivant →
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={saving || !pdfBase64}
              style={{ padding: '9px 28px', borderRadius: 9, border: 'none', background: saving || !pdfBase64 ? '#e5e7eb' : 'linear-gradient(135deg,#059669,#10b981)', color: saving || !pdfBase64 ? '#9ca3af' : '#fff', fontSize: 13, fontWeight: 700, cursor: saving || !pdfBase64 ? 'default' : 'pointer', boxShadow: saving || !pdfBase64 ? 'none' : '0 4px 14px rgba(16,185,129,0.35)' }}>
              {saving ? 'Création en cours…' : '✓ Créer le compte & Envoyer'}
            </button>
          )}
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
