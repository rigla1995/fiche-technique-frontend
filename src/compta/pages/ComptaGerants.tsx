import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../../api/client';
import { useConfirm } from '../../components/common/ConfirmDialog';
import { useNotifications } from '../../context/NotificationContext';
import BoutonAide from '../BoutonAide';
import { libelleNiveau, type Niveau } from '../comptables';
import { ChoixNiveau } from '../ui';
import { bouton, inp, lbl, pastille, petit, rond } from '../styles';

// « Mes gérants » (LabFlow Compta, étape S3c ; labflow-reprise/achats-compta/PLAN-S3c.md) : le titulaire du cabinet
// ouvre des accès à ses collaborateurs, dans la limite achetée — ajouter (nom, adresse, niveau), modifier, désactiver
// (la place reste comptée), réactiver, retirer (la place est libérée), renvoyer l'invitation ; au-delà, une demande à
// l'équipe LabFlow. Réponses du client du 07/10 : le titulaire gère son équipe ; désactiver et retirer restent possibles
// en lecture seule ; aucun email à la personne qui perd son accès.
interface Gerant {
  id: number; etat: 'actif' | 'a_attribuer' | 'desactive'; niveau: Niveau;
  nom: string | null; email: string | null; invitationEnAttente: boolean; invitationRenvoyable: boolean;
}
interface Etat {
  gerants: Gerant[];
  places: { utilisees: number; limite: number };
  demandeEnCours: boolean;
  prixGerant: number;
  nbGerantsMax: number;
  etatAbonnement: 'actif' | 'lecture_seule' | 'bloque' | 'suspendu';
  emailEnvoye?: boolean | null;
  nouvelle?: boolean;
}
// emailInitial : adresse de la personne à l'ouverture (vide = nouvel accès), pour le titre et l'avertissement.
interface Formulaire { id: number | null; nom: string; email: string; emailInitial: string; niveau: Niveau }

const statut = (err: unknown) => (err as { response?: { status?: number } })?.response?.status;
const messageDe = (err: unknown, defaut: string) => {
  const r = (err as { response?: { data?: { message?: string; code?: string } } })?.response?.data;
  if (r?.code === 'READ_ONLY') return 'Votre abonnement attend un paiement : vos gérants ne peuvent être ni ajoutés, ni modifiés, ni réactivés pour le moment.';
  if (r?.code === 'BLOCKED' || r?.code === 'SUSPENDED') return 'Votre abonnement est suspendu : vos gérants ne peuvent être ni ajoutés, ni modifiés, ni réactivés pour le moment.';
  return r?.message || defaut;
};

export default function ComptaGerants() {
  const { confirm } = useConfirm();
  const [etat, setEtat] = useState<Etat | null>(null);
  const [chargement, setChargement] = useState<'en_cours' | 'pret' | 'erreur'>('en_cours');
  const [form, setForm] = useState<Formulaire | null>(null);
  const [demande, setDemande] = useState<{ nombre: number } | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');
  const [info, setInfo] = useState('');
  // Accès en cours d'action (désactiver, réactiver, retirer, renvoyer) : une requête à la fois, référence lue au moment
  // de l'action (jamais une valeur périmée).
  const [occupe, setOccupe] = useState<number | null>(null);
  const occupeRef = useRef<number | null>(null);

  const charger = useCallback(() => {
    api.get('/api/compta/cabinet/gerants')
      .then(({ data }) => { setEtat(data as Etat); setChargement('pret'); })
      .catch(() => setChargement('erreur'));
  }, []);
  useEffect(() => { charger(); }, [charger]);
  // La réponse de l'équipe LabFlow à une demande arrive dans la cloche : la page se relit aussitôt (places, demande).
  const { notifications } = useNotifications();
  const derniereReponse = notifications.find((n) => n.eventType === 'demande_traitee')?.id;
  useEffect(() => { if (derniereReponse) charger(); }, [derniereReponse, charger]);

  const limiteAtteinte = !!etat && etat.places.utilisees >= etat.places.limite;
  // Plafond d'une demande : 10 à la fois, sans dépasser le plafond du serveur.
  const maxDemande = etat ? Math.max(1, Math.min(10, etat.nbGerantsMax - etat.places.limite)) : 1;
  const abonnementOuvert = etat?.etatAbonnement === 'actif';

  const effacer = () => { setInfo(''); setErreur(''); };

  function ajouter() {
    effacer();
    if (!etat) return;
    if (limiteAtteinte) { setForm(null); setDemande({ nombre: 1 }); return; }
    setDemande(null);
    setForm({ id: null, nom: '', email: '', emailInitial: '', niveau: 'complet' });
  }

  function ouvrir(g: Gerant) {
    effacer();
    setDemande(null);
    setForm({ id: g.id, nom: g.nom || '', email: g.email || '', emailInitial: g.email || '', niveau: g.niveau });
  }

  const enregistrer = async (ev?: React.FormEvent) => {
    ev?.preventDefault();
    if (!form || envoi) return;
    if (!form.nom.trim() || !form.email.trim()) { setErreur('Nom et adresse email requis'); return; }
    setEnvoi(true);
    setErreur('');
    try {
      const corps = { nom: form.nom.trim(), email: form.email.trim(), niveau: form.niveau };
      const { data } = form.id
        ? await api.put(`/api/compta/cabinet/gerants/${form.id}`, corps)
        : await api.post('/api/compta/cabinet/gerants', corps);
      const e = data as Etat;
      setEtat(e);
      const adresse = corps.email.toLowerCase();
      if (e.emailEnvoye === false) {
        // L'accès est enregistré, l'email n'est pas parti : « Renvoyer » n'existe que pour une invitation renvoyable.
        const carte = e.gerants.find((g) => (g.email || '').toLowerCase() === adresse);
        setInfo('');
        setErreur(`Accès enregistré pour ${adresse}, mais l'email n'a pas pu partir. ${carte?.invitationRenvoyable ? 'Utilisez « Renvoyer » dans un instant.' : 'Prévenez la personne vous-même.'}`);
      } else if (e.nouvelle === true) setInfo(`Invitation envoyée à ${adresse} : la personne active son compte LabFlow Compta (lien valable 48 heures).`);
      else if (e.nouvelle === false) setInfo(`Accès ouvert à ${adresse} : cette adresse a déjà un compte, l'accès s'ajoute aux siens.`);
      else setInfo('Modifications enregistrées.');
      setForm(null);
    } catch (err) {
      // Accès disparu entre-temps, ou désactivé : formulaire fermé, liste relue.
      if ([404, 409].includes(statut(err) ?? 0) && form.id) { setForm(null); charger(); }
      setErreur(messageDe(err, 'Enregistrement impossible, réessayez.'));
    } finally {
      setEnvoi(false);
    }
  };

  // Une action sur un accès à la fois.
  const surAcces = async (g: Gerant, action: () => Promise<void>, defaut: string) => {
    if (occupeRef.current !== null) return;
    occupeRef.current = g.id;
    setOccupe(g.id);
    effacer();
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
  const qui = (g: Gerant) => g.nom || g.email || 'Ce gérant';

  const desactiver = async (g: Gerant) => {
    if (occupeRef.current !== null) return;
    const ok = await confirm({
      title: 'Désactiver ce gérant ?',
      message: `${qui(g)} ne verra plus votre cabinet. Sa fiche est gardée et sa place reste comptée : vous pourrez le réactiver. Aucun email ne le lui signale.`,
      tone: 'primary',
      confirmLabel: 'Désactiver',
    });
    if (!ok) return;
    await surAcces(g, async () => {
      const { data } = await api.post(`/api/compta/cabinet/gerants/${g.id}/desactiver`);
      setEtat(data as Etat);
      setForm((f) => (f?.id === g.id ? null : f));
    }, 'Désactivation impossible, réessayez.');
  };

  const reactiver = (g: Gerant) => surAcces(g, async () => {
    const { data } = await api.post(`/api/compta/cabinet/gerants/${g.id}/reactiver`);
    setEtat(data as Etat);
    setInfo(`${qui(g)} retrouve son accès à votre cabinet.`);
  }, 'Réactivation impossible, réessayez.');

  const retirer = async (g: Gerant) => {
    if (occupeRef.current !== null) return;
    const ok = await confirm({
      title: 'Retirer ce gérant ?',
      message: g.etat === 'a_attribuer'
        ? 'Cet accès libéré sera supprimé et sa place libérée.'
        : `${qui(g)} n'aura plus accès à votre cabinet et sa place sera libérée. Aucun email ne le lui signale.`,
      tone: 'danger',
      confirmLabel: 'Retirer',
    });
    if (!ok) return;
    await surAcces(g, async () => {
      const { data } = await api.delete(`/api/compta/cabinet/gerants/${g.id}`);
      setEtat(data as Etat);
      setForm((f) => (f?.id === g.id ? null : f));
    }, 'Retrait impossible, réessayez.');
  };

  const renvoyer = (g: Gerant) => surAcces(g, async () => {
    await api.post(`/api/compta/cabinet/gerants/${g.id}/inviter`);
    setInfo(`Invitation renvoyée à ${g.email} (lien valable 48 heures).`);
  }, 'Envoi impossible, réessayez.');

  const envoyerDemande = async () => {
    if (!demande || envoi) return;
    setEnvoi(true);
    setErreur('');
    try {
      const { data } = await api.post('/api/compta/cabinet/demande-gerants', { nombre: demande.nombre });
      setEtat(data as Etat);
      setDemande(null);
      setInfo('Demande envoyée à l\'équipe LabFlow. Dès sa validation, vous pourrez ouvrir ces nouveaux accès.');
    } catch (err) {
      if (statut(err) === 409) { setDemande(null); charger(); }
      setErreur(messageDe(err, 'Envoi impossible, réessayez.'));
    } finally {
      setEnvoi(false);
    }
  };

  const compteurRouge = !!etat && etat.places.limite > 0 && limiteAtteinte;
  const prix = etat?.prixGerant || 0;

  return (
    <div className="page">
      <div style={{
        background: 'linear-gradient(135deg, #1e1b4b 0%, #4338ca 55%, #7c3aed 100%)', borderRadius: 18, padding: '24px 28px',
        marginBottom: 24, boxShadow: '0 8px 32px rgba(67,56,202,0.28)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>👥</div>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>Mes gérants</h1>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.85rem', margin: 0 }}>Les accès de vos collaborateurs à votre cabinet</p>
        </div>
        <BoutonAide section="compta-gerants" />
      </div>

      {chargement === 'en_cours' && <div className="loading-text">Chargement…</div>}
      {chargement === 'erreur' && <div role="alert" style={alerte}>Impossible de charger vos gérants. Réessayez plus tard.</div>}

      {etat && (
        <>
          {!abonnementOuvert && (
            <div role="status" style={{ ...alerte, background: '#fffbeb', borderColor: '#fde68a', color: '#92400e', marginBottom: 16 }}>
              {etat.etatAbonnement === 'lecture_seule' ? 'Votre abonnement attend un paiement' : 'Votre abonnement est suspendu'} : vous ne pouvez
              ni ajouter, ni modifier, ni réactiver de gérant, ni en demander. Désactiver et retirer un gérant restent possibles.
            </div>
          )}

          <div style={{ background: 'linear-gradient(135deg, #eef2ff, #e0e7ff)', border: '1px solid #c7d2fe', borderRadius: 14, padding: '14px 18px', marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0 }}>
              <h2 style={{ fontWeight: 900, fontSize: '1rem', color: '#312e81', margin: 0 }}>Vos gérants</h2>
              <div style={{ fontSize: '0.78rem', color: '#4338ca', marginTop: 3 }}>Un gérant désactivé garde sa place</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ background: '#fff', border: `1px solid ${compteurRouge ? '#fecaca' : '#c7d2fe'}`, borderRadius: 10, padding: '6px 14px', textAlign: 'center' }}>
                <div style={{ fontSize: '0.62rem', fontWeight: 800, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Places</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 900, color: compteurRouge ? '#dc2626' : '#3730a3' }}>
                  {etat.places.utilisees}<span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6b7280' }}> / {etat.places.limite}</span>
                </div>
              </div>
              {etat.demandeEnCours ? (
                <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '6px 12px', borderRadius: 20, background: '#fef9c3', color: '#854d0e' }}>⏳ Demande en cours</span>
              ) : limiteAtteinte ? (
                <button type="button" onClick={ajouter} style={bouton('#fff', '#4338ca', '#4338ca')}>Demander des gérants</button>
              ) : (
                <button type="button" onClick={ajouter} style={bouton('#4338ca', '#fff', '#4338ca')}>+ Gérant</button>
              )}
            </div>
          </div>

          {info && <div role="status" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: '0.82rem', color: '#166534', fontWeight: 600 }}>{info}</div>}
          {erreur && !form && !demande && <div role="alert" style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: '0.82rem', color: '#dc2626' }}>{erreur}</div>}

          {form && (
            <form onSubmit={enregistrer} style={{ background: '#fff', borderRadius: 14, border: '1px solid #c7d2fe', padding: 18, marginBottom: 14, boxShadow: '0 4px 20px rgba(67,56,202,0.08)' }}>
              <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#312e81', marginBottom: 12 }}>
                {form.emailInitial ? '✏️ Gérant' : '👤 Nouveau gérant'}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', gap: 12, marginBottom: 12 }}>
                <div>
                  <label htmlFor="gcab-nom" style={lbl}>Nom *</label>
                  <input id="gcab-nom" value={form.nom} onChange={(e) => setForm((f) => (f ? { ...f, nom: e.target.value } : f))} style={inp} placeholder="Nom complet" maxLength={100} required autoFocus autoComplete="name" />
                </div>
                <div>
                  <label htmlFor="gcab-email" style={lbl}>Adresse email *</label>
                  <input id="gcab-email" type="email" value={form.email} onChange={(e) => setForm((f) => (f ? { ...f, email: e.target.value } : f))} style={inp} placeholder="collaborateur@exemple.tn" maxLength={255} required autoComplete="email" />
                </div>
              </div>
              <ChoixNiveau id="gcab-niveau" valeur={form.niveau} onChange={(niveau) => setForm((f) => (f ? { ...f, niveau } : f))} />
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
              <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#312e81', marginBottom: 8 }}>Demander des gérants</div>
              <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: 12, lineHeight: 1.5 }}>
                L'équipe LabFlow valide votre demande ; ces gérants sont facturés{prix ? ` ${prix} DT par mois chacun,` : ''} à partir du mois suivant.
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                <button type="button" aria-label="Un gérant de moins" onClick={() => setDemande((d) => (d ? { nombre: Math.max(1, d.nombre - 1) } : d))} disabled={demande.nombre <= 1} style={rond}>−</button>
                <span aria-live="polite" style={{ fontSize: '1.2rem', fontWeight: 900, minWidth: 24, textAlign: 'center' }}>{demande.nombre}</span>
                <button type="button" aria-label="Un gérant de plus" onClick={() => setDemande((d) => (d ? { nombre: Math.min(maxDemande, d.nombre + 1) } : d))} disabled={demande.nombre >= maxDemande} style={rond}>+</button>
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
            {etat.gerants.map((g) => (
              <CarteGerant key={g.id} g={g} occupe={occupe === g.id} onModifier={ouvrir} onDesactiver={desactiver} onReactiver={reactiver} onRetirer={retirer} onRenvoyer={renvoyer} />
            ))}
            {etat.gerants.length === 0 && (
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '22px 20px', textAlign: 'center', fontSize: '0.86rem', color: '#64748b', lineHeight: 1.6 }}>
                {etat.places.limite > 0
                  ? `Vous pouvez ouvrir ${etat.places.limite} accès à vos collaborateurs : cliquez sur « + Gérant ».`
                  : 'Aucun gérant n\'est prévu dans votre abonnement : cliquez sur « Demander des gérants ».'}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function CarteGerant({ g, occupe, onModifier, onDesactiver, onReactiver, onRetirer, onRenvoyer }: {
  g: Gerant; occupe: boolean;
  onModifier: (g: Gerant) => void; onDesactiver: (g: Gerant) => void; onReactiver: (g: Gerant) => void;
  onRetirer: (g: Gerant) => void; onRenvoyer: (g: Gerant) => void;
}) {
  const vide = g.etat === 'a_attribuer';
  const desactive = g.etat === 'desactive';
  const nom = g.nom || g.email || 'ce gérant';
  return (
    <div style={{ background: desactive ? '#f8fafc' : '#fff', borderRadius: 14, border: '1px solid #e5e7eb', borderLeft: `4px solid ${vide ? '#f59e0b' : desactive ? '#94a3b8' : '#4338ca'}`, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
      <div style={{ flex: '1 1 220px', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
          <span style={{ fontWeight: 800, fontSize: '0.9rem', color: desactive ? '#64748b' : '#0f172a', overflowWrap: 'anywhere' }}>{vide ? 'Accès libéré' : (g.nom || 'Gérant')}</span>
          {!vide && <span style={pastille('#f1f5f9', '#334155')}>{libelleNiveau(g.niveau)}</span>}
          {vide ? <span style={pastille('#fef3c7', '#92400e')}>À désigner</span>
            : desactive ? <span style={pastille('#e2e8f0', '#475569')}>⏸ Désactivé</span>
            : g.invitationEnAttente ? <span style={pastille('#fef3c7', '#92400e')}>⏳ Invitation envoyée</span>
            : <span style={pastille('#dcfce7', '#166534')}>● Actif</span>}
        </div>
        <div style={{ fontSize: '0.8rem', color: '#6b7280', overflowWrap: 'anywhere' }}>
          {vide ? 'La personne n\'a plus de compte : désignez quelqu\'un ou retirez cet accès.' : `📧 ${g.email}`}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        {vide ? (
          <button type="button" onClick={() => onModifier(g)} disabled={occupe} aria-label="Désigner une personne pour cet accès" style={petit('#eef2ff', '#4338ca', '#c7d2fe')}>Désigner</button>
        ) : desactive ? (
          <button type="button" onClick={() => onReactiver(g)} disabled={occupe} aria-label={`Réactiver ${nom}`} style={petit('#eef2ff', '#4338ca', '#c7d2fe')}>▶ Réactiver</button>
        ) : (
          <>
            {g.invitationRenvoyable && <button type="button" onClick={() => onRenvoyer(g)} disabled={occupe} aria-label={`Renvoyer l'invitation de ${nom}`} style={petit('#eef2ff', '#4338ca', '#c7d2fe')}>✉️ Renvoyer</button>}
            <button type="button" onClick={() => onModifier(g)} disabled={occupe} aria-label={`Modifier ${nom}`} style={petit('#f0f9ff', '#0369a1', '#bae6fd')}>✏️ Modifier</button>
            <button type="button" onClick={() => onDesactiver(g)} disabled={occupe} aria-label={`Désactiver ${nom}`} style={petit('#fff', '#475569', '#cbd5e1')}>⏸ Désactiver</button>
          </>
        )}
        <button type="button" onClick={() => onRetirer(g)} disabled={occupe} aria-label={vide ? 'Retirer cet accès libéré' : `Retirer ${nom}`} style={petit('#fff', '#be123c', '#fecdd3')}>🗑 Retirer</button>
      </div>
    </div>
  );
}

const alerte: React.CSSProperties = { background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 12, padding: '14px 18px', fontWeight: 600, fontSize: '0.86rem' };
