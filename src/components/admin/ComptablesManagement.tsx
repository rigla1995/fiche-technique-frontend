import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client';
import type { PosteCompta } from '../../types';
import type { IdentiteLegale } from '../../utils/identiteLegale';
import { libelleForme } from '../../utils/identiteLegale';
import { useConfirm } from '../common/ConfirmDialog';
import Pagination from '../common/Pagination';
import Counter from './Counter';
import IdentiteClientModal from './IdentiteClientModal';
import NouveauComptableModal from './NouveauComptableModal';

// Page « Comptables » de l'admin (LabFlow Compta, étape S2b) : les cabinets comptables abonnés à LabFlow Compta, en
// cartes comme les clients. Création par l'assistant « Nouveau comptable », identité, gérants achetés, renvoi de
// l'invitation, suppression (refusée dès qu'une comptabilité a un dossier, étape S4). Paiements, promotions et mode du
// compte : page Abonnements (décision du client du 06/10), ouverte sur le cabinet par « Abonnement ».

interface Cabinet {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  activatedAt: string | null;
  createdAt: string;
  entreprise: Partial<IdentiteLegale>;
  nomAffiche: string;
  identiteComplete: boolean;
  espace: { id: number; nom: string; etat: string };
  // Étape S4a : dossiers du cabinet (archivés compris) ; un cabinet qui en a ne se supprime plus (D10).
  nbDossiers?: number;
  abonnement: {
    id: number;
    modeCompte: string;
    inviteSent: boolean;
    dateDebut: string;
    statutOnboarding: string;
    montantOnboarding: number | null;
    nbGerants: number;
    // Étape S3c : accès de collaborateurs en place (désactivés compris) ; les gérants achetés ne descendent pas en dessous.
    gerantsEnPlace?: number;
    postes: PosteCompta[];
    totalMensuel: number;
  } | null;
}

const PER_PAGE = 12;
const fmt = (n: number) => `${n.toLocaleString('fr-FR')} DT`;
const messageDe = (err: unknown, defaut: string) =>
  (err as { response?: { data?: { message?: string } } })?.response?.data?.message || defaut;
const MODES: Record<string, { label: string; couleur: string; fond: string }> = {
  actif: { label: 'Actif', couleur: '#047857', fond: '#ecfdf5' },
  read_only: { label: 'Lecture seule', couleur: '#b45309', fond: '#fffbeb' },
  desactive: { label: 'Désactivé', couleur: '#b91c1c', fond: '#fef2f2' },
  bloque: { label: 'Bloqué', couleur: '#b91c1c', fond: '#fef2f2' },
  archive: { label: 'Archivé', couleur: '#475569', fond: '#f1f5f9' },
};
const STATUTS_MER: Record<string, string> = { 'payé': 'payés', impayé: 'impayés', gratuit: 'offerts', en_attente: 'en attente' };

export default function ComptablesManagement() {
  const navigate = useNavigate();
  const { confirm, alerte } = useConfirm();
  const [cabinets, setCabinets] = useState<Cabinet[]>([]);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [recherche, setRecherche] = useState('');
  const [page, setPage] = useState(1);
  const [nouveau, setNouveau] = useState(false);
  const [consulte, setConsulte] = useState<Cabinet | null>(null);
  const [identite, setIdentite] = useState<Cabinet | null>(null);
  const [gerants, setGerants] = useState<{ cabinet: Cabinet; nb: number; enCours: boolean; erreur: string | null } | null>(null);
  const [envoiId, setEnvoiId] = useState<number | null>(null);
  const [suppressionId, setSuppressionId] = useState<number | null>(null);

  const charger = () => {
    setLoading(true);
    setErreur(null);
    api.get('/admin/comptables')
      .then(({ data }) => setCabinets(data as Cabinet[]))
      .catch((err) => setErreur(messageDe(err, 'Impossible de charger les cabinets.')))
      .finally(() => setLoading(false));
  };
  useEffect(charger, []);

  const filtres = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (!q) return cabinets;
    return cabinets.filter((c) => `${c.nomAffiche} ${c.name} ${c.email} ${c.phone || ''} ${c.entreprise?.matriculeFiscal || ''}`.toLowerCase().includes(q));
  }, [cabinets, recherche]);
  const pages = Math.max(1, Math.ceil(filtres.length / PER_PAGE));
  const pageSure = Math.min(page, pages);
  const visibles = filtres.slice((pageSure - 1) * PER_PAGE, pageSure * PER_PAGE);
  const actives = cabinets.filter((c) => c.activatedAt).length;

  const renvoyer = async (c: Cabinet) => {
    setEnvoiId(c.id);
    try {
      await api.post(`/admin/comptables/${c.id}/invitation`);
      await alerte({ title: 'Invitation envoyée', message: `Lien d'activation de LabFlow Compta renvoyé à ${c.email}`, tone: 'primary', icon: '✉️' });
      charger();
    } catch (err) {
      alerte({ title: 'Envoi impossible', message: messageDe(err, "Erreur lors de l'envoi"), tone: 'danger' });
    } finally {
      setEnvoiId(null);
    }
  };

  const supprimer = async (c: Cabinet) => {
    const ok = await confirm({
      title: `Supprimer le cabinet « ${c.nomAffiche} » ?`,
      message: 'Le compte du titulaire, son abonnement, ses mensualités et sa comptabilité de cabinet sont supprimés.',
      details: [
        'Refusée dès qu\'une mensualité est réglée (sa facture a été émise) ou dès que le cabinet a un dossier (rien de comptable ne disparaît) : archivez-le plutôt.',
        'Le journal des événements du cabinet est conservé.',
      ],
      tone: 'danger',
      confirmLabel: 'Supprimer',
    });
    if (!ok) return;
    setSuppressionId(c.id);
    try {
      await api.delete(`/admin/comptables/${c.id}`);
      charger();
    } catch (err) {
      alerte({ title: 'Suppression impossible', message: messageDe(err, 'Erreur lors de la suppression'), tone: 'danger' });
    } finally {
      setSuppressionId(null);
    }
  };

  const enregistrerGerants = async () => {
    if (!gerants) return;
    setGerants({ ...gerants, enCours: true, erreur: null });
    try {
      await api.put(`/admin/comptables/${gerants.cabinet.id}/gerants`, { nbGerants: gerants.nb });
      setGerants(null);
      charger();
    } catch (err) {
      setGerants((g) => (g ? { ...g, enCours: false, erreur: messageDe(err, "L'enregistrement a échoué.") } : g));
    }
  };

  return (
    <>
      {nouveau && <NouveauComptableModal onClose={() => setNouveau(false)} onCreated={charger} />}
      {identite && (
        <IdentiteClientModal<Cabinet>
          cabinet
          client={{ id: identite.id, name: identite.name, nomAffiche: identite.nomAffiche, entreprise: identite.entreprise }}
          onClose={() => setIdentite(null)}
          onSaved={() => charger()}
        />
      )}

      <div className="page">
        <div style={{
          background: 'linear-gradient(135deg, #1e1b4b 0%, #4338ca 55%, #7c3aed 100%)',
          borderRadius: 18, padding: '20px 24px', marginBottom: 18, boxShadow: '0 8px 32px rgba(67,56,202,0.25)',
          display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
        }}>
          <div style={{ background: 'rgba(255,255,255,0.18)', borderRadius: 12, padding: '8px 11px', fontSize: '1.3rem' }}>📒</div>
          <div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 900, color: '#fff', margin: 0, lineHeight: 1.1 }}>Comptables</h1>
            <p style={{ margin: '3px 0 0', fontSize: '0.82rem', color: 'rgba(255,255,255,0.78)' }}>
              Cabinets abonnés à LabFlow Compta · {cabinets.length} cabinet{cabinets.length > 1 ? 's' : ''} · {actives} activé{actives > 1 ? 's' : ''}
            </p>
          </div>
          <button type="button" onClick={() => setNouveau(true)}
            style={{ marginLeft: 'auto', background: '#fff', color: '#4338ca', fontWeight: 800, border: 'none', borderRadius: 10, padding: '10px 18px', fontSize: '0.88rem', cursor: 'pointer', boxShadow: '0 2px 10px rgba(0,0,0,0.12)' }}>
            + Nouveau comptable
          </button>
        </div>

        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: '12px 16px', marginBottom: 16 }}>
          <input value={recherche} onChange={(e) => { setRecherche(e.target.value); setPage(1); }} placeholder="🔍 Rechercher un cabinet, un titulaire, un email, un matricule…"
            style={{ width: '100%', boxSizing: 'border-box', padding: '9px 14px', borderRadius: 20, border: '1px solid #e2e8f0', fontSize: '0.85rem', fontFamily: 'inherit' }} />
        </div>

        {loading && <div className="loading-text">Chargement…</div>}
        {!loading && erreur && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 12, padding: '12px 16px', fontWeight: 600 }}>{erreur}</div>}
        {!loading && !erreur && filtres.length === 0 && (
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: '40px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', marginBottom: 8 }}>📒</div>
            <div style={{ fontWeight: 800, color: '#0f172a' }}>{cabinets.length === 0 ? 'Aucun cabinet comptable' : 'Aucun résultat'}</div>
            <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: 4 }}>
              {cabinets.length === 0 ? 'Créez le premier cabinet avec « Nouveau comptable ».' : 'Ajustez la recherche.'}
            </div>
          </div>
        )}

        {!loading && !erreur && filtres.length > 0 && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))', gap: 16 }}>
              {visibles.map((c) => {
                const active = !!c.activatedAt;
                const mode = MODES[c.abonnement?.modeCompte || 'actif'] || MODES.actif;
                return (
                  <div key={c.id} style={{ background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', boxShadow: '0 2px 12px rgba(15,23,42,0.06)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ height: 4, background: active ? 'linear-gradient(90deg,#4338ca,#7c3aed)' : 'linear-gradient(90deg,#f59e0b,#fbbf24)' }} />
                    <div style={{ padding: '16px 18px 12px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                      <div style={{ width: 46, height: 46, borderRadius: 13, background: '#eef2ff', color: '#4338ca', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>📒</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.95rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.nomAffiche}>{c.nomAffiche}</div>
                        <div style={{ fontSize: '0.76rem', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={`${c.name} · ${c.email}`}>👤 {c.name} · {c.email}</div>
                      </div>
                      {active
                        ? <span style={{ background: '#eef2ff', color: '#4338ca', border: '1px solid #c7d2fe', fontSize: '0.68rem', fontWeight: 700, padding: '3px 9px', borderRadius: 20, whiteSpace: 'nowrap' }}>● Activé</span>
                        : <span style={{ background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a', fontSize: '0.68rem', fontWeight: 700, padding: '3px 9px', borderRadius: 20, whiteSpace: 'nowrap' }}>⏳ En attente</span>}
                    </div>
                    <div style={{ padding: '0 18px 12px', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                      <span style={chip}>📱 {c.phone || '—'}</span>
                      {c.abonnement && <span style={chip}>💳 {fmt(c.abonnement.totalMensuel)}/mois</span>}
                      {c.abonnement && <span style={chip}>👥 {c.abonnement.gerantsEnPlace ?? 0} / {c.abonnement.nbGerants} gérant{c.abonnement.nbGerants > 1 ? 's' : ''}</span>}
                      <span style={chip}>📁 {c.nbDossiers ?? 0} dossier{(c.nbDossiers ?? 0) > 1 ? 's' : ''}</span>
                      <span style={{ ...chip, background: mode.fond, color: mode.couleur, borderColor: 'transparent', fontWeight: 700 }}>{mode.label}</span>
                      {!c.identiteComplete && (
                        <button type="button" onClick={() => setIdentite(c)} title="Raison sociale, matricule fiscal, adresse ou ville manquant"
                          style={{ fontSize: '0.76rem', fontWeight: 700, borderRadius: 8, padding: '3px 9px', background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a', cursor: 'pointer' }}>
                          🪪 Identité à compléter
                        </button>
                      )}
                    </div>
                    <div style={{ marginTop: 'auto', padding: '12px 14px', borderTop: '1px solid #f1f5f9', background: '#fafbfc', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button type="button" onClick={() => setConsulte(c)} style={{ ...action, background: '#fff', color: '#475569', border: '1px solid #e2e8f0' }}>👁 Consulter</button>
                      <button type="button" onClick={() => navigate(`/admin/abonnements?client=${c.id}`)} style={{ ...action, background: '#eef2ff', color: '#4338ca', border: '1px solid #c7d2fe' }} title="Paiements, promotions et mode du compte">💳 Abonnement</button>
                      <button type="button" onClick={() => setGerants({ cabinet: c, nb: c.abonnement?.nbGerants ?? 0, enCours: false, erreur: null })} style={{ ...action, background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0' }}>👥 Gérants</button>
                      {!active && (
                        <button type="button" disabled={envoiId === c.id} onClick={() => renvoyer(c)} style={{ ...action, background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa', opacity: envoiId === c.id ? 0.6 : 1 }}>
                          {envoiId === c.id ? '…' : '✉️ Renvoyer'}
                        </button>
                      )}
                      <button type="button" disabled={suppressionId === c.id} onClick={() => supprimer(c)} title="Supprimer" aria-label={`Supprimer le cabinet ${c.nomAffiche}`} style={{ background: '#fff', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 8, padding: '7px 10px', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer', opacity: suppressionId === c.id ? 0.5 : 1 }}>🗑️</button>
                    </div>
                  </div>
                );
              })}
            </div>
            {filtres.length > PER_PAGE && (
              <div style={{ marginTop: 16, background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                <Pagination total={filtres.length} page={pageSure} perPage={PER_PAGE} onChange={setPage} />
              </div>
            )}
          </>
        )}
      </div>

      {consulte && (
        <div className="modal-overlay" onClick={() => setConsulte(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560, borderRadius: 16 }}>
            <div style={{ background: 'linear-gradient(135deg,#1e1b4b 0%,#4338ca 55%,#7c3aed 100%)', padding: '18px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '0.66rem', fontWeight: 700, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Cabinet comptable</div>
                <div style={{ fontSize: '1rem', fontWeight: 800, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📒 {consulte.nomAffiche}</div>
              </div>
              <button type="button" onClick={() => setConsulte(null)} aria-label="Fermer" style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, color: '#fff', fontSize: '1rem', cursor: 'pointer', padding: '5px 9px' }}>✕</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <section>
                <div style={titreBloc}>Identité</div>
                {[
                  ['Raison sociale', consulte.entreprise?.raisonSociale],
                  ['Nom commercial', consulte.entreprise?.nomCommercial],
                  ['Forme juridique', libelleForme(consulte.entreprise?.formeJuridique)],
                  ['Matricule fiscal', consulte.entreprise?.matriculeFiscal],
                  ['RNE', consulte.entreprise?.rne],
                  ['Adresse', [consulte.entreprise?.adresse, consulte.entreprise?.ville].filter(Boolean).join(', ')],
                  ['Représentant', [consulte.entreprise?.representantNom, consulte.entreprise?.representantQualite].filter(Boolean).join(' — ')],
                ].map(([l, v]) => <Ligne key={l} libelle={l as string} valeur={(v as string) || '—'} />)}
                <button type="button" onClick={() => { setIdentite(consulte); setConsulte(null); }} style={{ ...action, flex: 'none', marginTop: 8, background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a' }}>🪪 Modifier l'identité</button>
              </section>
              <section>
                <div style={titreBloc}>Titulaire</div>
                <Ligne libelle="Nom" valeur={consulte.name} />
                <Ligne libelle="Email" valeur={consulte.email} />
                <Ligne libelle="Téléphone" valeur={consulte.phone || '—'} />
                <Ligne libelle="Compte" valeur={consulte.activatedAt ? `activé le ${new Date(consulte.activatedAt).toLocaleDateString('fr-FR')}` : 'en attente d\'activation'} />
              </section>
              {consulte.abonnement && (
                <section>
                  <div style={titreBloc}>Abonnement LabFlow Compta</div>
                  {consulte.abonnement.postes.map((p) => <Ligne key={p.code} libelle={p.libelle} valeur={fmt(p.montant)} />)}
                  <Ligne libelle="Total mensuel" valeur={fmt(consulte.abonnement.totalMensuel)} fort />
                  <Ligne libelle="Mise en route" valeur={`${fmt(consulte.abonnement.montantOnboarding ?? 0)} · ${STATUTS_MER[consulte.abonnement.statutOnboarding] || consulte.abonnement.statutOnboarding}`} />
                  <Ligne libelle="Depuis le" valeur={new Date(consulte.abonnement.dateDebut).toLocaleDateString('fr-FR')} />
                </section>
              )}
            </div>
          </div>
        </div>
      )}

      {gerants && (
        <div className="modal-overlay" onClick={() => !gerants.enCours && setGerants(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440, borderRadius: 16 }}>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontWeight: 800, fontSize: '1rem', color: '#0f172a' }}>👥 Gérants de « {gerants.cabinet.nomAffiche} »</div>
              <Counter label="Gérants achetés" sub="Le nouveau montant s'applique à partir du mois suivant" value={gerants.nb} onChange={(nb) => setGerants({ ...gerants, nb })} min={gerants.cabinet.abonnement?.gerantsEnPlace ?? 0} max={50} disabled={gerants.enCours} />
              {(gerants.cabinet.abonnement?.gerantsEnPlace ?? 0) > 0 && (
                <div style={{ fontSize: '0.78rem', color: '#64748b', lineHeight: 1.5 }}>
                  {gerants.cabinet.abonnement?.gerantsEnPlace} gérant{(gerants.cabinet.abonnement?.gerantsEnPlace ?? 0) > 1 ? 's sont' : ' est'} en place (désactivés compris) : le titulaire doit en retirer pour descendre en dessous.
                </div>
              )}
              {gerants.erreur && <div style={{ background: '#fee2e2', color: '#dc2626', borderRadius: 8, padding: '8px 12px', fontSize: '0.82rem' }}>{gerants.erreur}</div>}
            </div>
            <div className="modal-footer">
              <button type="button" disabled={gerants.enCours} onClick={() => setGerants(null)} style={{ padding: '9px 18px', borderRadius: 9, border: '1px solid #e2e8f0', background: '#fff', color: '#374151', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}>Annuler</button>
              <button type="button" disabled={gerants.enCours || gerants.nb === (gerants.cabinet.abonnement?.nbGerants ?? 0)} onClick={enregistrerGerants}
                style={{ padding: '9px 20px', borderRadius: 9, border: 'none', background: 'linear-gradient(135deg,#4338ca,#6366f1)', color: '#fff', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', opacity: gerants.enCours ? 0.6 : 1 }}>
                {gerants.enCours ? 'Enregistrement…' : '✓ Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Ligne({ libelle, valeur, fort = false }: { libelle: string; valeur: string; fort?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: '0.84rem', padding: '4px 0', borderBottom: '1px solid #f8fafc' }}>
      <span style={{ color: '#64748b' }}>{libelle}</span>
      <span style={{ color: '#0f172a', fontWeight: fort ? 800 : 600, textAlign: 'right' }}>{valeur}</span>
    </div>
  );
}

const chip: React.CSSProperties = { fontSize: '0.76rem', color: '#475569', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '3px 9px' };
const action: React.CSSProperties = { flex: 1, minWidth: 86, borderRadius: 8, padding: '7px 8px', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer' };
const titreBloc: React.CSSProperties = { fontSize: '0.7rem', fontWeight: 800, color: '#4338ca', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 };
