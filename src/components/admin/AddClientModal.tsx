import { useState, useEffect, useCallback } from 'react';
import api from '../../api/client';
import jsPDF from 'jspdf';
import type { DomaineActivite, Promotion } from '../../types';

// ── Types ─────────────────────────────────────────────────────────────────────

interface PricingLine { nb: number; unitPrice: number; total: number; }
interface PricingPreview {
  activite: PricingLine;
  labo: PricingLine;
  gerant: PricingLine;
  totalMensuel: number;
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

const fmt = (n: number) => `${n.toLocaleString('fr-FR')} DT`;
const today = () => new Date().toISOString().slice(0, 10);
const todayFr = () => new Date().toLocaleDateString('fr-FR');

// ── Contract PDF generator ─────────────────────────────────────────────────────

function generateContractPdf(params: {
  clientNom: string;
  clientEmail: string;
  clientTel: string;
  nbActivites: number;
  nbLabos: number;
  nbGerants: number;
  montantOnboarding: number;
  totalMensuel: number;
  promos: PromoForm[];
  appName: string;
}): string {
  const { clientNom, clientEmail, clientTel, nbActivites, nbLabos, nbGerants,
          montantOnboarding, totalMensuel, appName } = params;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210; const PL = 20; const PR = 20;
  const TW = W - PL - PR;
  let y = 0;

  const line = (text: string, x: number, yy: number, size = 10, style: 'normal' | 'bold' = 'normal', color = '#111827') => {
    doc.setFontSize(size);
    doc.setFont('helvetica', style);
    doc.setTextColor(color);
    doc.text(text, x, yy);
  };

  const hRule = (yy: number, col = '#e2e8f0') => {
    doc.setDrawColor(col);
    doc.setLineWidth(0.3);
    doc.line(PL, yy, W - PR, yy);
  };

  const fillRect = (x: number, yy: number, w: number, h: number, col: string) => {
    doc.setFillColor(col);
    doc.rect(x, yy, w, h, 'F');
  };

  // Header
  fillRect(0, 0, W, 38, '#1e1b4b');
  line(appName, PL, 18, 20, 'bold', '#ffffff');
  line('CONTRAT D\'ABONNEMENT', PL, 28, 11, 'normal', '#c7d2fe');
  line(`Ref: CTR-${Date.now().toString().slice(-8)}`, W - PR, 28, 8, 'normal', '#a5b4fc');
  y = 50;

  // Parties
  fillRect(PL, y, TW, 7, '#f8fafc');
  line('PARTIES', PL + 3, y + 5, 9, 'bold', '#374151');
  y += 12;
  line('Prestataire', PL, y, 9, 'bold', '#6366f1');
  line(appName + ' — Plateforme de gestion des fiches techniques', PL + 35, y, 9, 'normal', '#1f2937');
  y += 7;
  line('Client', PL, y, 9, 'bold', '#6366f1');
  line(clientNom, PL + 35, y, 9, 'normal', '#1f2937');
  y += 5;
  line('', PL, y, 9);
  if (clientEmail) { line(`Email : ${clientEmail}`, PL + 35, y, 8, 'normal', '#6b7280'); y += 5; }
  if (clientTel)   { line(`Tél   : ${clientTel}`,   PL + 35, y, 8, 'normal', '#6b7280'); y += 5; }
  y += 5;
  hRule(y); y += 8;

  // Configuration
  fillRect(PL, y, TW, 7, '#f8fafc');
  line('CONFIGURATION SOUSCRITE', PL + 3, y + 5, 9, 'bold', '#374151');
  y += 12;

  const rows: [string, string, string][] = [
    ['Activité(s)', `${nbActivites} activité${nbActivites > 1 ? 's' : ''}`,
      nbActivites === 1 ? '200 DT/mois' : nbActivites === 2 ? '350 DT/mois' : `${nbActivites} × 120 = ${nbActivites * 120} DT/mois`],
    ...(nbLabos > 0 ? [['Labo(s)', `${nbLabos} labo${nbLabos > 1 ? 's' : ''}`, `${nbLabos} × 160 = ${nbLabos * 160} DT/mois`] as [string,string,string]] : []),
    ...(nbGerants > 0 ? [['Gérant(s)', `${nbGerants} gérant${nbGerants > 1 ? 's' : ''}`, `${nbGerants} × 80 = ${nbGerants * 80} DT/mois`] as [string,string,string]] : []),
  ];

  for (const [label, detail, prix] of rows) {
    line('•', PL + 2, y, 10, 'normal', '#6366f1');
    line(label, PL + 7, y, 9, 'bold', '#1f2937');
    line(detail, PL + 45, y, 9, 'normal', '#374151');
    line(prix, W - PR - 5, y, 9, 'normal', '#374151');
    doc.setFont('helvetica', 'normal');
    y += 6;
  }
  y += 3;

  // Totals box
  fillRect(PL, y, TW, 24, '#eff6ff');
  hRule(y, '#bfdbfe');
  line('Frais d\'onboarding (une fois) :', PL + 4, y + 8, 9, 'normal', '#374151');
  line(fmt(montantOnboarding), W - PR - 4, y + 8, 10, 'bold', '#1d4ed8');
  line('Mensualité (abonnement récurrent) :', PL + 4, y + 17, 9, 'normal', '#374151');
  line(fmt(totalMensuel), W - PR - 4, y + 17, 10, 'bold', '#1d4ed8');
  hRule(y + 24, '#bfdbfe');
  y += 32;

  // Terms
  fillRect(PL, y, TW, 7, '#f8fafc');
  line('CONDITIONS', PL + 3, y + 5, 9, 'bold', '#374151');
  y += 12;

  const terms = [
    `1. Le présent contrat prend effet à compter de la date d'activation du compte.`,
    `2. L'abonnement est facturé mensuellement. Le paiement est dû en début de mois.`,
    `3. Toute demande de supplément (activité, labo, gérant) fait l'objet d'un avenant.`,
    `4. Le prestataire se réserve le droit de suspendre l'accès en cas de non-paiement.`,
    `5. La résiliation doit être notifiée 30 jours à l'avance par email.`,
  ];
  for (const t of terms) {
    const lines = doc.splitTextToSize(t, TW - 4);
    for (const l of lines) {
      line(l, PL + 2, y, 8, 'normal', '#374151');
      y += 5;
    }
  }
  y += 5;

  // Signatures
  hRule(y); y += 10;
  fillRect(PL, y, TW, 7, '#f8fafc');
  line('SIGNATURES', PL + 3, y + 5, 9, 'bold', '#374151');
  y += 14;

  // Two columns
  const col1 = PL; const col2 = PL + TW / 2 + 5;
  line('Prestataire', col1, y, 9, 'bold', '#374151');
  line('Client', col2, y, 9, 'bold', '#374151');
  y += 6;
  line(appName, col1, y, 8, 'normal', '#6b7280');
  line(clientNom, col2, y, 8, 'normal', '#6b7280');
  y += 5;
  line(`Date : ${todayFr()}`, col1, y, 8, 'normal', '#6b7280');
  line(`Date : ${todayFr()}`, col2, y, 8, 'normal', '#6b7280');
  y += 14;
  hRule(y - 4, '#9ca3af');
  hRule(y - 4 + (col2 - col1), '#9ca3af');
  line('Signature & cachet', col1, y + 2, 7, 'normal', '#9ca3af');
  line(`Signature — ${clientNom}`, col2, y + 2, 7, 'normal', '#9ca3af');
  y += 12;

  // Acceptance note
  fillRect(PL, y, TW, 11, '#fefce8');
  line('⚡ Validation numérique : l\'activation du compte par le client vaut acceptation du présent contrat.', PL + 3, y + 7, 7.5, 'normal', '#713f12');

  // Footer
  fillRect(0, 290, W, 10, '#f1f5f9');
  doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor('#9ca3af');
  doc.text(`${appName} — Contrat généré le ${todayFr()} — Confidentiel`, W / 2, 296, { align: 'center' });

  return doc.output('datauristring').split(',')[1]; // base64 only
}

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

function PricingCard({ preview, montantOnboarding }: { preview: PricingPreview | null; montantOnboarding: string }) {
  if (!preview) return null;
  const ob = parseFloat(montantOnboarding) || 0;
  return (
    <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 12, padding: '16px 18px', marginTop: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#1d4ed8', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Récapitulatif tarifaire</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {preview.activite.nb > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
            <span style={{ color: '#374151' }}>
              {preview.activite.nb === 1 ? '1 Activité (forfait)' : preview.activite.nb === 2 ? '2 Activités (forfait)' : `${preview.activite.nb} Activités (${preview.activite.nb} × 120 DT)`}
            </span>
            <span style={{ fontWeight: 700, color: '#1d4ed8' }}>{fmt(preview.activite.total)}</span>
          </div>
        )}
        {preview.labo.nb > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
            <span style={{ color: '#374151' }}>{preview.labo.nb} Labo{preview.labo.nb > 1 ? 's' : ''} ({preview.labo.nb} × 160 DT)</span>
            <span style={{ fontWeight: 700, color: '#1d4ed8' }}>{fmt(preview.labo.total)}</span>
          </div>
        )}
        {preview.gerant.nb > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
            <span style={{ color: '#374151' }}>{preview.gerant.nb} Gérant{preview.gerant.nb > 1 ? 's' : ''} ({preview.gerant.nb} × 80 DT)</span>
            <span style={{ fontWeight: 700, color: '#1d4ed8' }}>{fmt(preview.gerant.total)}</span>
          </div>
        )}
        <div style={{ borderTop: '1px solid #bfdbfe', paddingTop: 8, marginTop: 4, display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#1e40af' }}>Mensualité</span>
          <span style={{ fontSize: 14, fontWeight: 800, color: '#1e40af' }}>{fmt(preview.totalMensuel)}</span>
        </div>
        {ob > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', background: '#fff', borderRadius: 6, padding: '6px 10px', marginTop: 2 }}>
            <span style={{ fontSize: 12, color: '#374151' }}>Onboarding (one-time)</span>
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

  useEffect(() => {
    api.get('/api/domaines?hasIngredients=true').then(({ data }) => setDomaines(data)).catch(() => {});
  }, []);

  // Fetch pricing preview whenever config changes
  const fetchPreview = useCallback(async (na: number, nl: number, ng: number) => {
    setPreviewLoading(true);
    try {
      const { data } = await api.get('/api/abonnements/pricing-preview', { params: { nbActivites: na, nbLabos: nl, nbGerants: ng } });
      setPreview(data);
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
        promos,
        appName: 'Fiche Technique',
      });
      setPdfBase64(base64);
    }
  }, [step, nom, email, tel, nbActivites, nbLabos, nbGerants, montantOnboarding, preview, promos]);

  // ── Step validation ──

  const step1Valid = nom.trim().length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && tel.trim().length > 0;
  const step2Valid = nbActivites >= 1 && montantOnboarding !== '' && parseFloat(montantOnboarding) >= 0;

  const next = () => {
    setError(null);
    if (step === 0 && !step1Valid) { setError('Nom, email et téléphone sont obligatoires.'); return; }
    if (step === 1 && !step2Valid) { setError('Configurez au moins 1 activité et renseignez le montant d\'onboarding.'); return; }
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
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Erreur lors de la création');
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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
                  <label style={labelStyle}>Téléphone *</label>
                  <input type="tel" value={tel} onChange={(e) => setTel(e.target.value)} placeholder="+216 XX XXX XXX" style={inputStyle} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Domaine(s) d'activité</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
                  {domaines.map((d) => {
                    const sel = selectedDomaines.includes(d.id);
                    return (
                      <button key={d.id} type="button"
                        onClick={() => setSelectedDomaines((p) => sel ? p.filter((x) => x !== d.id) : [...p, d.id])}
                        style={{ padding: '6px 14px', borderRadius: 20, border: `1.5px solid ${sel ? '#6366f1' : '#e2e8f0'}`, background: sel ? '#eff6ff' : '#fff', color: sel ? '#4338ca' : '#64748b', fontSize: 12, fontWeight: sel ? 700 : 500, cursor: 'pointer', transition: 'all 0.15s' }}>
                        {d.nom}
                      </button>
                    );
                  })}
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
              <div style={{ marginTop: 4 }}>
                <label style={labelStyle}>Frais d'Onboarding (DT) *</label>
                <input type="number" min="0" value={montantOnboarding} onChange={(e) => setMontantOnboarding(e.target.value)}
                  placeholder="ex: 800" style={{ ...inputStyle, fontSize: 18, fontWeight: 700, textAlign: 'right' }} />
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>Formation initiale + mise en place — paiement unique</div>
              </div>
              {previewLoading ? (
                <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 12, padding: 12 }}>Calcul…</div>
              ) : (
                <PricingCard preview={preview} montantOnboarding={montantOnboarding} />
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
                  <div>
                    <label style={labelStyle}>Durée (mois, vide = permanent)</label>
                    <input type="number" min="1" value={promoForm.months} onChange={(e) => setPromoForm((f) => ({ ...f, months: e.target.value }))} placeholder="permanent" style={inputStyle} />
                  </div>
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
              <div style={{ background: 'linear-gradient(135deg,#f0f9ff 0%,#e0f2fe 100%)', border: '1px solid #bae6fd', borderRadius: 14, padding: '18px 20px', marginBottom: 18 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#0c4a6e', marginBottom: 14 }}>📄 Récapitulatif de la commande</div>
                <div style={{ display: 'grid', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ color: '#374151', fontWeight: 600 }}>👤 Client</span>
                    <span style={{ color: '#0f172a', fontWeight: 700 }}>{nom}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ color: '#374151', fontWeight: 600 }}>📧 Email</span>
                    <span style={{ color: '#0f172a' }}>{email}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ color: '#374151', fontWeight: 600 }}>📱 Téléphone</span>
                    <span style={{ color: '#0f172a' }}>{tel}</span>
                  </div>
                </div>
              </div>

              <PricingCard preview={preview} montantOnboarding={montantOnboarding} />

              {promos.length > 0 && (
                <div style={{ marginTop: 14, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '12px 16px' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#166534', marginBottom: 8 }}>🏷️ Promotions appliquées</div>
                  {promos.map((p, i) => (
                    <div key={i} style={{ fontSize: 12, color: '#15803d', marginBottom: 4 }}>• {promoLabel(p)}</div>
                  ))}
                </div>
              )}

              <div style={{ marginTop: 18, background: '#fefce8', border: '1px solid #fde68a', borderRadius: 10, padding: '12px 16px' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#713f12', marginBottom: 6 }}>📬 Ce qui sera envoyé au client :</div>
                <div style={{ fontSize: 12, color: '#713f12', lineHeight: 1.6 }}>
                  ✉️ Email professionnel de bienvenue<br />
                  📎 Contrat PDF en pièce jointe<br />
                  🔗 Lien d'activation du compte (48h)<br />
                  <span style={{ color: '#92400e', fontStyle: 'italic', marginTop: 4, display: 'block' }}>L'activation du compte vaut acceptation numérique du contrat.</span>
                </div>
              </div>

              <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: pdfBase64 ? '#16a34a' : '#f59e0b', flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: pdfBase64 ? '#166534' : '#92400e' }}>
                  {pdfBase64 ? 'Contrat PDF généré — prêt à envoyer' : 'Génération du contrat PDF en cours…'}
                </span>
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
