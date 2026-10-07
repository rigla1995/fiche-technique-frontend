import { useEffect, useState } from 'react';
import api from '../../api/client';
import type { PosteCompta, Promotion } from '../../types';
import { MonthPicker } from './MonthPicker';
import Counter from './Counter';
import ClientIdentiteForm from './ClientIdentiteForm';
import { IDENTITE_VIDE, corpsIdentite, identiteDe, type IdentiteLegale } from '../../utils/identiteLegale';
import { controlerMatriculeFiscal } from './matriculeFiscal';

// Assistant « Nouveau comptable » (LabFlow Compta, étape S2b) — même présentation que « Nouveau client »
// (AddClientModal) : identité légale (lecture de la patente) et contact, abonnement (gérants achetés, aperçu du prix,
// frais de mise en route), promotions (comme un client ; PAS de « 1er mois offert », décision du 06/10), récapitulatif.
// POST /admin/comptables : le serveur crée tout en une transaction et envoie l'activation vers compta.labflow-tn.com.

const STEPS = ['Informations', 'Abonnement', 'Promotions', 'Récapitulatif'];
const NB_GERANTS_MAX = 50;
const TUNISIAN_PHONE = /^(\+216[\s-]?)?[2579]\d{7}$/;
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Étape S3c (réponse du client du 07/10) : l'adresse du titulaire est libre, déjà prise, ou celle d'un compte LabFlow
// Compta sans cabinet ni abonnement — le cabinet lui est alors rattaché (GET /admin/comptables/adresse). Vérifiée après
// une courte pause de saisie, comme useEmailCheck ; une réponse tardive pour une ancienne adresse est ignorée.
type EtatAdresse = { etat: 'libre' } | { etat: 'prise' } | { etat: 'rattachable'; nom: string; active: boolean };
function useAdresseCabinet(email: string) {
  // Réponse (ou échec) rangée avec l'adresse vérifiée : tant qu'elle ne porte pas sur l'adresse saisie, la vérification
  // est « en cours ».
  const [reponse, setReponse] = useState<{ email: string; adresse: EtatAdresse | null; echec: boolean } | null>(null);
  useEffect(() => {
    if (!RE_EMAIL.test(email)) return;
    let annule = false;
    const minuterie = setTimeout(() => {
      api.get('/admin/comptables/adresse', { params: { email } })
        .then(({ data }) => { if (!annule) setReponse({ email, adresse: data as EtatAdresse, echec: false }); })
        .catch(() => { if (!annule) setReponse({ email, adresse: null, echec: true }); });
    }, 400);
    return () => { annule = true; clearTimeout(minuterie); };
  }, [email]);
  const courante = reponse?.email === email ? reponse : null;
  return { adresse: courante?.adresse ?? null, emailChecking: RE_EMAIL.test(email) && !courante, emailCheckFailed: !!courante?.echec };
}

interface PromoForm {
  type: Promotion['type'];
  appliesTo: string;
  moisDebut: string;
  months: string;
  discountVal: string;
  fixedVal: string;
}
interface Apercu {
  nbGerants: number;
  cabinetMensuel: number;
  gerantMensuel: number;
  miseEnRoute: number;
  postes: PosteCompta[];
  totalMensuel: number;
  tarifManquant: boolean;
}

const fmt = (n: number) => `${n.toLocaleString('fr-FR')} DT`;
const apiMessage = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;
const PROMO_VIDE: PromoForm = { type: 'percent_off', appliesTo: 'mensualite', moisDebut: '', months: '', discountVal: '', fixedVal: '' };

function StepIndicator({ current }: { current: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 28 }}>
      {STEPS.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={s} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : 0 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: done ? '#4338ca' : active ? '#6366f1' : '#e2e8f0', color: done || active ? '#fff' : '#9ca3af',
                fontSize: 13, fontWeight: 700, boxShadow: active ? '0 0 0 3px #c7d2fe' : 'none',
              }}>
                {done ? '✓' : i + 1}
              </div>
              <span style={{ fontSize: 10, fontWeight: active ? 700 : 500, color: active ? '#4338ca' : done ? '#6366f1' : '#9ca3af', whiteSpace: 'nowrap' }}>{s}</span>
            </div>
            {i < STEPS.length - 1 && <div style={{ flex: 1, height: 2, background: done ? '#6366f1' : '#e2e8f0', margin: '0 6px', marginBottom: 18 }} />}
          </div>
        );
      })}
    </div>
  );
}

const promoLabel = (p: PromoForm) => {
  const cible: Record<string, string> = { onboarding: 'Mise en route', mensualite: 'Mensualité' };
  const type = p.type === 'free_months' ? 'Gratuit' : p.type === 'percent_off' ? `−${p.discountVal}%` : `${p.fixedVal} DT`;
  const duree = p.months ? ` · ${p.months} mois` : ' · Permanent';
  const debut = p.appliesTo !== 'onboarding' && p.moisDebut ? ` · À partir de ${p.moisDebut}` : '';
  return `${cible[p.appliesTo] || p.appliesTo} — ${type}${p.appliesTo === 'onboarding' ? '' : duree}${debut}`;
};

const promoPourApi = (p: PromoForm) => {
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const dateDebut = p.appliesTo === 'onboarding' ? aujourdhui : (p.moisDebut ? `${p.moisDebut}-01` : `${aujourdhui.slice(0, 7)}-01`);
  const ob = p.appliesTo === 'onboarding';
  return {
    type: p.type,
    appliesTo: p.appliesTo,
    dateDebut,
    monthsDuration: !ob && p.months ? parseInt(p.months, 10) : null,
    discountOnboarding: p.type === 'percent_off' && ob ? parseFloat(p.discountVal) : null,
    discountMensualite: p.type === 'percent_off' && !ob ? parseFloat(p.discountVal) : null,
    fixedOnboarding: p.type === 'fixed_price' && ob ? parseFloat(p.fixedVal) : null,
    fixedMensualite: p.type === 'fixed_price' && !ob ? parseFloat(p.fixedVal) : null,
  };
};

export default function NouveauComptableModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Étape 1 — identité et contact
  const [identite, setIdentite] = useState<IdentiteLegale>(IDENTITE_VIDE);
  const [identiteAvert, setIdentiteAvert] = useState<string[]>([]);
  const [controleEnCours, setControleEnCours] = useState(false);
  const [lectureEnCours, setLectureEnCours] = useState(false);
  const [nom, setNom] = useState('');
  const [email, setEmail] = useState('');
  const [tel, setTel] = useState('');
  const [telTouched, setTelTouched] = useState(false);

  // Étape 2 — abonnement
  const [nbGerants, setNbGerants] = useState(0);
  const [apercu, setApercu] = useState<Apercu | null>(null);
  const [apercuErreur, setApercuErreur] = useState<string | null>(null);
  const [miseEnRoute, setMiseEnRoute] = useState('');
  const [miseEnRouteTouchee, setMiseEnRouteTouchee] = useState(false);

  // Étape 3 — promotions
  const [promos, setPromos] = useState<PromoForm[]>([]);
  const [promoForm, setPromoForm] = useState<PromoForm>(PROMO_VIDE);
  const [promoError, setPromoError] = useState<string | null>(null);

  const { adresse, emailChecking, emailCheckFailed } = useAdresseCabinet(email);
  const emailExists = adresse?.etat === 'prise';
  const rattache = adresse?.etat === 'rattachable' ? adresse : null;
  const telValid = TUNISIAN_PHONE.test(tel.replace(/\s/g, ''));
  const step1Valid = nom.trim().length > 0 && RE_EMAIL.test(email) && !!adresse && !emailExists && !emailChecking && !emailCheckFailed && telValid;
  const montantMer = parseFloat(miseEnRoute);
  const merValid = miseEnRoute !== '' && Number.isFinite(montantMer) && montantMer >= 0;
  const step2Valid = !!apercu && !apercu.tarifManquant && merValid;
  const nextDisabled = (step === 0 && (!step1Valid || controleEnCours || lectureEnCours)) || (step === 1 && !step2Valid);

  // Aperçu du prix (grille générale) à chaque nombre de gérants ; frais de mise en route proposés tant qu'ils
  // n'ont pas été saisis.
  useEffect(() => {
    let annule = false;
    api.get('/admin/comptables/apercu-prix', { params: { nbGerants } })
      .then(({ data }) => {
        if (annule) return;
        setApercuErreur(null);
        setApercu(data as Apercu);
        if (!miseEnRouteTouchee) setMiseEnRoute(String((data as Apercu).miseEnRoute ?? 0));
      })
      // Échec : plus d'aperçu (l'étape reste bloquée), jamais l'aperçu d'un autre nombre de gérants.
      .catch((err) => { if (!annule) { setApercu(null); setApercuErreur(apiMessage(err, 'Aperçu du prix indisponible — réessayez.')); } });
    return () => { annule = true; };
  }, [nbGerants, miseEnRouteTouchee]);

  const next = async () => {
    setError(null);
    if (step === 0) {
      if (!nom.trim()) { setError('Le nom du contact est obligatoire.'); return; }
      if (nom.trim().length > 100) { setError('Nom du contact : 100 caractères au maximum.'); return; }
      if (emailExists) { setError('Cet email est déjà utilisé.'); return; }
      if (!telValid) { setError('Téléphone invalide — format tunisien requis (ex: 20 123 456 ou +216 20 123 456).'); return; }
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
      setError(apercu?.tarifManquant
        ? 'Le tarif « LabFlow Compta seul » vaut 0 DT : renseignez-le d\'abord (menu Tarifs, section LabFlow Compta).'
        : 'Indiquez les frais de mise en route (0 accepté).');
      return;
    }
    setStep((s) => s + 1);
  };

  const ajouterPromo = () => {
    const { type, appliesTo, moisDebut, discountVal, fixedVal } = promoForm;
    if (appliesTo !== 'onboarding' && !moisDebut) { setPromoError('Mois de début requis'); return; }
    if (type === 'percent_off' && !discountVal) { setPromoError('% requis'); return; }
    if (type === 'percent_off' && !(parseFloat(discountVal) >= 0 && parseFloat(discountVal) <= 100)) { setPromoError('Pourcentage de 0 à 100'); return; }
    if (type === 'fixed_price' && !fixedVal) { setPromoError('Montant requis'); return; }
    if (type === 'fixed_price' && !(parseFloat(fixedVal) >= 0)) { setPromoError('Montant positif requis'); return; }
    setPromos((p) => [...p, { ...promoForm }]);
    setPromoForm(PROMO_VIDE);
    setPromoError(null);
  };

  const creer = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.post('/admin/comptables', {
        name: nom.trim(), email, telephone: tel,
        ...corpsIdentite(identite),
        nbGerants,
        montantMiseEnRoute: montantMer,
        promotions: promos.map(promoPourApi),
      });
      onCreated();
      onClose();
    } catch (err: unknown) {
      setError(apiMessage(err, 'Erreur lors de la création'));
    } finally {
      setSaving(false);
    }
  };

  // Mois déjà couverts par une promotion de mensualité ajoutée ici (pas de chevauchement, comme pour un client).
  const moisActuel = new Date().toISOString().slice(0, 7);
  const moisBloques = new Set<string>();
  promos.filter((p) => p.appliesTo === 'mensualite' && p.moisDebut).forEach((p) => {
    const debut = new Date(`${p.moisDebut}-01T00:00:00`);
    const fin = p.months ? new Date(debut.getFullYear(), debut.getMonth() + parseInt(p.months, 10), 0) : new Date(debut.getFullYear() + 3, 11, 31);
    for (const d = new Date(debut); d <= fin; d.setMonth(d.getMonth() + 1)) moisBloques.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  });
  const ciblesPromo = [
    !promos.some((p) => p.appliesTo === 'onboarding') && montantMer > 0 ? { value: 'onboarding', label: 'Mise en route' } : null,
    { value: 'mensualite', label: 'Mensualité' },
  ].filter(Boolean) as { value: string; label: string }[];
  const promoMensuelle = promos.find((p) => p.appliesTo === 'mensualite' && p.moisDebut === moisActuel) || null;
  const premierMois = apercu
    ? (promoMensuelle ? (promoMensuelle.type === 'free_months' ? 0 : promoMensuelle.type === 'percent_off'
      ? Math.round(apercu.totalMensuel * (1 - parseFloat(promoMensuelle.discountVal) / 100) * 100) / 100
      : parseFloat(promoMensuelle.fixedVal)) : apercu.totalMensuel)
    : null;

  const carteprix = apercu && (
    <div style={{ background: '#fff', border: '1px solid #c7d2fe', borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ background: 'linear-gradient(135deg,#eef2ff,#e0e7ff)', padding: '10px 16px', fontSize: 12, fontWeight: 800, color: '#3730a3' }}>💳 Mensualité LabFlow Compta</div>
      <div style={{ padding: '10px 16px' }}>
        {apercu.postes.map((p) => (
          <div key={p.code} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12.5, padding: '4px 0', color: '#334155' }}>
            <span>{p.libelle}</span><span style={{ fontWeight: 700 }}>{fmt(p.montant)}</span>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e0e7ff', marginTop: 6, paddingTop: 8, fontSize: 13.5, fontWeight: 900, color: '#3730a3' }}>
          <span>Total mensuel</span><span>{fmt(apercu.totalMensuel)}</span>
        </div>
        {merValid && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748b', marginTop: 6 }}>
            <span>Frais de mise en route (une fois)</span><span style={{ fontWeight: 700 }}>{fmt(montantMer)}</span>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 640, maxHeight: '92vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 32px 80px rgba(0,0,0,0.22)' }}>
        <div style={{ padding: '24px 28px 20px', borderBottom: '1px solid #f1f5f9', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>Nouveau comptable</div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>LabFlow Compta — étape {step + 1} sur {STEPS.length} — {STEPS[step]}</div>
            </div>
            <button type="button" onClick={onClose} aria-label="Fermer" style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', background: '#f1f5f9', color: '#64748b', fontSize: 18, cursor: 'pointer' }}>✕</button>
          </div>
          <StepIndicator current={step} />
        </div>

        <div style={{ padding: '24px 28px', overflowY: 'auto', flex: 1 }}>
          {/* Étape 1 gardée montée : le compte rendu de la lecture de la patente reste là au retour. */}
          <div style={{ display: step === 0 ? 'flex' : 'none', flexDirection: 'column', gap: 16 }}>
            <div style={sectionTitre}>🏢 Identité légale du cabinet <span style={sectionAide}>facultative — telle qu'écrite sur la patente, imprimée sur ses factures</span></div>
            <ClientIdentiteForm value={identite} onChange={(v) => { setIdentite(v); setIdentiteAvert([]); setError(null); }} disabled={controleEnCours} onLecture={setLectureEnCours} />
            {identiteAvert.filter((a) => a !== controlerMatriculeFiscal(identite.matriculeFiscal).avertissement)
              .map((a) => <div key={a} style={bannerWarn}>⚠️ {a}</div>)}
            <div style={{ ...sectionTitre, marginTop: 6 }}>👤 Titulaire <span style={sectionAide}>la personne qui recevra l'email d'activation de LabFlow Compta</span></div>
            <div>
              <label style={labelStyle}>Nom du titulaire *</label>
              <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Prénom et nom" maxLength={100} disabled={controleEnCours} style={inputStyle} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              <div>
                <label style={labelStyle}>Email *</label>
                <input type="email" value={email} disabled={controleEnCours} onChange={(e) => setEmail(e.target.value)} placeholder="email@cabinet.tn"
                  style={{ ...inputStyle, borderColor: emailExists || emailCheckFailed ? '#fca5a5' : '#e2e8f0' }} />
                {emailChecking && <div style={{ fontSize: 11, color: '#6366f1', marginTop: 3 }}>⏳ Vérification en cours…</div>}
                {!emailChecking && emailExists && <div style={{ fontSize: 11, color: '#dc2626', marginTop: 3, fontWeight: 600 }}>❌ Cet email est déjà associé à un compte (une adresse ne sert qu'à un compte).</div>}
                {!emailChecking && emailCheckFailed && <div style={{ fontSize: 11, color: '#dc2626', marginTop: 3, fontWeight: 600 }}>❌ Impossible de vérifier cet email — réessayez.</div>}
                {!emailChecking && rattache && (
                  <div style={{ ...bannerInfo, marginTop: 6 }}>
                    🔗 Compte LabFlow Compta existant ({rattache.nom}) : le cabinet lui sera rattaché. La personne garde son mot de passe et
                    les comptabilités qu'on lui a confiées ; elle recevra {rattache.active ? 'un email « votre cabinet est ouvert »' : 'l\'email d\'activation'}.
                  </div>
                )}
              </div>
              <div>
                <label style={labelStyle}>Téléphone * <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: '#94a3b8' }}>(format tunisien)</span></label>
                <input type="tel" value={tel} disabled={controleEnCours} onChange={(e) => setTel(e.target.value)} onBlur={() => setTelTouched(true)} placeholder="20 123 456"
                  style={{ ...inputStyle, borderColor: telTouched && tel && !telValid ? '#fca5a5' : '#e2e8f0' }} />
                {telTouched && tel && !telValid && <div style={{ fontSize: 11, color: '#dc2626', marginTop: 4 }}>Format invalide — ex: 20 123 456 ou +216 20 123 456</div>}
              </div>
            </div>
          </div>

          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={sectionTitre}>👥 Gérants du cabinet <span style={sectionAide}>comptes pour ses collaborateurs, en plus du titulaire</span></div>
              <Counter label="Gérants achetés" sub="Facturés chaque mois ; leurs accès s'ouvriront à une prochaine étape" value={nbGerants} onChange={setNbGerants} min={0} max={NB_GERANTS_MAX} />
              <div>
                <label style={labelStyle}>Frais de mise en route (DT) *</label>
                <input type="number" min="0" value={miseEnRoute} onChange={(e) => { setMiseEnRoute(e.target.value); setMiseEnRouteTouchee(true); }} style={{ ...inputStyle, maxWidth: 200 }} />
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>Versement unique, proposé d'après la grille (menu Tarifs) ; 0 accepté.</div>
              </div>
              {apercu?.tarifManquant && (
                <div style={bannerDanger}>Le tarif « LabFlow Compta seul » vaut 0 DT : renseignez-le d'abord (menu Tarifs, section LabFlow Compta). Aucun cabinet ne peut être créé tant qu'il vaut 0.</div>
              )}
              {apercuErreur && <div style={bannerDanger}>{apercuErreur}</div>}
              {carteprix}
            </div>
          )}

          {step === 2 && (
            <div>
              <div style={{ fontSize: 13, color: '#374151', marginBottom: 14, lineHeight: 1.5 }}>
                Optionnel — promotions de lancement, appliquées dès la création, comme pour un client. Aucun mois n'est offert d'office.
              </div>
              {promos.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  {promos.map((p, i) => (
                    <div key={`${p.appliesTo}-${p.moisDebut}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '8px 12px', marginBottom: 6 }}>
                      <span style={{ flex: 1, fontSize: 12, color: '#166534' }}>✓ {promoLabel(p)}</span>
                      <button type="button" onClick={() => setPromos((l) => l.filter((_, j) => j !== i))} style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 5, padding: '2px 8px', fontSize: 11, cursor: 'pointer' }}>✕</button>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#78350f', marginBottom: 12 }}>Ajouter une promotion</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10, alignItems: 'start' }}>
                  <div>
                    <label style={labelStyle}>Appliqué à</label>
                    <select value={ciblesPromo.some((o) => o.value === promoForm.appliesTo) ? promoForm.appliesTo : 'mensualite'}
                      onChange={(e) => setPromoForm((f) => ({ ...f, appliesTo: e.target.value, moisDebut: '' }))} style={selectStyle}>
                      {ciblesPromo.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
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
                      <MonthPicker value={promoForm.moisDebut} onChange={(ym) => setPromoForm((f) => ({ ...f, moisDebut: ym }))} isDisabled={(ym) => ym < moisActuel || moisBloques.has(ym)} />
                    </div>
                  )}
                  {promoForm.type !== 'free_months' && (
                    <div>
                      <label style={labelStyle}>{promoForm.type === 'percent_off' ? 'Réduction (%)' : 'Montant fixe (DT)'}</label>
                      <input type="number" min="0" value={promoForm.type === 'percent_off' ? promoForm.discountVal : promoForm.fixedVal}
                        onChange={(e) => setPromoForm((f) => (f.type === 'percent_off' ? { ...f, discountVal: e.target.value } : { ...f, fixedVal: e.target.value }))} style={inputStyle} />
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
                <button type="button" onClick={ajouterPromo} style={{ padding: '7px 18px', borderRadius: 8, border: 'none', background: '#d97706', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>+ Ajouter</button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ background: 'linear-gradient(135deg,#f0f9ff 0%,#e0f2fe 100%)', border: '1px solid #bae6fd', borderRadius: 14, padding: '14px 18px' }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#0c4a6e', marginBottom: 10 }}>📋 Récapitulatif</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 12 }}>
                  {identite.raisonSociale && (
                    <div style={{ gridColumn: '1 / -1' }}><span style={{ color: '#64748b', fontWeight: 600 }}>🏢 Cabinet </span><strong>{identite.raisonSociale}</strong>{identite.matriculeFiscal ? ` · MF ${identite.matriculeFiscal}` : ''}</div>
                  )}
                  {(identite.adresse || identite.ville) && (
                    <div style={{ gridColumn: '1 / -1' }}><span style={{ color: '#64748b', fontWeight: 600 }}>📍 </span>{[identite.adresse, identite.ville].filter(Boolean).join(', ')}</div>
                  )}
                  <div><span style={{ color: '#64748b', fontWeight: 600 }}>👤 </span><strong>{nom}</strong></div>
                  <div><span style={{ color: '#64748b', fontWeight: 600 }}>📧 </span>{email}{rattache ? ' (compte existant, rattaché)' : ''}</div>
                  <div><span style={{ color: '#64748b', fontWeight: 600 }}>📱 </span>{tel}</div>
                  <div><span style={{ color: '#64748b', fontWeight: 600 }}>👥 Gérants </span><strong>{nbGerants}</strong></div>
                  {!(identite.raisonSociale && identite.matriculeFiscal && identite.adresse && identite.ville) && (
                    <div style={{ ...bannerWarn, gridColumn: '1 / -1', fontWeight: 500 }}>🪪 Identité à compléter : le cabinet sera créé, sa fiche restera marquée « Identité à compléter ».</div>
                  )}
                </div>
              </div>
              {carteprix}
              {promos.length > 0 && (
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#166534' }}>
                  🏷️ {promos.map(promoLabel).join(' · ')}
                  {premierMois != null && <div style={{ marginTop: 4, fontWeight: 700 }}>Mensualité de ce mois : {fmt(premierMois)}</div>}
                </div>
              )}
              <div style={{ background: '#fefce8', border: '1px solid #fde68a', borderRadius: 10, padding: '10px 14px', fontSize: 11, color: '#92400e', lineHeight: 1.7 }}>
                <div style={{ fontWeight: 700, color: '#713f12', marginBottom: 4 }}>📬 Ce qui sera envoyé au titulaire :</div>
                ✉️ Email de bienvenue avec 🔗 lien d'activation de LabFlow Compta (compta.labflow-tn.com, valable 48 h), tout de suite après la création
              </div>
            </div>
          )}

          {error && <div style={{ marginTop: 14, ...bannerDanger }}>{error}</div>}
        </div>

        <div style={{ padding: '16px 28px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <button type="button" onClick={step === 0 ? onClose : () => { setError(null); setStep((s) => s - 1); }}
            style={{ padding: '9px 22px', borderRadius: 9, border: '1px solid #e2e8f0', background: '#fff', color: '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            {step === 0 ? 'Annuler' : '← Retour'}
          </button>
          {step < 3 ? (
            // Clés distinctes : « Suivant » et « Créer » sont deux boutons, jamais le même nœud (un double clic sur
            // « Suivant » à l'étape Promotions ne doit pas créer le cabinet sans passer par le récapitulatif).
            <button key="suivant" type="button" onClick={next} disabled={nextDisabled}
              style={{ padding: '9px 28px', borderRadius: 9, border: 'none', background: nextDisabled ? '#e5e7eb' : 'linear-gradient(135deg,#4338ca,#6366f1)', color: nextDisabled ? '#9ca3af' : '#fff', fontSize: 13, fontWeight: 700, cursor: nextDisabled ? 'default' : 'pointer' }}>
              {step === 0 && (emailChecking || controleEnCours) ? 'Vérification…' : 'Suivant →'}
            </button>
          ) : (
            <button key="creer" type="button" onClick={creer} disabled={saving}
              style={{ padding: '9px 28px', borderRadius: 9, border: 'none', background: saving ? '#e5e7eb' : 'linear-gradient(135deg,#059669,#10b981)', color: saving ? '#9ca3af' : '#fff', fontSize: 13, fontWeight: 700, cursor: saving ? 'default' : 'pointer' }}>
              {saving ? 'Création en cours…' : "✓ Créer le cabinet & envoyer l'accès"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' };
const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, color: '#0f172a', outline: 'none', boxSizing: 'border-box', background: '#fff' };
const selectStyle: React.CSSProperties = { ...inputStyle, cursor: 'pointer' };
const sectionTitre: React.CSSProperties = { fontSize: 12.5, fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', borderBottom: '1px solid #f1f5f9', paddingBottom: 6 };
const sectionAide: React.CSSProperties = { fontSize: 11, fontWeight: 500, color: '#94a3b8' };
const bannerWarn: React.CSSProperties = { background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 8, padding: '8px 12px', fontSize: '0.78rem', color: '#92400e', fontWeight: 600 };
const bannerInfo: React.CSSProperties = { background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 8, padding: '8px 12px', fontSize: '0.76rem', color: '#3730a3', fontWeight: 600, lineHeight: 1.45 };
const bannerDanger: React.CSSProperties = { background: '#fee2e2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', fontSize: '0.78rem', color: '#dc2626', fontWeight: 600 };
