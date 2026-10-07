import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import api from '../api/client';
import { useConfirm } from '../components/common/ConfirmDialog';
import { libelleNiveau, useModuleCompta, type Niveau } from './comptables';
import { ChoixNiveau } from './ui';
import { bouton, inp, lbl, pastille, petit, rond } from './styles';

// LabFlow Compta, étape S3b (labflow-reprise/achats-compta/PLAN-S3b.md) : partie « Gérants Comptabilité » de la page
// Gérants de LabFlow, pour le titulaire d'un compte qui a le module Comptabilité. Son comptable (accès compris dans le
// module : désigné, modifié, retiré — il redevient « À désigner ») et ses gérants comptables supplémentaires (dans la
// limite achetée ; au-delà, une demande à l'équipe LabFlow). Rangée sous src/compta : vocabulaire comptable fixe, jamais
// traduit par le domaine du compte. Absente (rien d'affiché, aucun appel Compta) tant que le module n'est pas actif.
interface Comptable {
  id: number; obligatoire: boolean; etat: 'actif' | 'a_attribuer'; niveau: Niveau;
  nom: string | null; email: string | null; invitationEnAttente: boolean; invitationRenvoyable: boolean;
}
interface Etat {
  comptables: Comptable[];
  supplementaires: { utilises: number; limite: number };
  demandeEnCours: boolean;
  emailEnvoye?: boolean | null;
  nouvelle?: boolean;
}
// emailInitial : adresse de la personne à l'ouverture (vide = désignation), pour le titre et l'avertissement.
interface Formulaire { id: number | null; obligatoire: boolean; nom: string; email: string; emailInitial: string; niveau: Niveau }

// Ancre de la partie : le choix du type et l'arrivée depuis LabFlow Compta (« Gérer sur LabFlow ») y mènent.
export const ANCRE_COMPTA = 'gerants-comptabilite';

const statut = (err: unknown) => (err as { response?: { status?: number } })?.response?.status;
// Message d'un refus. Sur sa propre page, la lecture seule se dit au titulaire à la 2ᵉ personne.
const messageDe = (err: unknown, defaut: string) => {
  const r = (err as { response?: { data?: { message?: string; code?: string } } })?.response?.data;
  if (r?.code === 'READ_ONLY') return 'Votre abonnement attend un paiement : vos accès comptables ne sont pas modifiables pour le moment.';
  return r?.message || defaut;
};

// nouveauDepuisChoix : « + Nouveau … » → « Comptabilité » de la page Gérants.
export interface GerantsComptablesHandle { nouveauDepuisChoix: () => void }

interface Props {
  // La partie s'affiche-t-elle (module actif) ? Gardé dans une référence : un appelant peut passer une fonction en ligne.
  onEtat?: (actif: boolean) => void;
}

const GerantsComptables = forwardRef<GerantsComptablesHandle, Props>(function GerantsComptables({ onEtat }, ref) {
  const { confirm } = useConfirm();
  const module = useModuleCompta();
  const [etat, setEtat] = useState<Etat | null>(null);
  const [form, setForm] = useState<Formulaire | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');
  const [info, setInfo] = useState('');
  const [demande, setDemande] = useState<{ nombre: number } | null>(null);
  // Accès en cours de retrait ou de renvoi : ses boutons attendent la réponse (une requête à la fois, référence lue au
  // moment de l'action — jamais une valeur périmée).
  const [occupe, setOccupe] = useState<number | null>(null);
  const occupeRef = useRef<number | null>(null);
  const onEtatRef = useRef(onEtat);
  useEffect(() => { onEtatRef.current = onEtat; });
  const defile = useRef(false);

  const charger = useCallback(() => {
    api.get('/api/compta/mes-comptables')
      .then(({ data }) => { setEtat(data as Etat); onEtatRef.current?.(true); })
      .catch(() => { setEtat(null); onEtatRef.current?.(false); });
  }, []);

  // La partie Compta n'est lue que si le module est actif (aucun appel Compta pour un client Stock / Vente).
  useEffect(() => {
    if (!module) return;
    if (module.actif) charger();
    else onEtatRef.current?.(false);
  }, [module, charger]);

  // Arrivée depuis LabFlow Compta (« Gérer sur LabFlow » : adresse avec l'ancre) : la partie est amenée à l'écran.
  useEffect(() => {
    if (!etat || defile.current || window.location.hash !== `#${ANCRE_COMPTA}`) return;
    defile.current = true;
    // Après le rendu de la liste des gérants Stock / Vente, chargée en même temps (sinon le défilement est interrompu).
    window.setTimeout(() => document.getElementById(ANCRE_COMPTA)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 500);
  }, [etat]);

  const limiteAtteinte = !!etat && etat.supplementaires.utilises >= etat.supplementaires.limite;
  // Plafond d'une demande : 10 à la fois, sans dépasser le plafond du serveur.
  const maxDemande = Math.max(1, Math.min(10, (module?.nbGerantsMax ?? 50) - (module?.nbGerants ?? 0)));

  function ouvrir(c: Comptable) {
    setInfo('');
    setErreur('');
    setDemande(null);
    setForm({ id: c.id, obligatoire: c.obligatoire, nom: c.nom || '', email: c.email || '', emailInitial: c.email || '', niveau: c.niveau });
  }

  // Boutons de l'en-tête : un gérant comptable supplémentaire, ou la demande quand la limite est atteinte.
  function ajouter() {
    setInfo('');
    setErreur('');
    if (!etat) return;
    if (limiteAtteinte && etat.demandeEnCours) { setForm(null); setInfo('Votre demande de gérants comptables est en attente de validation par l\'équipe LabFlow.'); return; }
    if (limiteAtteinte) { setForm(null); setDemande({ nombre: 1 }); return; }
    setDemande(null);
    setForm({ id: null, obligatoire: false, nom: '', email: '', emailInitial: '', niveau: 'complet' });
  }

  // « Comptabilité » du choix du type : le comptable compris dans le module d'abord, tant qu'il est « À désigner »
  // (jamais une place achetée, ni une demande payante, à sa place).
  const nouveauDepuisChoix = () => {
    const aDesigner = etat?.comptables.find((c) => c.obligatoire && c.etat === 'a_attribuer');
    if (aDesigner) ouvrir(aDesigner);
    else ajouter();
  };
  useImperativeHandle(ref, () => ({ nouveauDepuisChoix }));

  if (!etat || !module?.actif) return null;
  const obligatoire = etat.comptables.find((c) => c.obligatoire) || null;
  const supplementaires = etat.comptables.filter((c) => !c.obligatoire);
  const compteurRouge = etat.supplementaires.limite > 0 && limiteAtteinte;

  const enregistrer = async (ev?: React.FormEvent) => {
    ev?.preventDefault();
    if (!form || envoi) return;
    if (!form.nom.trim() || !form.email.trim()) { setErreur('Nom et adresse email requis'); return; }
    setEnvoi(true);
    setErreur('');
    try {
      const corps = { nom: form.nom.trim(), email: form.email.trim(), niveau: form.niveau };
      const { data } = form.id
        ? await api.put(`/api/compta/mes-comptables/${form.id}`, corps)
        : await api.post('/api/compta/mes-comptables', corps);
      const e = data as Etat;
      setEtat(e);
      const adresse = corps.email.toLowerCase();
      if (e.emailEnvoye === false) {
        // L'accès est enregistré, l'email n'est pas parti : « Renvoyer » n'existe que pour une invitation renvoyable.
        const carte = e.comptables.find((c) => (c.email || '').toLowerCase() === adresse);
        setInfo('');
        setErreur(`Accès enregistré pour ${adresse}, mais l'email n'a pas pu partir. ${carte?.invitationRenvoyable ? 'Utilisez « Renvoyer » dans un instant.' : 'Prévenez la personne vous-même.'}`);
      } else if (e.nouvelle === true) setInfo(`Invitation envoyée à ${adresse} : la personne active son compte LabFlow Compta (lien valable 48 heures).`);
      else if (e.nouvelle === false) setInfo(`Accès ouvert à ${adresse} : cette adresse a déjà un compte, l'accès s'ajoute aux siens.`);
      else setInfo('Modifications enregistrées.');
      setForm(null);
    } catch (err) {
      // Accès disparu entre-temps (la personne l'a quitté) ou module désactivé : formulaire fermé, liste relue.
      if (statut(err) === 404) { setForm(null); charger(); }
      setErreur(messageDe(err, 'Enregistrement impossible, réessayez.'));
    } finally {
      setEnvoi(false);
    }
  };

  // Une action sur un accès à la fois (retrait, renvoi).
  const surAcces = async (c: Comptable, action: () => Promise<void>, defaut: string) => {
    if (occupeRef.current !== null) return;
    occupeRef.current = c.id;
    setOccupe(c.id);
    setErreur('');
    setInfo('');
    try {
      await action();
    } catch (err) {
      setErreur(messageDe(err, defaut));
      if ([404, 409].includes(statut(err) ?? 0)) charger();
    } finally {
      occupeRef.current = null;
      setOccupe(null);
    }
  };

  const retirer = async (c: Comptable) => {
    if (occupeRef.current !== null) return;
    const ok = await confirm({
      title: c.obligatoire ? 'Retirer votre comptable ?' : 'Retirer ce gérant comptable ?',
      message: c.etat === 'a_attribuer'
        ? 'Cet accès libéré sera supprimé.'
        : `${c.nom || c.email} n'aura plus accès à votre comptabilité. Aucun email ne le lui signale.${c.obligatoire ? ' L\'accès de votre comptable redevient « À désigner ».' : ''}`,
      tone: 'danger',
      confirmLabel: 'Retirer',
    });
    if (!ok) return;
    await surAcces(c, async () => {
      const { data } = await api.delete(`/api/compta/mes-comptables/${c.id}`);
      setEtat(data as Etat);
      setForm((f) => (f?.id === c.id ? null : f));
    }, 'Retrait impossible, réessayez.');
  };

  const renvoyer = (c: Comptable) => surAcces(c, async () => {
    await api.post(`/api/compta/mes-comptables/${c.id}/inviter`);
    setInfo(`Invitation renvoyée à ${c.email} (lien valable 48 heures).`);
  }, 'Envoi impossible, réessayez.');

  const envoyerDemande = async () => {
    if (!demande || envoi) return;
    setEnvoi(true);
    setErreur('');
    try {
      await api.post('/api/abonnements/support', { type: 'supplement', nbGerantsComptaSupp: demande.nombre });
      setDemande(null);
      setEtat((e) => (e ? { ...e, demandeEnCours: true } : e));
      setInfo('Demande envoyée à l\'équipe LabFlow. Dès sa validation, vous pourrez ajouter ces gérants comptables.');
    } catch (err) {
      setErreur(messageDe(err, 'Envoi impossible, réessayez.'));
    } finally {
      setEnvoi(false);
    }
  };

  const prix = module.prixGerant;
  return (
    <div id={ANCRE_COMPTA} style={{ marginTop: 28, scrollMarginTop: 80 }}>
      <div style={{ background: 'linear-gradient(135deg, #eef2ff, #e0e7ff)', border: '1px solid #c7d2fe', borderRadius: 14, padding: '14px 18px', marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ fontWeight: 900, fontSize: '1rem', color: '#312e81', margin: 0 }}>📒 Gérants Comptabilité</h2>
          <div style={{ fontSize: '0.78rem', color: '#4338ca', marginTop: 3 }}>Accès à votre comptabilité dans LabFlow Compta, et à elle seule</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ background: '#fff', border: `1px solid ${compteurRouge ? '#fecaca' : '#c7d2fe'}`, borderRadius: 10, padding: '6px 14px', textAlign: 'center' }}>
            <div style={{ fontSize: '0.62rem', fontWeight: 800, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Supplémentaires</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 900, color: compteurRouge ? '#dc2626' : '#3730a3' }}>
              {etat.supplementaires.utilises}<span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6b7280' }}> / {etat.supplementaires.limite}</span>
            </div>
          </div>
          {/* S3c (relecture) : une place libre s'ouvre même pendant une demande ; le badge s'ajoute au bouton. */}
          {etat.demandeEnCours && (
            <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '6px 12px', borderRadius: 20, background: '#fef9c3', color: '#854d0e' }}>⏳ Demande en cours</span>
          )}
          {!limiteAtteinte ? (
            <button type="button" onClick={ajouter} style={bouton('#4338ca', '#fff', '#4338ca')}>+ Gérant comptable</button>
          ) : !etat.demandeEnCours ? (
            <button type="button" onClick={ajouter} style={bouton('#fff', '#4338ca', '#4338ca')}>Demander des gérants comptables</button>
          ) : null}
        </div>
      </div>

      {info && <div role="status" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: '0.82rem', color: '#166534', fontWeight: 600 }}>{info}</div>}
      {erreur && !form && !demande && <div role="alert" style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: '0.82rem', color: '#dc2626' }}>{erreur}</div>}

      {form && (
        <form onSubmit={enregistrer} style={{ background: '#fff', borderRadius: 14, border: '1px solid #c7d2fe', padding: 18, marginBottom: 14, boxShadow: '0 4px 20px rgba(67,56,202,0.08)' }}>
          <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#312e81', marginBottom: 12 }}>
            {form.obligatoire ? (form.emailInitial ? '✏️ Votre comptable' : '👤 Désigner votre comptable') : form.emailInitial ? '✏️ Gérant comptable' : '👤 Nouveau gérant comptable'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', gap: 12, marginBottom: 12 }}>
            <div>
              <label htmlFor="gc-nom" style={lbl}>Nom *</label>
              <input id="gc-nom" value={form.nom} onChange={(e) => setForm((f) => (f ? { ...f, nom: e.target.value } : f))} style={inp} placeholder="Nom complet" maxLength={100} required autoFocus autoComplete="name" />
            </div>
            <div>
              <label htmlFor="gc-email" style={lbl}>Adresse email *</label>
              <input id="gc-email" type="email" value={form.email} onChange={(e) => setForm((f) => (f ? { ...f, email: e.target.value } : f))} style={inp} placeholder="comptable@exemple.tn" maxLength={255} required autoComplete="email" />
            </div>
          </div>
          <ChoixNiveau id="gc-niveau" valeur={form.niveau} onChange={(niveau) => setForm((f) => (f ? { ...f, niveau } : f))} />
          <div style={{ fontSize: '0.76rem', color: '#64748b', lineHeight: 1.5, marginBottom: 12 }}>
            Une adresse inconnue reçoit une invitation à activer son compte LabFlow Compta ; une adresse déjà connue reçoit l'accès tout de suite.
            {form.emailInitial ? ' Une autre adresse donne l\'accès à une autre personne : l\'actuelle le perd, sans en être prévenue.' : ''}
          </div>
          {erreur && <div role="alert" style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '9px 13px', fontSize: '0.82rem', color: '#dc2626', marginBottom: 12 }}>{erreur}</div>}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="submit" disabled={envoi} style={{ ...bouton('#4338ca', '#fff', '#4338ca'), flex: '2 1 200px', opacity: envoi ? 0.7 : 1 }}>
              {envoi ? 'Enregistrement…' : '✓ Enregistrer'}
            </button>
            <button type="button" onClick={() => { setForm(null); setErreur(''); }} style={{ ...bouton('#fff', '#374151', '#e2e8f0'), flex: '1 1 120px' }}>Annuler</button>
          </div>
        </form>
      )}

      {demande && (
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #c7d2fe', padding: 18, marginBottom: 14 }}>
          <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#312e81', marginBottom: 8 }}>Demander des gérants comptables</div>
          <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: 12, lineHeight: 1.5 }}>
            L'équipe LabFlow valide votre demande ; ces accès sont facturés{prix ? ` ${prix} DT par mois chacun,` : ''} à partir du mois suivant.
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
            <button type="button" aria-label="Un gérant comptable de moins" onClick={() => setDemande((d) => (d ? { nombre: Math.max(1, d.nombre - 1) } : d))} style={rond}>−</button>
            <span aria-live="polite" style={{ fontSize: '1.2rem', fontWeight: 900, minWidth: 24, textAlign: 'center' }}>{demande.nombre}</span>
            <button type="button" aria-label="Un gérant comptable de plus" onClick={() => setDemande((d) => (d ? { nombre: Math.min(maxDemande, d.nombre + 1) } : d))} disabled={demande.nombre >= maxDemande} style={rond}>+</button>
            {prix ? <span style={{ fontWeight: 700, color: '#4338ca' }}>+{(demande.nombre * prix).toFixed(0)} DT/mois</span> : null}
          </div>
          {erreur && <div role="alert" style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '9px 13px', fontSize: '0.82rem', color: '#dc2626', marginBottom: 12 }}>{erreur}</div>}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" onClick={envoyerDemande} disabled={envoi} style={{ ...bouton('#4338ca', '#fff', '#4338ca'), flex: '2 1 200px', opacity: envoi ? 0.7 : 1 }}>{envoi ? 'Envoi…' : 'Envoyer la demande'}</button>
            <button type="button" onClick={() => { setDemande(null); setErreur(''); }} style={{ ...bouton('#fff', '#374151', '#e2e8f0'), flex: '1 1 120px' }}>Annuler</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {obligatoire && <Carte c={obligatoire} titre="Votre comptable" occupe={occupe === obligatoire.id} onModifier={ouvrir} onRetirer={retirer} onRenvoyer={renvoyer} />}
        {supplementaires.map((c) => <Carte key={c.id} c={c} occupe={occupe === c.id} onModifier={ouvrir} onRetirer={retirer} onRenvoyer={renvoyer} />)}
        {supplementaires.length === 0 && etat.supplementaires.limite > 0 && (
          <div style={{ fontSize: '0.8rem', color: '#64748b', padding: '4px 2px' }}>
            Vous pouvez ajouter {etat.supplementaires.limite} gérant{etat.supplementaires.limite > 1 ? 's' : ''} comptable{etat.supplementaires.limite > 1 ? 's' : ''} en plus de votre comptable.
          </div>
        )}
      </div>
    </div>
  );
});

export default GerantsComptables;

function Carte({ c, titre, occupe, onModifier, onRetirer, onRenvoyer }: {
  c: Comptable; titre?: string; occupe: boolean;
  onModifier: (c: Comptable) => void; onRetirer: (c: Comptable) => void; onRenvoyer: (c: Comptable) => void;
}) {
  const vide = c.etat === 'a_attribuer';
  const qui = titre || c.nom || 'ce gérant comptable';
  return (
    <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e5e7eb', borderLeft: `4px solid ${vide ? '#f59e0b' : '#4338ca'}`, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
      <div style={{ flex: '1 1 220px', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
          <span style={{ fontWeight: 800, fontSize: '0.9rem', color: '#0f172a', overflowWrap: 'anywhere' }}>{titre ? `${titre}${!vide && c.nom ? ` — ${c.nom}` : ''}` : (c.nom || 'Gérant comptable')}</span>
          {titre && <span style={pastille('#eef2ff', '#3730a3')}>Compris dans le module</span>}
          {vide ? <span style={pastille('#fef3c7', '#92400e')}>À désigner</span> : <span style={pastille('#f1f5f9', '#334155')}>{libelleNiveau(c.niveau)}</span>}
          {!vide && (c.invitationEnAttente ? <span style={pastille('#fef3c7', '#92400e')}>⏳ Invitation envoyée</span> : <span style={pastille('#dcfce7', '#166534')}>● Actif</span>)}
        </div>
        <div style={{ fontSize: '0.8rem', color: '#6b7280', overflowWrap: 'anywhere' }}>
          {!vide ? `📧 ${c.email}` : c.obligatoire
            ? 'Indiquez le nom et l\'adresse email de votre comptable : il recevra son accès.'
            : 'Accès libéré (la personne n\'a plus de compte) : désignez quelqu\'un ou retirez-le.'}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        {vide ? (
          <>
            <button type="button" onClick={() => onModifier(c)} aria-label={`Désigner ${qui}`} style={bouton('#4338ca', '#fff', '#4338ca')}>Désigner</button>
            {!c.obligatoire && <button type="button" onClick={() => onRetirer(c)} disabled={occupe} aria-label="Retirer cet accès libéré" style={petit('#fff', '#be123c', '#fecdd3')}>🗑 Retirer</button>}
          </>
        ) : (
          <>
            {c.invitationRenvoyable && <button type="button" onClick={() => onRenvoyer(c)} disabled={occupe} aria-label={`Renvoyer l'invitation de ${c.nom || c.email}`} style={petit('#eef2ff', '#4338ca', '#c7d2fe')}>✉️ Renvoyer</button>}
            <button type="button" onClick={() => onModifier(c)} disabled={occupe} aria-label={`Modifier ${c.nom || c.email}`} style={petit('#f0f9ff', '#0369a1', '#bae6fd')}>✏️ Modifier</button>
            <button type="button" onClick={() => onRetirer(c)} disabled={occupe} aria-label={`Retirer ${c.nom || c.email}`} style={petit('#fff', '#be123c', '#fecdd3')}>🗑 Retirer</button>
          </>
        )}
      </div>
    </div>
  );
}

// Choix du type d'un nouveau gérant quand le module Comptabilité est actif (page Gérants, bouton « + Nouveau … »).
// `nomGerant` et `espaces` : mots du vocabulaire du compte, fournis par la page Gérants (le bouton qui ouvre ce choix est
// rendu avec eux).
export function ChoixTypeGerant({ stockVenteLibre, nomGerant, espaces, onStockVente, onComptabilite, onFermer }: {
  stockVenteLibre: boolean; nomGerant: string; espaces: string;
  onStockVente: () => void; onComptabilite: () => void; onFermer: () => void;
}) {
  return (
    <section aria-labelledby="choix-type-gerant" style={{ background: '#fff', borderRadius: 14, border: '1px solid #e5e7eb', padding: 16, marginBottom: 20, boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
      <div id="choix-type-gerant" style={{ fontWeight: 800, fontSize: '0.9rem', color: '#0f172a', marginBottom: 10 }}>Quel type de {nomGerant} ?</div>
      <div role="group" aria-labelledby="choix-type-gerant" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" onClick={onStockVente} disabled={!stockVenteLibre} autoFocus={stockVenteLibre}
          style={{ flex: '1 1 200px', textAlign: 'left', padding: '12px 14px', borderRadius: 12, border: '1.5px solid #bae6fd', background: stockVenteLibre ? '#f0f9ff' : '#f8fafc', cursor: stockVenteLibre ? 'pointer' : 'not-allowed', opacity: stockVenteLibre ? 1 : 0.6 }}>
          <div style={{ fontWeight: 800, color: '#0369a1' }}>📦 Stock / Vente</div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 3 }}>{stockVenteLibre ? `Un accès à vos ${espaces}` : '🔒 Limite atteinte'}</div>
        </button>
        <button type="button" onClick={onComptabilite} autoFocus={!stockVenteLibre}
          style={{ flex: '1 1 200px', textAlign: 'left', padding: '12px 14px', borderRadius: 12, border: '1.5px solid #c7d2fe', background: '#eef2ff', cursor: 'pointer' }}>
          <div style={{ fontWeight: 800, color: '#3730a3' }}>📒 Comptabilité</div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 3 }}>Un accès à votre comptabilité dans LabFlow Compta</div>
        </button>
      </div>
      <button type="button" onClick={onFermer} style={{ marginTop: 10, background: 'none', border: 'none', color: '#64748b', fontSize: '0.8rem', cursor: 'pointer', padding: 0 }}>Annuler</button>
    </section>
  );
}
