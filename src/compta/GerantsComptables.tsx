import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from 'react';
import api from '../api/client';
import { useConfirm } from '../components/common/ConfirmDialog';
import { NIVEAUX, libelleNiveau, type Niveau } from './comptables';

// LabFlow Compta, étape S3b (labflow-reprise/achats-compta/PLAN-S3b.md) : partie « Gérants Comptabilité » de la page
// Gérants de LabFlow, pour le titulaire d'un compte qui a le module Comptabilité. Son comptable (accès compris dans le
// module : désigné, modifié, retiré — il redevient « À désigner ») et ses gérants comptables supplémentaires (dans la
// limite achetée ; au-delà, une demande à l'équipe LabFlow). Rangée sous src/compta : vocabulaire comptable fixe, jamais
// traduit par le domaine du compte. Absente (rien d'affiché) tant que le module n'est pas actif.
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

const messageDe = (err: unknown, defaut: string) =>
  (err as { response?: { data?: { message?: string } } })?.response?.data?.message || defaut;
const statut = (err: unknown) => (err as { response?: { status?: number } })?.response?.status;

export interface GerantsComptablesHandle { nouveau: () => void }

interface Props {
  // Le module est-il actif (la partie s'affiche) ? Et la limite des supplémentaires est-elle atteinte ?
  onEtat?: (e: { actif: boolean; limiteAtteinte: boolean }) => void;
}

const GerantsComptables = forwardRef<GerantsComptablesHandle, Props>(function GerantsComptables({ onEtat }, ref) {
  const { confirm } = useConfirm();
  const [etat, setEtat] = useState<Etat | null>(null);
  const [form, setForm] = useState<Formulaire | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');
  const [info, setInfo] = useState('');
  const [demande, setDemande] = useState<{ nombre: number } | null>(null);
  const [prixGerant, setPrixGerant] = useState<number | null>(null);

  const appliquer = useCallback((e: Etat) => {
    setEtat(e);
    onEtat?.({ actif: true, limiteAtteinte: e.supplementaires.utilises >= e.supplementaires.limite });
  }, [onEtat]);

  const charger = useCallback(() => {
    api.get('/api/compta/mes-comptables')
      .then(({ data }) => appliquer(data as Etat))
      .catch(() => { setEtat(null); onEtat?.({ actif: false, limiteAtteinte: false }); });
  }, [appliquer, onEtat]);

  useEffect(() => {
    charger();
    api.get('/api/abonnements/module-compta')
      .then(({ data }) => setPrixGerant(Number((data as { prixGerant?: number }).prixGerant) || 0))
      .catch(() => { /* prix simplement absent */ });
  }, [charger]);

  const limiteAtteinte = !!etat && etat.supplementaires.utilises >= etat.supplementaires.limite;

  const nouveau = () => {
    setInfo('');
    setErreur('');
    if (!etat) return;
    if (limiteAtteinte && etat.demandeEnCours) { setForm(null); setInfo('Votre demande de gérants comptables est en attente de validation par l\'équipe LabFlow.'); return; }
    if (limiteAtteinte) { setForm(null); setDemande({ nombre: 1 }); return; }
    setDemande(null);
    setForm({ id: null, obligatoire: false, nom: '', email: '', emailInitial: '', niveau: 'complet' });
  };
  useImperativeHandle(ref, () => ({ nouveau }));

  if (!etat) return null;
  const obligatoire = etat.comptables.find((c) => c.obligatoire) || null;
  const supplementaires = etat.comptables.filter((c) => !c.obligatoire);

  const ouvrir = (c: Comptable) => {
    setInfo('');
    setErreur('');
    setDemande(null);
    setForm({ id: c.id, obligatoire: c.obligatoire, nom: c.nom || '', email: c.email || '', emailInitial: c.email || '', niveau: c.niveau });
  };

  const enregistrer = async () => {
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
      appliquer(e);
      if (e.nouvelle === true) setInfo(`Invitation envoyée à ${corps.email} : la personne active son compte LabFlow Compta (lien valable 48 heures).`);
      else if (e.nouvelle === false) setInfo(`Accès ouvert à ${corps.email.toLowerCase()} : cette adresse a déjà un compte, l'accès s'ajoute aux siens.`);
      else setInfo('Modifications enregistrées.');
      if (e.emailEnvoye === false) setInfo((i) => `${i} L'email n'a pas pu partir : utilisez « Renvoyer » plus tard.`);
      setForm(null);
    } catch (err) {
      if (statut(err) === 404) charger();
      setErreur(messageDe(err, 'Enregistrement impossible, réessayez.'));
    } finally {
      setEnvoi(false);
    }
  };

  const retirer = async (c: Comptable) => {
    const ok = await confirm({
      title: c.obligatoire ? 'Retirer votre comptable ?' : 'Retirer ce gérant comptable ?',
      message: c.obligatoire
        ? `${c.nom || c.email} n'aura plus accès à votre comptabilité. L'accès de votre comptable redevient « À désigner ».`
        : c.etat === 'a_attribuer' ? 'Cet accès libéré sera supprimé.' : `${c.nom || c.email} n'aura plus accès à votre comptabilité.`,
      tone: 'danger',
      confirmLabel: 'Retirer',
    });
    if (!ok) return;
    setErreur('');
    setInfo('');
    try {
      const { data } = await api.delete(`/api/compta/mes-comptables/${c.id}`);
      appliquer(data as Etat);
      if (form?.id === c.id) setForm(null);
    } catch (err) {
      setErreur(messageDe(err, 'Retrait impossible, réessayez.'));
    }
  };

  const renvoyer = async (c: Comptable) => {
    setErreur('');
    setInfo('');
    try {
      await api.post(`/api/compta/mes-comptables/${c.id}/inviter`);
      setInfo(`Invitation renvoyée à ${c.email} (lien valable 48 heures).`);
    } catch (err) {
      setErreur(messageDe(err, 'Envoi impossible, réessayez.'));
    }
  };

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

  return (
    <div id="gerants-comptabilite" style={{ marginTop: 28, scrollMarginTop: 80 }}>
      <div style={{ background: 'linear-gradient(135deg, #eef2ff, #e0e7ff)', border: '1px solid #c7d2fe', borderRadius: 14, padding: '14px 18px', marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 900, fontSize: '1rem', color: '#312e81' }}>📒 Gérants Comptabilité</div>
          <div style={{ fontSize: '0.78rem', color: '#4338ca', marginTop: 3 }}>Accès à votre comptabilité dans LabFlow Compta, et à elle seule</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ background: '#fff', border: `1px solid ${limiteAtteinte ? '#fecaca' : '#c7d2fe'}`, borderRadius: 10, padding: '6px 14px', textAlign: 'center' }}>
            <div style={{ fontSize: '0.62rem', fontWeight: 800, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Supplémentaires</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 900, color: limiteAtteinte ? '#dc2626' : '#3730a3' }}>
              {etat.supplementaires.utilises}<span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6b7280' }}> / {etat.supplementaires.limite}</span>
            </div>
          </div>
          {etat.demandeEnCours ? (
            <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '6px 12px', borderRadius: 20, background: '#fef9c3', color: '#854d0e' }}>⏳ Demande en cours</span>
          ) : limiteAtteinte ? (
            <button type="button" onClick={nouveau} style={bouton('#fff', '#4338ca', '#4338ca')}>Demander des gérants comptables</button>
          ) : (
            <button type="button" onClick={nouveau} style={bouton('#4338ca', '#fff', '#4338ca')}>+ Gérant comptable</button>
          )}
        </div>
      </div>

      {info && <div role="status" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: '0.82rem', color: '#166534', fontWeight: 600 }}>{info}</div>}
      {erreur && !form && !demande && <div role="alert" style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: '0.82rem', color: '#dc2626' }}>{erreur}</div>}

      {form && (
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #c7d2fe', padding: 18, marginBottom: 14, boxShadow: '0 4px 20px rgba(67,56,202,0.08)' }}>
          <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#312e81', marginBottom: 12 }}>
            {form.obligatoire ? (form.emailInitial ? '✏️ Votre comptable' : '👤 Désigner votre comptable') : form.emailInitial ? '✏️ Gérant comptable' : '👤 Nouveau gérant comptable'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 12 }}>
            <div>
              <label htmlFor="gc-nom" style={lbl}>Nom *</label>
              <input id="gc-nom" value={form.nom} onChange={(e) => setForm((f) => (f ? { ...f, nom: e.target.value } : f))} style={inp} placeholder="Nom complet" maxLength={100} />
            </div>
            <div>
              <label htmlFor="gc-email" style={lbl}>Adresse email *</label>
              <input id="gc-email" type="email" value={form.email} onChange={(e) => setForm((f) => (f ? { ...f, email: e.target.value } : f))} style={inp} placeholder="comptable@exemple.tn" maxLength={255} />
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={lbl}>Niveau</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {NIVEAUX.map((n) => (
                <button key={n.valeur} type="button" onClick={() => setForm((f) => (f ? { ...f, niveau: n.valeur } : f))} aria-pressed={form.niveau === n.valeur}
                  style={{ flex: '1 1 180px', textAlign: 'left', padding: '9px 12px', borderRadius: 10, cursor: 'pointer', border: `1.5px solid ${form.niveau === n.valeur ? '#4338ca' : '#e2e8f0'}`, background: form.niveau === n.valeur ? '#eef2ff' : '#fff' }}>
                  <div style={{ fontWeight: 800, fontSize: '0.82rem', color: form.niveau === n.valeur ? '#3730a3' : '#374151' }}>{form.niveau === n.valeur ? '✓ ' : ''}{n.libelle}</div>
                  <div style={{ fontSize: '0.72rem', color: '#6b7280', marginTop: 2 }}>{n.aide}</div>
                </button>
              ))}
            </div>
            <div style={{ fontSize: '0.72rem', color: '#6b7280', marginTop: 6 }}>Les niveaux prendront effet avec les dossiers et la saisie.</div>
          </div>
          <div style={{ fontSize: '0.76rem', color: '#64748b', lineHeight: 1.5, marginBottom: 12 }}>
            Une adresse inconnue reçoit une invitation à activer son compte LabFlow Compta ; une adresse déjà connue reçoit l'accès tout de suite.
            {form.emailInitial ? ' Une autre adresse donne l\'accès à une autre personne : l\'actuelle le perd.' : ''}
          </div>
          {erreur && <div role="alert" style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '9px 13px', fontSize: '0.82rem', color: '#dc2626', marginBottom: 12 }}>{erreur}</div>}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" onClick={enregistrer} disabled={envoi} style={{ ...bouton('#4338ca', '#fff', '#4338ca'), flex: '2 1 200px', opacity: envoi ? 0.7 : 1 }}>
              {envoi ? 'Enregistrement…' : '✓ Enregistrer'}
            </button>
            <button type="button" onClick={() => { setForm(null); setErreur(''); }} style={{ ...bouton('#fff', '#374151', '#e2e8f0'), flex: '1 1 120px' }}>Annuler</button>
          </div>
        </div>
      )}

      {demande && (
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #c7d2fe', padding: 18, marginBottom: 14 }}>
          <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#312e81', marginBottom: 8 }}>Demander des gérants comptables</div>
          <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: 12, lineHeight: 1.5 }}>
            L'équipe LabFlow valide votre demande ; ces accès sont facturés{prixGerant ? ` ${prixGerant.toFixed(2)} DT par mois chacun,` : ''} à partir du mois suivant.
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
            <button type="button" aria-label="Un de moins" onClick={() => setDemande((d) => (d ? { nombre: Math.max(1, d.nombre - 1) } : d))} style={rond}>−</button>
            <span style={{ fontSize: '1.2rem', fontWeight: 900, minWidth: 24, textAlign: 'center' }}>{demande.nombre}</span>
            <button type="button" aria-label="Un de plus" onClick={() => setDemande((d) => (d ? { nombre: Math.min(10, d.nombre + 1) } : d))} style={rond}>+</button>
            {prixGerant ? <span style={{ fontWeight: 700, color: '#4338ca' }}>+{(demande.nombre * prixGerant).toFixed(2)} DT/mois</span> : null}
          </div>
          {erreur && <div role="alert" style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '9px 13px', fontSize: '0.82rem', color: '#dc2626', marginBottom: 12 }}>{erreur}</div>}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" onClick={envoyerDemande} disabled={envoi} style={{ ...bouton('#4338ca', '#fff', '#4338ca'), flex: '2 1 200px', opacity: envoi ? 0.7 : 1 }}>{envoi ? 'Envoi…' : 'Envoyer la demande'}</button>
            <button type="button" onClick={() => { setDemande(null); setErreur(''); }} style={{ ...bouton('#fff', '#374151', '#e2e8f0'), flex: '1 1 120px' }}>Annuler</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {obligatoire && <Carte c={obligatoire} titre="Votre comptable" onModifier={ouvrir} onRetirer={retirer} onRenvoyer={renvoyer} />}
        {supplementaires.map((c) => <Carte key={c.id} c={c} onModifier={ouvrir} onRetirer={retirer} onRenvoyer={renvoyer} />)}
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

function Carte({ c, titre, onModifier, onRetirer, onRenvoyer }: {
  c: Comptable; titre?: string;
  onModifier: (c: Comptable) => void; onRetirer: (c: Comptable) => void; onRenvoyer: (c: Comptable) => void;
}) {
  const vide = c.etat === 'a_attribuer';
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
            <button type="button" onClick={() => onModifier(c)} style={bouton('#4338ca', '#fff', '#4338ca')}>Désigner</button>
            {!c.obligatoire && <button type="button" onClick={() => onRetirer(c)} style={petit('#fff', '#be123c', '#fecdd3')}>🗑 Retirer</button>}
          </>
        ) : (
          <>
            {c.invitationRenvoyable && <button type="button" onClick={() => onRenvoyer(c)} style={petit('#eef2ff', '#4338ca', '#c7d2fe')}>✉️ Renvoyer</button>}
            <button type="button" onClick={() => onModifier(c)} style={petit('#f0f9ff', '#0369a1', '#bae6fd')}>✏️ Modifier</button>
            <button type="button" onClick={() => onRetirer(c)} style={petit('#fff', '#be123c', '#fecdd3')}>🗑 Retirer</button>
          </>
        )}
      </div>
    </div>
  );
}

const bouton = (fond: string, texte: string, bord: string): React.CSSProperties => ({ padding: '8px 16px', borderRadius: 9, border: `1.5px solid ${bord}`, background: fond, color: texte, fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer' });
const petit = (fond: string, texte: string, bord: string): React.CSSProperties => ({ padding: '6px 12px', background: fond, border: `1px solid ${bord}`, borderRadius: 8, fontSize: '0.78rem', cursor: 'pointer', color: texte, fontWeight: 700 });
const pastille = (fond: string, texte: string): React.CSSProperties => ({ fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: fond, color: texte });
const rond: React.CSSProperties = { width: 32, height: 32, borderRadius: '50%', border: '1.5px solid #4338ca', background: '#fff', color: '#4338ca', fontSize: '1rem', cursor: 'pointer' };
const lbl: React.CSSProperties = { fontSize: '0.72rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' };
const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: '0.85rem', color: '#0f172a', outline: 'none', boxSizing: 'border-box', background: '#fff' };

// Choix du type d'un nouveau gérant quand le module Comptabilité est actif (page Gérants, bouton « + Nouveau … »).
export function ChoixTypeGerant({ stockVenteLibre, onStockVente, onComptabilite, onFermer }: {
  stockVenteLibre: boolean; onStockVente: () => void; onComptabilite: () => void; onFermer: () => void;
}) {
  return (
    <div role="dialog" aria-label="Type du nouveau gérant" style={{ background: '#fff', borderRadius: 14, border: '1px solid #e5e7eb', padding: 16, marginBottom: 20, boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
      <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#0f172a', marginBottom: 10 }}>Quel type de gérant ?</div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" onClick={onStockVente} disabled={!stockVenteLibre}
          style={{ flex: '1 1 200px', textAlign: 'left', padding: '12px 14px', borderRadius: 12, border: '1.5px solid #bae6fd', background: stockVenteLibre ? '#f0f9ff' : '#f8fafc', cursor: stockVenteLibre ? 'pointer' : 'not-allowed', opacity: stockVenteLibre ? 1 : 0.6 }}>
          <div style={{ fontWeight: 800, color: '#0369a1' }}>📦 Stock / Vente</div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 3 }}>{stockVenteLibre ? 'Un collaborateur de vos sites' : '🔒 Limite atteinte'}</div>
        </button>
        <button type="button" onClick={onComptabilite}
          style={{ flex: '1 1 200px', textAlign: 'left', padding: '12px 14px', borderRadius: 12, border: '1.5px solid #c7d2fe', background: '#eef2ff', cursor: 'pointer' }}>
          <div style={{ fontWeight: 800, color: '#3730a3' }}>📒 Comptabilité</div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 3 }}>Un accès à votre comptabilité dans LabFlow Compta</div>
        </button>
      </div>
      <button type="button" onClick={onFermer} style={{ marginTop: 10, background: 'none', border: 'none', color: '#64748b', fontSize: '0.8rem', cursor: 'pointer', padding: 0 }}>Annuler</button>
    </div>
  );
}
