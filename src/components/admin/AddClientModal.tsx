import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import api from '../../api/client';
import type { Promotion } from '../../types';
import { MonthPicker } from './MonthPicker';
import { useEmailCheck } from '../../hooks/useEmailCheck';
import Counter from './Counter';
import ClientIdentiteForm from './ClientIdentiteForm';
import { IDENTITE_VIDE, corpsIdentite, identiteDe, type IdentiteLegale } from '../../utils/identiteLegale';
import { controlerMatriculeFiscal } from './matriculeFiscal';
import {
  AIDE_DEFAUT, PALIERS_ACHETEURS, PALIER_LABELS,
  composantsActifs, composantsPayload, deriveCompteurs, libelleComposant,
  quantitesInitiales, resoudreRegles, validerCompositionClient,
  type DomaineOption,
} from './composition';

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
  /** Lot 1a : grille du domaine appliquée + composants résolus par le serveur. */
  domaine?: { id: number; slug?: string; nom: string } | null;
  composants?: { code: string; libelle: string; libellePluriel?: string | null; icone?: string | null; typeTechnique: string; nb: number }[];
  regles?: Record<string, unknown>;
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
// Message d'une erreur API (4xx) — affiché en bandeau inline dans le wizard (lot 3 : overlay ramené à 400, sous
// ConfirmDialog 700 ; les messages du wizard restent des bandeaux, ils ne quittent pas l'étape en cours).
const apiMessage = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;

// ── Step indicator ────────────────────────────────────────────────────────────

// Lot 3, étape 3 : plus de contrat (LabFlow est sans engagement) — la 4e étape est un récapitulatif.
const STEPS = ['Informations', 'Configuration', 'Promotions', 'Récapitulatif'];

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

function PricingCard({ preview, promos, grille, onboarding }: { preview: PricingPreview | null; promos?: PromoForm[]; grille?: string | null; onboarding?: number }) {
  if (!preview) return null;
  // Onboarding : montant saisi par l'admin (étape 2) s'il diffère du tarif de la grille
  const ob = onboarding ?? preview.onboardingPrice ?? 0;

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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Récapitulatif tarifaire</div>
        {grille && (
          <span title="Grille tarifaire appliquée (générale + surcharges du domaine)"
            style={{ fontSize: 10, fontWeight: 700, color: '#1e40af', background: '#dbeafe', border: '1px solid #bfdbfe', borderRadius: 10, padding: '2px 9px' }}>
            📊 Grille : {grille}
          </span>
        )}
      </div>
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

// ── Main Modal ────────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void;
  // L'id du client créé est transmis quand la réponse de création le fournit
  // (utilisé par la conversion des demandes d'accès du site vitrine). Les
  // appelants existants qui ignorent l'argument restent compatibles.
  onCreated: (createdClientId?: number) => void;
  // Pré-remplissage optionnel de l'étape 1 (conversion d'une demande d'accès).
  initialValues?: { nom?: string; email?: string; telephone?: string; ville?: string };
}

export default function AddClientModal({ onClose, onCreated, initialValues }: Props) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1
  const [nom, setNom] = useState(initialValues?.nom ?? '');
  const [email, setEmail] = useState(initialValues?.email ?? '');
  const [tel, setTel] = useState(initialValues?.telephone ?? '');
  const [telTouched, setTelTouched] = useState(false);
  // Lot 3, étape 2 : identité légale (facultative), contrôlée par le serveur au clic sur « Suivant »
  const [identite, setIdentite] = useState<IdentiteLegale>({ ...IDENTITE_VIDE, ville: initialValues?.ville || null });
  const [identiteAvert, setIdentiteAvert] = useState<string[]>([]);
  const [controleEnCours, setControleEnCours] = useState(false);

  // Step 2 — domaine + composition par composant (les compteurs sont dérivés)
  const [domaines, setDomaines] = useState<DomaineOption[]>([]);
  const [domainesLoading, setDomainesLoading] = useState(true);
  const [domainesError, setDomainesError] = useState<string | null>(null);
  const [domaineId, setDomaineId] = useState<number | null>(null);
  const [nbParCode, setNbParCode] = useState<Record<string, number>>({});
  const [formuleActivites, setFormuleActivites] = useState<Formule>('premium');
  const [montantOnboarding, setMontantOnboarding] = useState('');
  // true dès que l'admin a saisi lui-même le montant : la grille ne l'écrase plus
  const obManuel = useRef(false);
  const [preview, setPreview] = useState<PricingPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Step 3 — promo
  const [promos, setPromos] = useState<PromoForm[]>([]);
  const [promoForm, setPromoForm] = useState<PromoForm>({ type: 'percent_off', appliesTo: 'mensualite', moisDebut: '', months: '', discountVal: '', fixedVal: '' });
  const [promoError, setPromoError] = useState<string | null>(null);


  // ── Domaine / composition dérivés ──
  const domaine = useMemo(() => domaines.find((d) => d.id === domaineId) ?? null, [domaines, domaineId]);
  const composants = useMemo(() => composantsActifs(domaine), [domaine]);
  const regles = useMemo(() => resoudreRegles(domaine?.regles), [domaine]);
  const compteurs = useMemo(() => deriveCompteurs(composants, nbParCode), [composants, nbParCode]);
  const compositionErrors = useMemo(() => validerCompositionClient(composants, nbParCode, regles), [composants, nbParCode, regles]);
  const payloadComposants = useMemo(() => composantsPayload(composants, nbParCode), [composants, nbParCode]);
  const composantsKey = JSON.stringify(payloadComposants);
  const { nbActivites, nbLabos, nbGerants, nbAcheteurs } = compteurs;

  const selectDomaine = useCallback((d: DomaineOption) => {
    setDomaineId(d.id);
    setNbParCode(quantitesInitiales(composantsActifs(d)));
    obManuel.current = false;
    const formules = resoudreRegles(d.regles).formules;
    setFormuleActivites((f) => (formules.includes(f) ? f : formules[0]));
    setError(null);
  }, []);

  // Quantité d'un composant ; si Σ labo tombe à 0, l'option Acheteurs est remise à 0
  // (règle acheteurs_requiert_labo — comme l'ancien Counter « Labos »).
  const setNb = (code: string, n: number) => {
    setNbParCode((prev) => {
      const next = { ...prev, [code]: Math.max(0, n) };
      if (regles.acheteurs_requiert_labo) {
        const labos = composants.filter((c) => c.typeTechnique === 'labo').reduce((s, c) => s + (next[c.code] ?? 0), 0);
        if (labos === 0) composants.filter((c) => c.typeTechnique === 'acheteurs').forEach((c) => { next[c.code] = 0; });
      }
      return next;
    });
  };

  useEffect(() => {
    api.get('/api/domaines')
      .then(({ data }) => {
        const list: DomaineOption[] = Array.isArray(data) ? data : [];
        setDomaines(list);
        setDomainesError(null);
        // Pré-sélection si un seul domaine existe
        if (list.length === 1) selectDomaine(list[0]);
      })
      .catch((err: unknown) => setDomainesError(apiMessage(err, 'Impossible de charger les domaines d\'activité.')))
      .finally(() => setDomainesLoading(false));
  }, [selectDomaine]);

  // Fetch pricing preview whenever config changes; auto-set onboarding price from response
  const fetchPreview = useCallback(async (dId: number, comps: { code: string; nb: number }[], k: { nbActivites: number; nbLabos: number; nbGerants: number; nbAcheteurs: number }, formule: Formule) => {
    setPreviewLoading(true);
    try {
      const { data } = await api.get('/api/abonnements/pricing-preview', {
        params: {
          domaineId: dId,
          composants: JSON.stringify(comps),
          // compteurs dérivés (compat anciens paramètres)
          nbActivites: k.nbActivites, nbLabos: k.nbLabos, nbGerants: k.nbGerants, nbAcheteurs: k.nbAcheteurs,
          formuleActivites: formule,
        },
      });
      setPreview(data);
      setPreviewError(null);
      if (data.onboardingPrice != null && !obManuel.current) setMontantOnboarding(String(data.onboardingPrice));
    } catch (err: unknown) {
      setPreview(null);
      setPreviewError(apiMessage(err, 'Tarif indisponible — vérifiez la composition.'));
    } finally { setPreviewLoading(false); }
  }, []);

  useEffect(() => {
    if ((step === 1 || step === 3) && domaineId != null) {
      fetchPreview(domaineId, JSON.parse(composantsKey), { nbActivites, nbLabos, nbGerants, nbAcheteurs }, formuleActivites);
    }
  }, [step, domaineId, composantsKey, nbActivites, nbLabos, nbGerants, nbAcheteurs, formuleActivites, fetchPreview]);

  // ── Step validation ──

  const { emailExists, emailChecking, emailCheckFailed } = useEmailCheck(email);
  const telValid = TUNISIAN_PHONE.test(tel.replace(/\s/g, ''));
  const step1Valid =
    nom.trim().length > 0 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
    !emailExists &&
    !emailChecking &&
    !emailCheckFailed &&
    telValid;
  const montantOb = parseFloat(montantOnboarding);
  const montantObValid = montantOnboarding !== '' && Number.isFinite(montantOb) && montantOb >= 0;
  // Domaine choisi + composition valide (miroir client des règles ; le serveur reste juge) + onboarding saisi
  const step2Valid = domaineId != null && compositionErrors.length === 0 && montantObValid;
  const nextDisabled = (step === 0 && (!step1Valid || controleEnCours)) || (step === 1 && !step2Valid);

  const next = async () => {
    setError(null);
    if (step === 0) {
      if (!nom.trim()) { setError('Le nom du contact est obligatoire.'); return; }
      // Nom pré-rempli depuis une demande d'accès (jusqu'à 150 caractères) : refusé ici plutôt qu'à la dernière étape.
      if (nom.trim().length > 100) { setError('Nom du contact : 100 caractères au maximum.'); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError('Email invalide.'); return; }
      if (emailChecking) { setError('Vérification de l\'email en cours…'); return; }
      if (emailCheckFailed) { setError('Impossible de vérifier l\'email — vérifiez votre connexion.'); return; }
      if (emailExists) { setError('Cet email est déjà utilisé.'); return; }
      if (!telValid) { setError('Téléphone invalide — format tunisien requis (ex: 20 123 456 ou +216 20 123 456).'); return; }
      // Identité saisie : contrôlée maintenant par le serveur (mêmes règles que la création), pour que l'erreur
      // s'affiche ici et pas à la dernière étape. Valeurs normalisées reprises (matricule, espaces…).
      const corps = corpsIdentite(identite);
      if (Object.values(corps).some(Boolean)) {
        setControleEnCours(true);
        try {
          const { data } = await api.post('/admin/clients/identite/controle', corps);
          setIdentite(identiteDe(data?.valeurs));
          setIdentiteAvert(Array.isArray(data?.avertissements) ? data.avertissements : []);
        } catch (err: unknown) {
          setError(apiMessage(err, "L'identité n'a pas pu être contrôlée — réessayez."));
          return;
        } finally {
          setControleEnCours(false);
        }
      } else {
        setIdentiteAvert([]);
      }
    }
    if (step === 1 && !step2Valid) {
      if (domaineId == null) setError('Choisissez le domaine d\'activité du client.');
      else if (compositionErrors.length > 0) setError(compositionErrors[0]);
      else setError('Indiquez le montant d\'onboarding (0 accepté).');
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

  // La promo système est ignorée si l'admin a déjà posé une promo sur la mensualité
  // (la sienne prime, exactement comme côté backend).
  const aDejaPromoMensuelle = promos.some((p) => ['mensualite', 'les_deux'].includes(p.appliesTo));

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    try {
      const { data } = await api.post('/admin/clients', {
        nom, email, telephone: tel,
        // Lot 3 : identité légale (déjà contrôlée à l'étape 1 ; le serveur la recontrôle)
        ...corpsIdentite(identite),
        domaineId,
        composants: payloadComposants,
        // compteurs dérivés (compat)
        nbActivites, nbLabos, nbGerants, nbAcheteurs,
        formuleActivites,
        montantOnboarding: parseFloat(montantOnboarding) || 0,
        promotions: promos.map(mapPromoForApi),
      });
      // Id du client créé si la réponse le fournit (plusieurs formes tolérées).
      const createdClientId: number | undefined =
        typeof data?.id === 'number' ? data.id
        : typeof data?.clientId === 'number' ? data.clientId
        : typeof data?.client?.id === 'number' ? data.client.id
        : undefined;
      onCreated(createdClientId);
      onClose();
    } catch (err: unknown) {
      setError(apiMessage(err, 'Erreur lors de la création'));
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

  const grilleNom = preview?.domaine?.nom ?? domaine?.nom ?? null;
  const onboardingGrille = preview?.onboardingPrice ?? null;
  // Récap composition avec les mots du domaine (« 2 Restaurants · 1 Cuisine »)
  const recapComposants = composants
    .filter((c) => (nbParCode[c.code] ?? 0) > 0)
    .map((c) => c.typeTechnique === 'acheteurs'
      ? `${c.libelle} ≤ ${nbParCode[c.code]}`
      : libelleComposant(c, nbParCode[c.code] ?? 0));
  const formulesDispo = regles.formules;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
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
              {/* Lot 3, étape 2 : identité légale d'abord (facultative), puis le contact */}
              <div style={sectionTitre}>🏢 Identité légale <span style={sectionAide}>facultative — telle qu'écrite sur la patente</span></div>
              <ClientIdentiteForm value={identite} onChange={(v) => { setIdentite(v); setIdentiteAvert([]); setError(null); }} disabled={controleEnCours} />
              {/* L'avertissement « sans lettre de clé » est déjà affiché sous le champ du matricule : pas en double */}
              {identiteAvert.filter((a) => a !== controlerMatriculeFiscal(identite.matriculeFiscal).avertissement)
                .map((a) => <div key={a} style={bannerWarn}>⚠️ {a}</div>)}

              <div style={{ ...sectionTitre, marginTop: 6 }}>👤 Contact <span style={sectionAide}>la personne qui recevra l'email d'activation</span></div>
              <div>
                <label style={labelStyle}>Nom du contact *</label>
                <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Prénom et nom" maxLength={100} disabled={controleEnCours} style={inputStyle} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Email *</label>
                  <input
                    type="email"
                    value={email}
                    disabled={controleEnCours}
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
                    disabled={controleEnCours}
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
            </div>
          )}

          {/* ── STEP 2: Configuration ── */}
          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

              {/* (1) Domaine d'activité — radio-cards, obligatoire */}
              <div>
                <label style={labelStyle}>Domaine d'activité *</label>
                {domainesLoading ? (
                  <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>Chargement des domaines…</p>
                ) : domainesError ? (
                  <div style={bannerDanger}>{domainesError}</div>
                ) : domaines.length === 0 ? (
                  <div style={bannerWarn}>Aucun domaine d'activité configuré — créez-en un dans « Domaines d'activités ».</div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
                    {domaines.map((d) => {
                      const sel = d.id === domaineId;
                      const nbComp = composantsActifs(d).length;
                      return (
                        <button key={d.id} type="button" onClick={() => { if (!sel) selectDomaine(d); }}
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
                            <span style={{ fontSize: 13, fontWeight: 700, color: sel ? '#4338ca' : '#0f172a' }}>{d.nom}</span>
                          </div>
                          <div style={{ fontSize: 11, color: sel ? '#6366f1' : '#64748b', marginTop: 4, lineHeight: 1.4 }}>
                            {d.description || 'Grille tarifaire et menu de composants du domaine'}
                          </div>
                          <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4, fontWeight: 600 }}>
                            {nbComp} composant{nbComp > 1 ? 's' : ''}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* (2) Configuration — un Counter par composant actif du domaine */}
              {domaine && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <label style={{ ...labelStyle, marginBottom: 0 }}>Configuration — {domaine.nom}</label>
                  {composants.length === 0 && (
                    <div style={bannerWarn}>Ce domaine n'a aucun composant actif — complétez son profil avant de créer un client.</div>
                  )}
                  {composants.map((c) => {
                    const nb = nbParCode[c.code] ?? 0;
                    const titre = `${c.icone ? `${c.icone} ` : ''}${c.libelle}`;
                    if (c.typeTechnique === 'acheteurs') {
                      const verrou = regles.acheteurs_requiert_labo && nbLabos === 0;
                      const paliers = PALIERS_ACHETEURS.filter((p) => p === 0 || ((c.nbMax == null || p <= c.nbMax) && p >= (c.nbMin ?? 0)));
                      return (
                        <div key={c.code} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '14px 16px', opacity: verrou ? 0.6 : 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{titre}</div>
                          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2, marginBottom: 8 }}>
                            {c.aide || AIDE_DEFAUT.acheteurs}{regles.acheteurs_requiert_labo ? ' — nécessite au moins un labo' : ''}
                          </div>
                          <select
                            value={nb}
                            onChange={(e) => setNb(c.code, parseInt(e.target.value, 10) || 0)}
                            disabled={verrou}
                            style={{ ...selectStyle, cursor: verrou ? 'default' : 'pointer', background: verrou ? '#f8fafc' : '#fff' }}
                          >
                            {paliers.map((p) => <option key={p} value={p}>{PALIER_LABELS[p]}</option>)}
                          </select>
                        </div>
                      );
                    }
                    return (
                      <Counter key={c.code} label={titre} sub={c.aide || AIDE_DEFAUT[c.typeTechnique]} value={nb}
                        onChange={(n) => setNb(c.code, n)} min={c.nbMin ?? 0} max={c.nbMax ?? null} />
                    );
                  })}

                  {/* Règles de composition (miroir client — le serveur reste juge) */}
                  {compositionErrors.map((msg, i) => (
                    <div key={i} style={bannerWarn}>⚠️ {msg}</div>
                  ))}

                  {/* (3) Formule d'activités — si au moins une activité (composant de vente) */}
                  {nbActivites >= 1 && formulesDispo.length > 0 && (
                    <div>
                      <label style={labelStyle}>Formule d'activités</label>
                      <div style={{ display: 'grid', gridTemplateColumns: formulesDispo.length > 1 ? '1fr 1fr' : '1fr', gap: 10 }}>
                        {([
                          { value: 'basique' as Formule, title: 'Activité Basique', desc: 'Stock + Ventes d\'articles, sans Espace Produit' },
                          { value: 'premium' as Formule, title: 'Activité Premium', desc: 'Stock + Ventes + Espace Produit complet' },
                        ]).filter((f) => formulesDispo.includes(f.value)).map((f) => {
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

                  {/* (4) Montant d'onboarding — éditable, pré-rempli par la grille */}
                  <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '14px 16px' }}>
                    <label style={labelStyle}>Montant d'onboarding (DT, paiement unique)</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <input
                        type="number" min="0" step="0.01"
                        value={montantOnboarding}
                        onChange={(e) => { obManuel.current = true; setMontantOnboarding(e.target.value); }}
                        placeholder={onboardingGrille != null ? String(onboardingGrille) : '0'}
                        style={{ ...inputStyle, width: 160, borderColor: montantOnboarding !== '' && !montantObValid ? '#fca5a5' : inputStyle.borderColor }}
                      />
                      {onboardingGrille != null && (
                        <span style={{ fontSize: 11, color: '#64748b' }}>
                          Grille : <strong>{fmt(onboardingGrille)}</strong>
                          {montantOnboarding !== '' && parseFloat(montantOnboarding) !== onboardingGrille && (
                            <button type="button" onClick={() => { obManuel.current = false; setMontantOnboarding(String(onboardingGrille)); }}
                              style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: '#4338ca', background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 6, padding: '2px 8px', cursor: 'pointer' }}>
                              ↺ Reprendre
                            </button>
                          )}
                        </span>
                      )}
                    </div>
                    {montantOnboarding !== '' && !montantObValid && (
                      <div style={{ fontSize: 11, color: '#dc2626', marginTop: 4 }}>Montant invalide (nombre ≥ 0).</div>
                    )}
                  </div>

                  {/* (5) Récapitulatif tarifaire — grille du domaine */}
                  {previewError && <div style={bannerDanger}>{previewError}</div>}
                  {previewLoading ? (
                    <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 12, padding: 12 }}>Calcul en cours…</div>
                  ) : (
                    <PricingCard preview={preview} promos={promos} grille={grilleNom} onboarding={montantObValid ? montantOb : undefined} />
                  )}
                </div>
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

                {/* Promo système « 1er mois offert » : toujours appliquée, verrouillée.
                    Masquée si l'admin pose sa propre promo mensualité (qui prime). */}
                {!aDejaPromoMensuelle && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 8, padding: '8px 12px', marginBottom: 6 }}>
                    <span style={{ flex: 1, fontSize: 12, color: '#047857', fontWeight: 600 }}>🎁 1er mois d'abonnement offert — appliqué automatiquement</span>
                    <span title="Promotion par défaut, non supprimable" style={{ fontSize: 11, color: '#059669', background: '#d1fae5', border: '1px solid #a7f3d0', borderRadius: 5, padding: '2px 8px' }}>🔒 verrouillée</span>
                  </div>
                )}

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

          {/* ── STEP 4: Récapitulatif ── */}
          {step === 3 && (
            <div>
              {/* Summary */}
              <div style={{ background: 'linear-gradient(135deg,#f0f9ff 0%,#e0f2fe 100%)', border: '1px solid #bae6fd', borderRadius: 14, padding: '14px 18px', marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#0c4a6e', marginBottom: 10 }}>📋 Récapitulatif</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {identite.raisonSociale && (
                    <div style={{ display: 'flex', gap: 8, fontSize: 12, gridColumn: '1 / -1' }}>
                      <span style={{ color: '#64748b', fontWeight: 600 }}>🏢 Raison sociale</span>
                      <span style={{ color: '#0f172a', fontWeight: 700 }}>{identite.raisonSociale}{identite.matriculeFiscal ? ` · MF ${identite.matriculeFiscal}` : ''}</span>
                    </div>
                  )}
                  {(identite.adresse || identite.ville) && (
                    <div style={{ display: 'flex', gap: 8, fontSize: 12, gridColumn: '1 / -1' }}>
                      <span style={{ color: '#64748b', fontWeight: 600 }}>📍 Adresse</span>
                      <span style={{ color: '#0f172a' }}>{[identite.adresse, identite.ville].filter(Boolean).join(', ')}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8, fontSize: 12 }}>
                    <span style={{ color: '#64748b', fontWeight: 600 }}>👤 Contact</span>
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
                  <div style={{ display: 'flex', gap: 8, fontSize: 12 }}>
                    <span style={{ color: '#64748b', fontWeight: 600 }}>🏷️ Domaine</span>
                    <span style={{ color: '#0f172a', fontWeight: 700 }}>{domaine?.nom ?? '—'}</span>
                  </div>
                  {!(identite.raisonSociale && identite.matriculeFiscal && identite.adresse && identite.ville) && (
                    <div style={{ ...bannerWarn, gridColumn: '1 / -1', fontWeight: 500 }}>
                      🪪 Identité à compléter (raison sociale, matricule fiscal, adresse, ville) : le client sera créé, sa fiche
                      restera marquée « Identité à compléter ».
                    </div>
                  )}
                  {identiteAvert.map((a) => <div key={a} style={{ ...bannerWarn, gridColumn: '1 / -1', fontWeight: 500 }}>⚠️ {a}</div>)}
                  <div style={{ display: 'flex', gap: 8, fontSize: 12, gridColumn: '1 / -1' }}>
                    <span style={{ color: '#64748b', fontWeight: 600 }}>⚙️ Composition</span>
                    <span style={{ color: '#0f172a', fontWeight: 700 }}>{recapComposants.length > 0 ? recapComposants.join(' · ') : '—'}</span>
                  </div>
                </div>
              </div>

              <PricingCard preview={preview} promos={promos} grille={grilleNom} onboarding={montantObValid ? montantOb : undefined} />
              {/* Promo système, appliquée par le serveur à la création (ne pas l'envoyer : elle serait créée en double) */}
              {!aDejaPromoMensuelle && (
                <div style={{ marginTop: 12, background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#047857', fontWeight: 600 }}>
                  🎁 1er mois d'abonnement offert — appliqué automatiquement à la création
                </div>
              )}

              <div style={{ marginTop: 12, background: '#fefce8', border: '1px solid #fde68a', borderRadius: 10, padding: '10px 14px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#713f12', marginBottom: 4 }}>📬 Ce qui sera envoyé au client :</div>
                <div style={{ fontSize: 11, color: '#92400e', lineHeight: 1.7 }}>
                  ✉️ Email de bienvenue avec 🔗 lien d'activation (valable 48 h), tout de suite après la création
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
              {step === 0 && (emailChecking || controleEnCours) ? 'Vérification…' : 'Suivant →'}
            </button>
          ) : (() => {
            const disabled = saving;
            return (
              <button
                onClick={handleSubmit}
                disabled={disabled}
                style={{ padding: '9px 28px', borderRadius: 9, border: 'none', background: disabled ? '#e5e7eb' : 'linear-gradient(135deg,#059669,#10b981)', color: disabled ? '#9ca3af' : '#fff', fontSize: 13, fontWeight: 700, cursor: disabled ? 'default' : 'pointer', boxShadow: disabled ? 'none' : '0 4px 14px rgba(16,185,129,0.35)' }}>
                {saving ? 'Création en cours…' : "✓ Créer le compte & envoyer l'accès"}
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

// Titres de section de l'étape 1 (lot 3)
const sectionTitre: React.CSSProperties = {
  fontSize: 12.5, fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap',
  borderBottom: '1px solid #f1f5f9', paddingBottom: 6,
};
const sectionAide: React.CSSProperties = { fontSize: 11, fontWeight: 500, color: '#94a3b8' };

// Bandeaux inline (le wizard n'utilise pas alerte() : ses messages restent dans l'étape en cours)
const bannerWarn: React.CSSProperties = {
  background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 8, padding: '8px 12px', fontSize: '0.78rem', color: '#92400e', fontWeight: 600,
};
const bannerDanger: React.CSSProperties = {
  background: '#fee2e2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', fontSize: '0.78rem', color: '#dc2626', fontWeight: 600,
};
